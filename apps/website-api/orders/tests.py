import json
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase

from catalog.models import Product, ProductVariant, Service
from core.crypto import decrypt, encrypt
from core.models import System
from users.models import CartItem

from .models import Order, OrderLine
from .services.stripe_gateway import to_minor_units


class CryptoTests(TestCase):
    """The Fernet layer the Stripe secrets rest on."""

    def test_round_trip(self):
        self.assertEqual(decrypt(encrypt("sk_test_abc123")), "sk_test_abc123")

    def test_ciphertext_does_not_contain_the_plaintext(self):
        """The whole point: a DB dump must not spill the key."""
        self.assertNotIn("sk_test_abc123", encrypt("sk_test_abc123"))

    def test_each_encryption_is_distinct(self):
        """Fernet is randomised, so equal secrets must not produce equal rows."""
        self.assertNotEqual(encrypt("same"), encrypt("same"))


class SystemStripeCredentialTests(TestCase):
    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def test_secrets_are_stored_encrypted_and_read_back(self):
        self.system.set_stripe_secret_key("sk_test_123")
        self.system.set_stripe_webhook_secret("whsec_123")
        self.system.save()

        fresh = System.objects.get(pk=self.system.pk)
        self.assertNotIn("sk_test_123", fresh.stripe_secret_key_encrypted)
        self.assertEqual(fresh.stripe_secret_key, "sk_test_123")
        self.assertEqual(fresh.stripe_webhook_secret, "whsec_123")

    def test_blank_clears_rather_than_encrypting_an_empty_string(self):
        self.system.set_stripe_secret_key("sk_test_123")
        self.system.set_stripe_secret_key("")
        self.assertEqual(self.system.stripe_secret_key_encrypted, "")
        self.assertEqual(self.system.stripe_secret_key, "")

    def test_stripe_configured_needs_the_switch_and_both_secrets(self):
        self.assertFalse(self.system.stripe_configured)

        self.system.stripe_enabled = True
        self.system.set_stripe_secret_key("sk_test_123")
        # A site that can charge but can never confirm is not configured: the
        # order would take money and sit pending forever.
        self.assertFalse(self.system.stripe_configured)

        self.system.set_stripe_webhook_secret("whsec_123")
        self.assertTrue(self.system.stripe_configured)


class SystemSerializerLeakTests(TestCase):
    """GET /api/system/ is public. Nothing secret may ever appear in it."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test", stripe_enabled=True)
        self.system.set_stripe_secret_key("sk_test_supersecret")
        self.system.set_stripe_webhook_secret("whsec_supersecret")
        self.system.save()

    def test_public_system_payload_never_carries_stripe_secrets(self):
        response = self.client.get("/api/system/", HTTP_X_WEBSITE_HOST="acme.test")

        self.assertEqual(response.status_code, 200)
        body = json.dumps(response.json())
        self.assertNotIn("sk_test_supersecret", body)
        self.assertNotIn("whsec_supersecret", body)
        self.assertNotIn("stripe_secret_key", body)
        self.assertNotIn("stripe_webhook_secret", body)

    def test_public_system_payload_reports_only_the_flags(self):
        response = self.client.get("/api/system/", HTTP_X_WEBSITE_HOST="acme.test")

        self.assertTrue(response.json()["stripe_enabled"])
        self.assertTrue(response.json()["stripe_configured"])


class MinorUnitsTests(TestCase):
    def test_two_decimal_currency_is_converted_to_cents(self):
        self.assertEqual(to_minor_units(Decimal("10.99"), "USD"), 1099)

    def test_zero_decimal_currency_is_not_multiplied(self):
        """CLP is in CURRENCY_CHOICES; x100 here would overcharge 100-fold."""
        self.assertEqual(to_minor_units(Decimal("15000"), "CLP"), 15000)


class _StubSession(dict):
    """Stands in for a stripe Checkout Session (attribute *and* key access)."""

    id = "cs_test_123"
    url = "https://checkout.stripe.com/c/pay/cs_test_123"


class CheckoutTests(TestCase):
    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Acme", host="acme.test", stripe_enabled=True,
        )
        self.system.set_stripe_secret_key("sk_test_123")
        self.system.set_stripe_webhook_secret("whsec_123")
        self.system.save()

        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )
        self.variant = ProductVariant.objects.create(
            product=self.product, name="Small", price=Decimal("8.00"),
        )
        self.user = self._make_user("a@acme.test", self.system)
        self.client.force_login(self.user)

    def _make_user(self, email, system):
        user = User.objects.create_user(f"{system.id}_{email}", password="x", email=email)
        user.profile.system = system
        user.profile.save()
        return user

    def _checkout(self):
        return self.client.post(
            "/api/orders/checkout/", {"locale": "en"}, content_type="application/json",
        )

    def test_empty_cart_is_refused(self):
        response = self._checkout()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CART_EMPTY")

    def test_site_without_stripe_cannot_check_out(self):
        self.system.stripe_enabled = False
        self.system.save()
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._checkout()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "PAYMENTS_UNAVAILABLE")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_checkout_snapshots_the_cart_onto_the_order(self, mock_create):
        CartItem.objects.create(
            user=self.user, system=self.system, product=self.product,
            product_variant=self.variant, quantity=3,
        )

        response = self._checkout()

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(public_id=response.json()["order_id"])
        self.assertEqual(order.status, Order.STATUS_PENDING)
        self.assertEqual(order.currency, "USD")
        self.assertEqual(order.subtotal, Decimal("24.00"))
        self.assertEqual(order.stripe_session_id, "cs_test_123")

        line = order.lines.get()
        self.assertEqual(line.name, "Bag")
        self.assertEqual(line.unit_price, Decimal("8.00"))
        self.assertEqual(line.quantity, 3)
        self.assertEqual(line.line_total, Decimal("24.00"))
        self.assertEqual(response.json()["url"], "https://checkout.stripe.com/c/pay/cs_test_123")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_the_snapshot_survives_a_later_price_change(self, mock_create):
        """The reason lines are snapshotted at all: an order is what was charged,
        not what the catalog says today."""
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        order_id = self._checkout().json()["order_id"]

        self.product.price = Decimal("99.00")
        self.product.name = "Renamed Bag"
        self.product.save()

        line = Order.objects.get(public_id=order_id).lines.get()
        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.name, "Bag")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_null_sku_snapshots_as_blank_rather_than_crashing(self, mock_create):
        """`sku` is nullable on Product/Service/variants but NOT NULL on the
        order line, so the snapshot must coalesce rather than pass None through."""
        self.assertIsNone(self.product.sku)
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._checkout()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.get().lines.get().sku, "")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_variant_without_a_sku_inherits_its_parents(self, mock_create):
        self.product.sku = "BAG"
        self.product.save()
        CartItem.objects.create(
            user=self.user, system=self.system,
            product=self.product, product_variant=self.variant,
        )

        self._checkout()

        self.assertEqual(Order.objects.get().lines.get().sku, "BAG")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_mixed_currency_cart_is_refused(self, mock_create):
        euro_product = Product.objects.create(
            system=self.system, name="Hat", slug="hat",
            price=Decimal("20.00"), currency="EUR",
        )
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        CartItem.objects.create(user=self.user, system=self.system, product=euro_product)

        response = self._checkout()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "MIXED_CURRENCY")
        self.assertEqual(response.json()["currencies"], ["EUR", "USD"])
        self.assertFalse(Order.objects.exists())
        mock_create.assert_not_called()

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_an_item_that_sold_out_since_it_was_added_is_refused(self, mock_create):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        self.product.in_stock = False
        self.product.save()

        response = self._checkout()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "OUT_OF_STOCK")
        self.assertFalse(Order.objects.exists())

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_service_is_always_orderable(self, mock_create):
        service = Service.objects.create(
            system=self.system, name="Setup", slug="setup",
            price=Decimal("50.00"), currency="USD",
        )
        CartItem.objects.create(user=self.user, system=self.system, service=service)

        response = self._checkout()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.get().lines.get().kind, "service")

    def test_anonymous_cannot_check_out(self):
        self.client.logout()
        self.assertIn(self._checkout().status_code, (401, 403))

    @patch("orders.views.create_checkout_session")
    def test_a_stripe_failure_leaves_no_phantom_order(self, mock_create):
        from .services.stripe_gateway import StripeGatewayError

        mock_create.side_effect = StripeGatewayError("card_declined internals")
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._checkout()

        self.assertEqual(response.status_code, 502)
        self.assertFalse(Order.objects.exists())
        # The upstream detail is logged, not handed to the browser.
        self.assertNotIn("internals", json.dumps(response.json()))


class WebhookTests(TestCase):
    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Acme", host="acme.test", stripe_enabled=True,
        )
        self.system.set_stripe_secret_key("sk_test_123")
        self.system.set_stripe_webhook_secret("whsec_123")
        self.system.save()

        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.user = User.objects.create_user("a", password="x", email="a@acme.test")
        self.user.profile.system = self.system
        self.user.profile.save()

        self.order = Order.objects.create(
            system=self.system, user=self.user, currency="USD",
            subtotal=Decimal("20.00"), total=Decimal("20.00"),
            stripe_session_id="cs_test_123",
        )
        OrderLine.objects.create(
            order=self.order, kind="product", product=self.product, name="Bag",
            unit_price=Decimal("10.00"), quantity=2, line_total=Decimal("20.00"),
            currency="USD",
        )
        self.cart_line = CartItem.objects.create(
            user=self.user, system=self.system, product=self.product, quantity=2,
        )

    def _url(self, token=None):
        return f"/api/orders/stripe/webhook/{token or self.system.stripe_webhook_token}/"

    def _event(self, event_type="checkout.session.completed", **session):
        payload = {
            "id": "cs_test_123",
            "payment_status": "paid",
            "payment_intent": "pi_test_123",
            "customer_details": {"email": "buyer@acme.test"},
            "collected_information": {
                "shipping_details": {
                    "name": "Ada Lovelace",
                    "address": {
                        "line1": "1 Analytical Way", "line2": "",
                        "city": "London", "state": "", "postal_code": "E1 6AN",
                        "country": "GB",
                    },
                },
            },
        }
        payload.update(session)
        return {"type": event_type, "data": {"object": payload}}

    def _post(self, event, token=None):
        with patch("orders.views.verify_webhook", return_value=event):
            return self.client.post(
                self._url(token), data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

    def test_a_completed_session_marks_the_order_paid(self):
        response = self._post(self._event())

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)
        self.assertIsNotNone(self.order.paid_at)
        self.assertEqual(self.order.stripe_payment_intent_id, "pi_test_123")
        self.assertEqual(self.order.email, "buyer@acme.test")
        self.assertEqual(self.order.shipping_city, "London")
        self.assertEqual(self.order.shipping_country, "GB")

    def test_payment_clears_the_cart_and_draws_down_stock(self):
        self._post(self._event())

        self.assertFalse(CartItem.objects.filter(user=self.user).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)

    def test_stock_never_goes_negative(self):
        self.product.stock_count = 1
        self.product.save()

        self._post(self._event())

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 0)

    def test_a_redelivered_event_does_not_apply_twice(self):
        """Stripe retries on any non-2xx and can double-send. A second delivery
        must not re-decrement stock or re-clear a cart refilled since."""
        self._post(self._event())
        refilled = CartItem.objects.create(
            user=self.user, system=self.system, product=self.product, quantity=1,
        )

        self._post(self._event())

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)
        self.assertTrue(CartItem.objects.filter(pk=refilled.pk).exists())

    def test_an_unpaid_completed_session_stays_pending(self):
        """A delayed payment method can complete the session without the money
        having moved; treating that as paid would ship on a promise."""
        self._post(self._event(payment_status="unpaid"))

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PENDING)
        self.assertTrue(CartItem.objects.filter(pk=self.cart_line.pk).exists())

    def test_an_invalid_signature_is_rejected_and_changes_nothing(self):
        with patch("orders.views.verify_webhook", side_effect=ValueError("bad sig")):
            response = self.client.post(
                self._url(), data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=forged",
            )

        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PENDING)

    def test_an_event_cannot_reach_another_tenants_order(self):
        """Even a validly-signed event: the order lookup is scoped to the System
        whose secret verified it."""
        other = System.objects.create(site_name="Other", host="other.test", stripe_enabled=True)
        other.set_stripe_secret_key("sk_test_other")
        other.set_stripe_webhook_secret("whsec_other")
        other.save()

        response = self._post(self._event(), token=other.stripe_webhook_token)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PENDING)

    def test_an_expired_session_cancels_the_order(self):
        self._post(self._event(event_type="checkout.session.expired"))

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_CANCELED)

    def test_an_expired_event_cannot_undo_a_paid_order(self):
        self._post(self._event())
        self._post(self._event(event_type="checkout.session.expired"))

        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)

    def test_an_unhandled_event_type_is_acknowledged(self):
        """A 4xx would make Stripe retry an event we simply do not act on."""
        response = self._post(self._event(event_type="payment_intent.created"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["received"])

    def test_an_unknown_system_is_404(self):
        response = self.client.post(
            self._url(token=uuid.uuid4()), data="{}", content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)


class OrderReadTests(TestCase):
    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = self._make_user("a@acme.test", self.system)
        self.other_user = self._make_user("b@acme.test", self.system)
        self.order = Order.objects.create(
            system=self.system, user=self.user, currency="USD",
            subtotal=Decimal("20.00"), total=Decimal("20.00"),
        )
        OrderLine.objects.create(
            order=self.order, kind="product", name="Bag",
            unit_price=Decimal("10.00"), quantity=2, line_total=Decimal("20.00"),
            currency="USD",
        )
        self.client.force_login(self.user)

    def _make_user(self, email, system):
        user = User.objects.create_user(f"{system.id}_{email}", password="x", email=email)
        user.profile.system = system
        user.profile.save()
        return user

    def test_list_returns_the_users_orders(self):
        response = self.client.get("/api/orders/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["item_count"], 2)

    def test_detail_returns_lines(self):
        response = self.client.get(f"/api/orders/{self.order.public_id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["lines"][0]["name"], "Bag")
        self.assertEqual(response.json()["total"], "20.00")

    def test_detail_never_exposes_stripe_ids(self):
        self.order.stripe_session_id = "cs_test_secret"
        self.order.stripe_payment_intent_id = "pi_test_secret"
        self.order.save()

        body = json.dumps(self.client.get(f"/api/orders/{self.order.public_id}/").json())

        self.assertNotIn("cs_test_secret", body)
        self.assertNotIn("pi_test_secret", body)

    def test_detail_is_addressed_by_public_id_not_the_sequential_pk(self):
        response = self.client.get(f"/api/orders/{self.order.public_id}/")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["public_id"], str(self.order.public_id))
        # The sequential pk stays server-side - never serialised, and its route
        # no longer resolves.
        self.assertNotIn("id", body)
        self.assertEqual(self.client.get(f"/api/orders/{self.order.pk}/").status_code, 404)

    def test_another_users_order_is_not_found(self):
        self.client.force_login(self.other_user)

        response = self.client.get(f"/api/orders/{self.order.public_id}/")

        self.assertEqual(response.status_code, 404)

    def test_a_line_outlives_its_deleted_product(self):
        """SET_NULL, not CASCADE: deleting a product must not delete the record
        that it was once sold."""
        product = Product.objects.create(
            system=self.system, name="Bag", slug="bag2", price=Decimal("10.00"),
        )
        line = OrderLine.objects.create(
            order=self.order, kind="product", product=product, name="Bag",
            unit_price=Decimal("10.00"), quantity=1, line_total=Decimal("10.00"),
            currency="USD",
        )

        product.delete()

        line.refresh_from_db()
        self.assertIsNone(line.product_id)
        self.assertEqual(line.name, "Bag")
        self.assertEqual(line.unit_price, Decimal("10.00"))


class OrderDeleteTests(TestCase):
    """DELETE /api/orders/<public_id>/ - a customer removing their own order.

    The one rule with teeth: a paid (or refunded) order is money that changed
    hands and cannot be erased; only an order that never completed payment may
    be deleted.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = self._make_user("a@acme.test", self.system)
        self.other_user = self._make_user("b@acme.test", self.system)
        self.client.force_login(self.user)

    def _make_user(self, email, system):
        user = User.objects.create_user(f"{system.id}_{email}", password="x", email=email)
        user.profile.system = system
        user.profile.save()
        return user

    def _order(self, status):
        order = Order.objects.create(
            system=self.system, user=self.user, status=status,
            currency="USD", subtotal=Decimal("20.00"), total=Decimal("20.00"),
        )
        OrderLine.objects.create(
            order=order, kind="product", name="Bag",
            unit_price=Decimal("10.00"), quantity=2, line_total=Decimal("20.00"),
            currency="USD",
        )
        return order

    def test_pending_order_is_deleted_with_its_lines(self):
        order = self._order(Order.STATUS_PENDING)

        response = self.client.delete(f"/api/orders/{order.public_id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Order.objects.filter(pk=order.pk).exists())
        self.assertFalse(OrderLine.objects.filter(order_id=order.pk).exists())

    def test_failed_and_canceled_orders_are_deletable(self):
        for st in (Order.STATUS_FAILED, Order.STATUS_CANCELED):
            order = self._order(st)
            response = self.client.delete(f"/api/orders/{order.public_id}/")
            self.assertEqual(response.status_code, 204, st)
            self.assertFalse(Order.objects.filter(pk=order.pk).exists(), st)

    def test_a_paid_order_cannot_be_deleted(self):
        order = self._order(Order.STATUS_PAID)

        response = self.client.delete(f"/api/orders/{order.public_id}/")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "ORDER_NOT_DELETABLE")
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())

    def test_a_refunded_order_cannot_be_deleted(self):
        order = self._order(Order.STATUS_REFUNDED)

        response = self.client.delete(f"/api/orders/{order.public_id}/")

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())

    def test_another_users_order_is_a_404_not_a_403(self):
        """Scoped to the caller, so the endpoint cannot be used to probe which
        order ids exist - a stranger's id is simply absent, never forbidden."""
        order = self._order(Order.STATUS_PENDING)
        self.client.force_login(self.other_user)

        response = self.client.delete(f"/api/orders/{order.public_id}/")

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())

    def test_delete_evicts_the_cached_order_list(self):
        order = self._order(Order.STATUS_PENDING)
        # Prime the list cache, then confirm the delete drops the row from it.
        self.assertEqual(len(self.client.get("/api/orders/").json()), 1)

        self.client.delete(f"/api/orders/{order.public_id}/")

        self.assertEqual(self.client.get("/api/orders/").json(), [])
