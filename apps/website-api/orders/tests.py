import json
import uuid
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from catalog.models import MenuItem, Product, Service
from core.crypto import decrypt, encrypt
from core.models import Branch, BranchHours, System
from users.models import CartItem

from .models import Booking, Order, OrderLine
from .services.booking import branches_for, is_slot_available, slots_for_day
from .services.stripe_gateway import to_minor_units
from .views import _booking_amounts


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
            user=self.user, system=self.system, product=self.product, quantity=3,
        )

        response = self._checkout()

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(public_id=response.json()["order_id"])
        self.assertEqual(order.status, Order.STATUS_PENDING)
        self.assertEqual(order.currency, "USD")
        self.assertEqual(order.subtotal, Decimal("30.00"))
        self.assertEqual(order.stripe_session_id, "cs_test_123")

        line = order.lines.get()
        self.assertEqual(line.name, "Bag")
        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.quantity, 3)
        self.assertEqual(line.line_total, Decimal("30.00"))
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
        """`sku` is nullable on Product/Service but NOT NULL on the
        order line, so the snapshot must coalesce rather than pass None through."""
        self.assertIsNone(self.product.sku)
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._checkout()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.get().lines.get().sku, "")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_the_items_sku_is_snapshotted_onto_the_line(self, mock_create):
        self.product.sku = "BAG"
        self.product.save()
        CartItem.objects.create(
            user=self.user, system=self.system, product=self.product,
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

    def test_anonymous_with_nothing_to_buy_is_refused(self):
        """Guest checkout is allowed, but an empty body is still an empty cart.

        A guest has no rows, so `CART_EMPTY` is the only thing an item-less
        anonymous checkout can mean - not 401, which is what this asserted before
        checkout stopped requiring an account.
        """
        self.client.logout()
        response = self.client.post(
            "/api/orders/checkout/", {"locale": "en"},
            content_type="application/json",
            HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CART_EMPTY")
        self.assertFalse(Order.objects.exists())

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

    def test_menu_line_carries_the_items_kind_for_the_detail_link(self):
        """`item_menu_kind` is what lets the order page link to /drink/<slug>
        instead of /food/<slug>. Read live through the FK, so it follows a kind
        change in the CMS - the link has to address the page that exists now, not
        the one that existed at checkout."""
        item = MenuItem.objects.create(
            system=self.system, name="Michelada", slug="o-michelada",
            price=Decimal("6.00"), kind="drink",
        )
        OrderLine.objects.create(
            order=self.order, kind="menu_item", menu_item=item, name="Michelada",
            unit_price=Decimal("6.00"), quantity=1, line_total=Decimal("6.00"),
            currency="USD",
        )

        lines = self.client.get(f"/api/orders/{self.order.public_id}/").json()["lines"]
        by_name = {line["name"]: line for line in lines}

        self.assertEqual(by_name["Michelada"]["item_menu_kind"], "drink")
        # A product line has no menu kind rather than a defaulted "food", so the
        # frontend cannot mistake one for a menu item.
        self.assertIsNone(by_name["Bag"]["item_menu_kind"])

    def test_menu_kind_is_null_once_the_item_is_deleted(self):
        item = MenuItem.objects.create(
            system=self.system, name="Flan", slug="o-flan",
            price=Decimal("4.00"), kind="dessert",
        )
        line = OrderLine.objects.create(
            order=self.order, kind="menu_item", menu_item=item, name="Flan",
            unit_price=Decimal("4.00"), quantity=1, line_total=Decimal("4.00"),
            currency="USD",
        )

        item.delete()

        lines = self.client.get(f"/api/orders/{self.order.public_id}/").json()["lines"]
        row = next(r for r in lines if r["id"] == line.pk)
        # The line still renders in full - only the link to a page that no longer
        # exists goes away, exactly like `item_slug`.
        self.assertEqual(row["name"], "Flan")
        self.assertIsNone(row["item_slug"])
        self.assertIsNone(row["item_menu_kind"])

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


class GuestCheckoutTests(TestCase):
    """Checkout with no account, and who may read the order that comes out.

    The parts worth pinning down are the two that cost something if they are
    wrong: that a guest cannot name a price (the money must come from the
    catalog, never the body), and that an ownerless order's URL is readable
    while an owned one's is not.
    """

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

    def _checkout(self, cart):
        return self.client.post(
            "/api/orders/checkout/",
            {"locale": "en", "cart": cart},
            content_type="application/json",
            HTTP_X_WEBSITE_HOST="acme.test",
        )

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_guest_can_check_out_and_the_order_has_no_owner(self, mock_create):
        response = self._checkout([{"kind": "product", "id": self.product.id, "quantity": 2}])

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get()
        self.assertIsNone(order.user_id)
        self.assertEqual(order.total, Decimal("20.00"))
        # Left blank for Stripe's own page to collect; the webhook fills it in.
        self.assertEqual(order.email, "")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_guest_cannot_name_their_own_price(self, mock_create):
        """The whole reason the browser holds references rather than a cart."""
        response = self._checkout([{
            "kind": "product", "id": self.product.id, "quantity": 1,
            "price": "0.01", "unit_price": "0.01", "line_total": "0.01",
        }])

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.get().total, Decimal("10.00"))

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_another_tenants_item_cannot_be_bought_through_this_host(self, mock_create):
        other = System.objects.create(site_name="Other", host="other.test")
        theirs = Product.objects.create(
            system=other, name="Theirs", slug="theirs",
            price=Decimal("99.00"), currency="USD",
        )

        response = self._checkout([{"kind": "product", "id": theirs.id, "quantity": 1}])

        # The reference resolves to nothing in *this* tenant's catalog, so the
        # cart is empty rather than quietly cross-tenant.
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CART_EMPTY")
        self.assertFalse(Order.objects.exists())

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_guest_order_is_readable_by_its_public_id(self, mock_create):
        self._checkout([{"kind": "product", "id": self.product.id, "quantity": 1}])
        order = Order.objects.get()

        response = self.client.get(
            f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["public_id"], str(order.public_id))

    def test_an_owned_order_is_not_readable_by_a_stranger_with_the_link(self):
        owner = User.objects.create_user("owner", password="x", email="owner@acme.test")
        owner.profile.system = self.system
        owner.profile.save()
        order = Order.objects.create(
            system=self.system, user=owner, currency="USD", total=Decimal("10.00"),
        )

        response = self.client.get(
            f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.status_code, 404)

    def test_a_guest_cannot_delete_an_order_they_can_read(self):
        order = Order.objects.create(
            system=self.system, user=None, currency="USD", total=Decimal("10.00"),
        )

        response = self.client.delete(
            f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())


class ClaimGuestOrderTests(TestCase):
    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = User.objects.create_user("u", password="x", email="Buyer@acme.test")
        self.user.profile.system = self.system
        self.user.profile.save()

    def _guest_order(self, email, **kwargs):
        return Order.objects.create(
            system=self.system, user=None, email=email,
            currency="USD", total=Decimal("10.00"), **kwargs,
        )

    def test_an_order_on_the_same_address_is_claimed_case_insensitively(self):
        from .claims import claim_guest_orders

        order = self._guest_order("buyer@acme.test")

        self.assertEqual(claim_guest_orders(self.user, self.system), 1)
        order.refresh_from_db()
        self.assertEqual(order.user_id, self.user.id)

    def test_an_abandoned_order_with_no_email_is_never_claimed(self):
        """`email` is blank until the webhook copies what Stripe collected, so a
        never-paid guest order has no address anyone could register to sweep up."""
        from .claims import claim_guest_orders

        order = self._guest_order("")

        self.assertEqual(claim_guest_orders(self.user, self.system), 0)
        order.refresh_from_db()
        self.assertIsNone(order.user_id)

    def test_another_tenants_order_on_the_same_address_is_not_claimed(self):
        from .claims import claim_guest_orders

        other = System.objects.create(site_name="Other", host="other.test")
        order = Order.objects.create(
            system=other, user=None, email="buyer@acme.test",
            currency="USD", total=Decimal("10.00"),
        )

        self.assertEqual(claim_guest_orders(self.user, self.system), 0)
        order.refresh_from_db()
        self.assertIsNone(order.user_id)


class OfflineCheckoutTests(TestCase):
    """Pay-in-store / pay-on-delivery: an order placed without Stripe.

    These are the parts unique to the offline path - no session, no webhook, so
    the cart-clear and stock draw-down that the webhook does for an online order
    have to happen at placement instead, and the contact/address the Stripe page
    would have collected come from our own form.
    """

    def setUp(self):
        cache.clear()
        # No Stripe on purpose: an offline order must not need it.
        self.system = System.objects.create(
            site_name="Acme", host="acme.test",
            pay_in_store_enabled=True, pay_on_delivery_enabled=True,
        )
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.user = User.objects.create_user("u", password="x", email="a@acme.test")
        self.user.profile.system = self.system
        self.user.profile.save()
        self.client.force_login(self.user)

    def _post(self, body):
        return self.client.post(
            "/api/orders/checkout/", body,
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    def test_pay_in_store_places_the_order_and_clears_cart_and_stock(self):
        CartItem.objects.create(
            user=self.user, system=self.system, product=self.product, quantity=2,
        )

        response = self._post({
            "locale": "en",
            "payment_method": "in_store",
            "contact": {"name": "Jo", "phone": "555-1234"},
        })

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("url", response.json())
        order = Order.objects.get(public_id=response.json()["order_id"])
        self.assertEqual(order.status, Order.STATUS_PLACED)
        self.assertEqual(order.payment_method, Order.PAYMENT_IN_STORE)
        self.assertEqual(order.shipping_name, "Jo")
        self.assertEqual(order.phone, "555-1234")
        self.assertIsNone(order.paid_at)
        self.assertFalse(order.fulfilled)
        # The two things the webhook would have done, done here instead.
        self.assertFalse(CartItem.objects.filter(user=self.user).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)
        self.assertEqual(response.json()["redirect"], f"/en/orders/{order.public_id}")

    def test_pay_in_store_requires_a_name_and_a_contact_channel(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._post({
            "locale": "en", "payment_method": "in_store",
            "contact": {"name": "Jo"},  # no email or phone
        })

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_pay_on_delivery_requires_an_address(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._post({
            "locale": "en", "payment_method": "on_delivery",
            "contact": {"name": "Jo", "phone": "555-1234"},
        })

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_pay_on_delivery_snapshots_the_delivery_address(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._post({
            "locale": "en", "payment_method": "on_delivery",
            "contact": {"name": "Jo", "phone": "555-1234"},
            "shipping": {"line1": "1 High St", "city": "Springfield", "country": "US"},
        })

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get()
        self.assertEqual(order.payment_method, Order.PAYMENT_ON_DELIVERY)
        self.assertEqual(order.shipping_line1, "1 High St")
        self.assertEqual(order.shipping_city, "Springfield")

    def test_a_disabled_method_is_refused(self):
        self.system.pay_in_store_enabled = False
        self.system.save()
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._post({
            "locale": "en", "payment_method": "in_store",
            "contact": {"name": "Jo", "phone": "555-1234"},
        })

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "METHOD_UNAVAILABLE")
        self.assertFalse(Order.objects.exists())

    def test_guest_can_place_an_offline_order_with_their_own_contact(self):
        self.client.logout()

        response = self._post({
            "locale": "en", "payment_method": "in_store",
            "contact": {"name": "Guest", "email": "guest@x.test"},
            "cart": [{"kind": "product", "id": self.product.id, "quantity": 1}],
        })

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get()
        self.assertIsNone(order.user_id)
        self.assertEqual(order.email, "guest@x.test")
        self.assertEqual(order.status, Order.STATUS_PLACED)


class AdminOrderManagementTests(TestCase):
    """The tenant's order list and the mark-paid / mark-fulfilled actions."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Acme", host="acme.test", pay_in_store_enabled=True,
        )
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.admin = self._make_user("admin@acme.test", self.system, is_admin=True)
        self.order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_IN_STORE, currency="USD",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
        )
        self.client.force_login(self.admin)

    def _make_user(self, email, system, is_admin=False):
        user = User.objects.create_user(f"{system.id}_{email}", password="x", email=email)
        user.profile.system = system
        user.profile.is_admin = is_admin
        user.profile.save()
        return user

    def _action(self, public_id, action):
        return self.client.post(
            f"/api/orders/admin/{public_id}/",
            {"action": action}, content_type="application/json",
        )

    def test_list_returns_the_tenants_orders(self):
        response = self.client.get("/api/orders/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["payment_method"], "in_store")

    def test_a_non_admin_is_forbidden(self):
        self.client.force_login(self._make_user("u@acme.test", self.system))
        self.assertEqual(self.client.get("/api/orders/admin/").status_code, 403)

    def test_another_tenants_order_is_a_404(self):
        theirs = Order.objects.create(
            system=self.other_system, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_IN_STORE, currency="USD",
        )
        self.assertEqual(self._action(theirs.public_id, "mark_paid").status_code, 404)

    def test_mark_paid_moves_an_offline_placed_order_to_paid(self):
        response = self._action(self.order.public_id, "mark_paid")
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)
        self.assertIsNotNone(self.order.paid_at)

    def test_mark_paid_refuses_an_online_order(self):
        online = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING,
            payment_method=Order.PAYMENT_ONLINE, currency="USD",
        )
        response = self._action(online.public_id, "mark_paid")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "ONLINE_ORDER")

    def test_fulfillment_is_independent_of_payment(self):
        # Fulfilled without being paid: a valid state on the two-axis model.
        self._action(self.order.public_id, "mark_fulfilled")
        self.order.refresh_from_db()
        self.assertTrue(self.order.fulfilled)
        self.assertEqual(self.order.status, Order.STATUS_PLACED)
        self.assertIsNotNone(self.order.fulfilled_at)

        self._action(self.order.public_id, "unmark_fulfilled")
        self.order.refresh_from_db()
        self.assertFalse(self.order.fulfilled)
        self.assertIsNone(self.order.fulfilled_at)


class PosCheckoutTests(TestCase):
    """The counter sale: an order rung up by a store associate, not a customer.

    The parts worth pinning down are the ones that separate this from every
    other checkout path - it is the only one whose caller is signed in but is
    *not* the buyer, and the only one that may settle both order axes in a
    single action.
    """

    def setUp(self):
        cache.clear()
        # No Stripe and no offline switches: a counter sale is the tenant taking
        # money in their own shop, so it must not depend on any of them.
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.product = Product.objects.create(
            system=self.system, name="Loaf", slug="loaf",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.admin = self._make_user("admin@acme.test", self.system, is_admin=True)
        self.client.force_login(self.admin)

    def _make_user(self, email, system, is_admin=False):
        user = User.objects.create_user(f"{system.id}_{email}", password="x", email=email)
        user.profile.system = system
        user.profile.is_admin = is_admin
        user.profile.save()
        return user

    def _sell(self, body):
        return self.client.post(
            "/api/orders/admin/pos/", body, content_type="application/json",
        )

    def _action(self, public_id, action):
        return self.client.post(
            f"/api/orders/admin/{public_id}/",
            {"action": action}, content_type="application/json",
        )

    def test_a_non_admin_may_not_ring_up_a_sale(self):
        self.client.force_login(self._make_user("u@acme.test", self.system))
        response = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "cash",
        })
        self.assertEqual(response.status_code, 403)

    def test_a_sale_is_placed_and_priced_from_the_catalog(self):
        response = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 2}],
            "payment_method": "terminal",
        })

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(public_id=response.json()["public_id"])
        self.assertEqual(order.status, Order.STATUS_PLACED)
        self.assertEqual(order.payment_method, Order.PAYMENT_TERMINAL)
        self.assertEqual(order.total, Decimal("20.00"))
        self.assertFalse(order.fulfilled)

    def test_the_sale_belongs_to_no_user(self):
        """The associate is the seller, not the buyer - a counter sale must not
        land in whoever happened to be logged into the till."""
        self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "cash",
        })
        self.assertIsNone(Order.objects.get().user)

    def test_the_associates_own_cart_is_neither_read_nor_cleared(self):
        """The bug this endpoint exists to prevent: `CheckoutView` would have
        sold the associate their own saved items."""
        CartItem.objects.create(
            user=self.admin, system=self.system, product=self.product, quantity=7,
        )

        response = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "cash",
        })

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get()
        self.assertEqual(order.lines.get().quantity, 1)
        self.assertTrue(
            CartItem.objects.filter(user=self.admin, quantity=7).exists()
        )

    def test_the_body_cannot_name_a_price(self):
        response = self._sell({
            "cart": [{
                "kind": "product", "id": self.product.pk,
                "quantity": 1, "unit_price": "0.01", "price": "0.01",
            }],
            "payment_method": "cash",
        })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Order.objects.get().total, Decimal("10.00"))

    def test_stock_is_drawn_down_at_placement(self):
        self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 2}],
            "payment_method": "terminal",
        })
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)

    def test_another_tenants_item_cannot_be_sold(self):
        theirs = Product.objects.create(
            system=self.other_system, name="Theirs", slug="theirs",
            price=Decimal("99.00"), currency="USD",
        )
        response = self._sell({
            "cart": [{"kind": "product", "id": theirs.pk, "quantity": 1}],
            "payment_method": "cash",
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CART_EMPTY")

    def test_an_unavailable_item_is_refused(self):
        self.product.in_stock = False
        self.product.save()
        response = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "cash",
        })
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "OUT_OF_STOCK")

    def test_an_empty_basket_is_refused(self):
        response = self._sell({"cart": [], "payment_method": "cash"})
        self.assertEqual(response.status_code, 400)

    def test_a_customer_payment_method_is_refused(self):
        """The POS rings up counter sales only - it may not mint an order that
        claims to have been paid through Stripe."""
        response = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "online",
        })
        self.assertEqual(response.status_code, 400)

    def test_an_optional_email_is_recorded_for_the_receipt(self):
        self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "cash",
            "contact": {"email": "walkin@example.test", "name": "Jo"},
        })
        order = Order.objects.get()
        self.assertEqual(order.email, "walkin@example.test")
        self.assertEqual(order.shipping_name, "Jo")

    def test_complete_settles_both_axes_at_once(self):
        sale = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "terminal",
        }).json()

        response = self._action(sale["public_id"], "complete")

        self.assertEqual(response.status_code, 200)
        order = Order.objects.get()
        self.assertEqual(order.status, Order.STATUS_PAID)
        self.assertIsNotNone(order.paid_at)
        self.assertTrue(order.fulfilled)
        self.assertIsNotNone(order.fulfilled_at)

    def test_complete_is_refused_on_a_non_counter_order(self):
        """It must not become a way to skip fulfillment tracking on an order
        that still has to be delivered."""
        delivery = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_ON_DELIVERY, currency="USD",
        )
        response = self._action(delivery.public_id, "complete")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "NOT_POS_ORDER")

    def test_complete_is_not_repeatable(self):
        sale = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "cash",
        }).json()
        self._action(sale["public_id"], "complete")

        response = self._action(sale["public_id"], "complete")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "BAD_TRANSITION")

    def test_a_counter_sale_appears_in_the_tenants_order_list(self):
        self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "terminal",
        })
        response = self.client.get("/api/orders/admin/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["payment_method"], "terminal")


class OrderEmailTests(TestCase):
    """The customer-facing order emails: a confirmation when the order is placed
    (or first paid, for an online one) and a fresh copy every time its status
    moves - for guest checkout as much as for a signed-in one, keyed on the
    address the order carries rather than on an account."""

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

    def _make_order(self, *, lines=1, customization=None, **kwargs):
        defaults = dict(
            system=self.system, currency="USD",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
        )
        defaults.update(kwargs)
        order = Order.objects.create(**defaults)
        OrderLine.objects.create(
            order=order, kind="product", product=self.product, name="Bag",
            unit_price=Decimal("10.00"), quantity=1, line_total=Decimal("10.00"),
            currency="USD", customization=customization or [],
        )
        return order

    def _admin(self):
        admin = User.objects.create_user(
            "admin", password="x", email="admin@acme.test",
        )
        admin.profile.system = self.system
        admin.profile.is_admin = True
        admin.profile.save()
        return admin

    def _complete_webhook(self, order, email="buyer@acme.test", payment_status="paid"):
        event = {"type": "checkout.session.completed", "data": {"object": {
            "id": order.stripe_session_id,
            "payment_status": payment_status,
            "payment_intent": "pi_1",
            "customer_details": {"email": email},
        }}}
        with patch("orders.views.verify_webhook", return_value=event):
            return self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

    def test_payment_emails_the_customer_a_full_confirmation(self):
        order = self._make_order(
            stripe_session_id="cs_1",
            customization=[{"name": "Extra cheese", "quantity": 2, "removed": False}],
        )
        self._complete_webhook(order)

        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["buyer@acme.test"])
        ref = str(order.public_id)[:8].upper()
        self.assertIn(ref, msg.subject)
        # The body carries the detail link, the item, and the add-on.
        self.assertIn(f"/orders/{order.public_id}", msg.body)
        self.assertIn("Bag", msg.body)
        self.assertIn("Extra cheese", msg.body)
        # An HTML alternative is attached alongside the plain-text part.
        html = dict((mime, content) for content, mime in msg.alternatives)["text/html"]
        self.assertIn("Bag", html)

    def test_the_confirmation_reply_goes_to_the_store(self):
        self._admin()
        order = self._make_order(stripe_session_id="cs_1")
        self._complete_webhook(order)
        self.assertEqual(mail.outbox[0].reply_to, ["admin@acme.test"])

    def test_a_status_change_emails_the_customer(self):
        self.client.force_login(self._admin())
        order = self._make_order(
            status=Order.STATUS_PLACED, payment_method=Order.PAYMENT_IN_STORE,
            email="guest@acme.test",
        )
        mail.outbox.clear()

        response = self.client.post(
            f"/api/orders/admin/{order.public_id}/",
            {"action": "cancel"}, content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["guest@acme.test"])
        self.assertIn("Cancelado", mail.outbox[0].subject)

    def test_marking_a_pickup_order_fulfilled_emails_that_it_is_ready(self):
        self.client.force_login(self._admin())
        order = self._make_order(
            status=Order.STATUS_PLACED, payment_method=Order.PAYMENT_IN_STORE,
            email="guest@acme.test",  # no shipping address -> pickup
        )
        mail.outbox.clear()

        self.client.post(
            f"/api/orders/admin/{order.public_id}/",
            {"action": "mark_fulfilled"}, content_type="application/json",
        )

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["guest@acme.test"])
        self.assertIn("listo", mail.outbox[0].subject)
        self.assertIn("ready for pickup", mail.outbox[0].body)

    def test_marking_a_delivery_order_fulfilled_emails_that_it_is_on_its_way(self):
        self.client.force_login(self._admin())
        order = self._make_order(
            status=Order.STATUS_PAID, payment_method=Order.PAYMENT_ON_DELIVERY,
            email="buyer@acme.test", shipping_line1="1 Analytical Way",
        )
        mail.outbox.clear()

        self.client.post(
            f"/api/orders/admin/{order.public_id}/",
            {"action": "mark_fulfilled"}, content_type="application/json",
        )

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("en camino", mail.outbox[0].subject)
        self.assertIn("on its way", mail.outbox[0].body)

    def test_un_marking_fulfilled_sends_nothing(self):
        """Reversing the flag is an admin correction, not news to the customer."""
        self.client.force_login(self._admin())
        order = self._make_order(
            status=Order.STATUS_PLACED, payment_method=Order.PAYMENT_IN_STORE,
            email="guest@acme.test", fulfilled=True,
        )
        mail.outbox.clear()

        self.client.post(
            f"/api/orders/admin/{order.public_id}/",
            {"action": "unmark_fulfilled"}, content_type="application/json",
        )

        self.assertEqual(len(mail.outbox), 0)

    def test_completing_a_counter_sale_emails_once(self):
        """`complete` moves both axes at once; the customer should get a single
        email, and it should read as the payment update rather than fulfillment."""
        self.client.force_login(self._admin())
        order = self._make_order(
            status=Order.STATUS_PLACED, payment_method=Order.PAYMENT_CASH,
            email="walkin@acme.test",
        )
        mail.outbox.clear()

        self.client.post(
            f"/api/orders/admin/{order.public_id}/",
            {"action": "complete"}, content_type="application/json",
        )

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Pagado", mail.outbox[0].subject)

    def test_an_order_with_no_address_is_not_emailed(self):
        """An abandoned online checkout never had an address collected, so the
        expiry has no one to notify - and must not raise trying."""
        order = self._make_order(stripe_session_id="cs_2")  # no email
        event = {"type": "checkout.session.expired", "data": {"object": {"id": "cs_2"}}}
        with patch("orders.views.verify_webhook", return_value=event):
            self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_CANCELED)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_guest_offline_checkout_is_confirmed_by_email(self):
        self.system.pay_in_store_enabled = True
        self.system.save()

        response = self.client.post(
            "/api/orders/checkout/",
            {
                "payment_method": "in_store",
                "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
                "contact": {"name": "Jo", "email": "jo@guest.test"},
            },
            content_type="application/json",
            HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["jo@guest.test"])


class BookingAvailabilityTests(TestCase):
    """The slot engine: hours, lunch, notice, horizon and capacity.

    Every case pins `now` to a fixed instant rather than relying on the clock,
    because "is this slot in the future" is half of what the engine decides -
    a test that used the real time would pass or fail depending on the hour it
    was run at.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Downtown", is_main=True,
            timezone="America/Mexico_City", booking_capacity=1,
            booking_slot_minutes=30, booking_min_notice_hours=0,
            booking_max_days_ahead=60,
        )
        # Monday-Friday 09:00-17:00 with an hour for lunch at 13:00.
        for weekday in range(5):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
                break_start=time(13, 0), break_end=time(14, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Haircut", slug="haircut",
            price=Decimal("100.00"), currency="USD", duration=60,
            booking_enabled=True,
        )
        # A Wednesday, comfortably in the future of `self.now`.
        self.day = date(2026, 9, 9)
        self.now = datetime(2026, 9, 1, 12, 0, tzinfo=dt_timezone.utc)

    def _slots(self, **kwargs):
        return slots_for_day(self.service, self.branch, self.day, now=self.now, **kwargs)

    def _local(self, slot):
        return slot.astimezone(ZoneInfo(self.branch.timezone)).strftime("%H:%M")

    def test_slots_run_from_opening_to_the_last_that_fits(self):
        labels = [self._local(s) for s in self._slots()]

        # A 60-minute service on a 30-minute grid: 09:00 through 12:00 before
        # lunch (12:30 would run into it), then 14:00 through 16:00 after.
        self.assertEqual(labels[0], "09:00")
        self.assertEqual(labels[-1], "16:00")
        # 16:30 would end at 17:30, past closing.
        self.assertNotIn("16:30", labels)

    def test_the_lunch_break_is_subtracted(self):
        labels = [self._local(s) for s in self._slots()]

        # 12:30 and 13:00 both overlap the 13:00-14:00 break.
        self.assertNotIn("12:30", labels)
        self.assertNotIn("13:00", labels)
        self.assertIn("12:00", labels)
        self.assertIn("14:00", labels)

    def test_a_closed_weekday_offers_nothing(self):
        sunday = date(2026, 9, 13)
        self.assertEqual(
            slots_for_day(self.service, self.branch, sunday, now=self.now), []
        )

    def test_minimum_notice_trims_the_near_edge(self):
        self.branch.booking_min_notice_hours = 26
        self.branch.save()
        # 12:00 UTC on the 8th is 06:00 in Mexico City; +26h lands at 08:00 local
        # on the 9th, which still clears the 09:00 opening...
        labels = [
            self._local(s)
            for s in slots_for_day(
                self.service, self.branch, self.day,
                now=datetime(2026, 9, 8, 12, 0, tzinfo=dt_timezone.utc),
            )
        ]
        self.assertIn("09:00", labels)

        # ...while a 32-hour notice pushes past it and eats the morning.
        self.branch.booking_min_notice_hours = 32
        self.branch.save()
        labels = [
            self._local(s)
            for s in slots_for_day(
                self.service, self.branch, self.day,
                now=datetime(2026, 9, 8, 12, 0, tzinfo=dt_timezone.utc),
            )
        ]
        self.assertNotIn("09:00", labels)
        self.assertIn("14:00", labels)

    def test_beyond_the_horizon_offers_nothing(self):
        self.branch.booking_max_days_ahead = 3
        self.branch.save()
        self.assertEqual(self._slots(), [])

    def test_a_booking_removes_the_slots_it_overlaps(self):
        taken = self._slots()[0]  # 09:00 local
        self._book(taken)

        labels = [self._local(s) for s in self._slots()]
        # The 60-minute appointment at 09:00 also blocks a start at 09:30, which
        # would run into it.
        self.assertNotIn("09:00", labels)
        self.assertNotIn("09:30", labels)
        self.assertIn("10:00", labels)

    def test_capacity_lets_that_many_overlap(self):
        self.branch.booking_capacity = 2
        self.branch.save()
        nine = self._slots()[0]
        self._book(nine)

        self.assertIn("09:00", [self._local(s) for s in self._slots()])

        self._book(nine)
        self.assertNotIn("09:00", [self._local(s) for s in self._slots()])

    def test_a_canceled_booking_hands_its_slot_back(self):
        nine = self._slots()[0]
        booking = self._book(nine)
        self.assertNotIn("09:00", [self._local(s) for s in self._slots()])

        booking.status = Booking.STATUS_CANCELED
        booking.save()

        self.assertIn("09:00", [self._local(s) for s in self._slots()])

    def test_is_slot_available_agrees_with_the_offered_list(self):
        """The invariant the whole design rests on: what the calendar shows and
        what checkout accepts are the same answer."""
        offered = self._slots()
        for slot in offered:
            self.assertTrue(
                is_slot_available(self.service, self.branch, slot, now=self.now)
            )
        # 12:30 local overlaps lunch and is not offered.
        lunch_edge = datetime(2026, 9, 9, 12, 30, tzinfo=ZoneInfo(self.branch.timezone))
        self.assertFalse(
            is_slot_available(
                self.service, self.branch,
                lunch_edge.astimezone(dt_timezone.utc), now=self.now,
            )
        )

    def test_a_branchless_tenant_still_gets_a_calendar(self):
        """The home business: no Branch rows at all, so the defaults apply."""
        solo_system = System.objects.create(site_name="Solo", host="solo.test")
        solo = Service.objects.create(
            system=solo_system, name="Consult", slug="consult",
            price=Decimal("50.00"), currency="USD", duration=60,
            booking_enabled=True,
        )
        self.assertEqual(branches_for(solo), [])
        self.assertTrue(slots_for_day(solo, None, self.day, now=self.now))

    def _book(self, start_utc, status=Booking.STATUS_PENDING):
        order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
        )
        return Booking.objects.create(
            order=order, service=self.service, branch=self.branch,
            starts_at=start_utc, ends_at=start_utc + timedelta(minutes=60),
            timezone=self.branch.timezone, duration_minutes=60, status=status,
        )


class BookingCheckoutTests(TestCase):
    """Booking a slot: what is accepted, what is refused, and what gets charged."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Acme", host="acme.test", stripe_enabled=True,
        )
        self.system.set_stripe_secret_key("sk_test_123")
        self.system.set_stripe_webhook_secret("whsec_123")
        self.system.save()

        self.branch = Branch.objects.create(
            system=self.system, name="Downtown", is_main=True,
            timezone="UTC", booking_capacity=1, booking_slot_minutes=30,
            booking_min_notice_hours=0, booking_max_days_ahead=60,
        )
        for weekday in range(7):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Haircut", slug="haircut",
            price=Decimal("100.00"), currency="USD", duration=60,
            booking_enabled=True, booking_in_branch=True,
            booking_pay_full=True, booking_pay_deposit=True,
            booking_deposit_percent=30, booking_pay_in_person=True,
        )

    def _slot(self):
        """The first slot the engine actually offers, so a test can never send
        a time the branch was never open for."""
        tomorrow = (timezone.now() + timedelta(days=1)).date()
        for offset in range(7):
            slots = slots_for_day(self.service, self.branch, tomorrow + timedelta(days=offset))
            if slots:
                return slots[0]
        raise AssertionError("the fixture branch offers no slots at all")

    def _book(self, **overrides):
        payload = {
            "service": self.service.pk,
            "branch": self.branch.pk,
            "fulfillment": "branch",
            "starts_at": self._slot().isoformat(),
            "payment_option": "in_person",
            "contact": {"name": "Ada", "email": "ada@example.test", "phone": "555"},
            "locale": "en",
        }
        payload.update(overrides)
        return self.client.post(
            "/api/bookings/checkout/", payload,
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    def test_a_guest_can_book_and_the_order_is_placed(self):
        response = self._book()

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.order.status, Order.STATUS_PLACED)
        self.assertIsNone(booking.order.user)
        self.assertEqual(booking.order.total, Decimal("100.00"))
        # Nothing charged now, everything owed later.
        self.assertEqual(booking.amount_due_now, Decimal("0.00"))
        self.assertEqual(booking.amount_due_later, Decimal("100.00"))
        # The service is snapshotted as an order line, like any other sale.
        self.assertEqual(booking.order.lines.get().name, "Haircut")

    def test_a_service_that_is_not_bookable_is_a_404(self):
        self.service.booking_enabled = False
        self.service.save()
        self.assertEqual(self._book().status_code, 404)

    def test_another_tenants_service_cannot_be_booked(self):
        other = System.objects.create(site_name="Beta", host="beta.test")
        theirs = Service.objects.create(
            system=other, name="Theirs", slug="theirs",
            price=Decimal("10.00"), currency="USD", booking_enabled=True,
        )
        self.assertEqual(self._book(service=theirs.pk).status_code, 404)

    def test_a_branch_the_service_does_not_offer_is_refused(self):
        elsewhere = Branch.objects.create(system=self.system, name="Uptown")
        self.service.booking_branches.set([self.branch])

        response = self._book(branch=elsewhere.pk)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "BRANCH_REQUIRED")

    def test_a_taken_slot_is_refused_even_though_the_body_named_it(self):
        slot = self._slot()
        self.assertEqual(self._book(starts_at=slot.isoformat()).status_code, 201)

        response = self._book(starts_at=slot.isoformat())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "SLOT_UNAVAILABLE")

    def test_a_slot_outside_opening_hours_is_refused(self):
        # 03:00 UTC, hours away from the 09:00-17:00 window.
        night = (timezone.now() + timedelta(days=2)).replace(
            hour=3, minute=0, second=0, microsecond=0,
        )
        response = self._book(starts_at=night.isoformat())

        self.assertEqual(response.status_code, 409)

    def test_a_payment_option_the_tenant_disabled_is_refused(self):
        self.service.booking_pay_full = False
        self.service.save()

        response = self._book(payment_option="full")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PAYMENT_OPTION_UNAVAILABLE")

    def test_on_premises_needs_an_address(self):
        self.service.booking_on_premises = True
        self.service.save()

        response = self._book(fulfillment="on_premises", address="")

        self.assertEqual(response.status_code, 400)
        self.assertIn("address", response.json())

    def test_a_booking_with_no_way_to_reach_the_customer_is_refused(self):
        response = self._book(contact={"name": "Ada", "email": "", "phone": ""})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CONTACT_REQUIRED")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_deposit_charges_the_percentage_and_records_the_rest(self, mocked):
        response = self._book(payment_option="deposit")

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.amount_due_now, Decimal("30.00"))
        self.assertEqual(booking.amount_due_later, Decimal("70.00"))
        # The order still records the full price - the deposit is not a discount.
        self.assertEqual(booking.order.total, Decimal("100.00"))
        self.assertEqual(booking.order.status, Order.STATUS_PENDING)
        # And Stripe is asked for the deposit, not the total.
        self.assertEqual(mocked.call_args.kwargs["charge_amount"], Decimal("30.00"))

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_paying_in_full_sends_the_lines_rather_than_an_amount(self, mocked):
        response = self._book(payment_option="full")

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(mocked.call_args.kwargs["charge_amount"])
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.amount_due_now, Decimal("100.00"))
        self.assertEqual(booking.amount_due_later, Decimal("0.00"))

    def test_a_site_without_stripe_cannot_take_a_deposit(self):
        self.system.stripe_enabled = False
        self.system.save()

        response = self._book(payment_option="deposit")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "PAYMENTS_UNAVAILABLE")
        # And nothing was written - a slot must not be held for a booking that
        # could never be paid for.
        self.assertFalse(Booking.objects.exists())

    def test_the_deposit_split_always_sums_back_to_the_total(self):
        """A percentage of an awkward price must not lose a cent."""
        self.service.price = Decimal("99.99")
        self.service.booking_deposit_percent = 33
        self.service.save()

        now, later = _booking_amounts(Decimal("99.99"), self.service, Booking.PAYMENT_DEPOSIT)

        self.assertEqual(now + later, Decimal("99.99"))
        self.assertEqual(now, Decimal("33.00"))


class BookingAdminTests(TestCase):
    """The CMS bookings screen and its three actions."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.admin = User.objects.create_user("admin", password="x", email="a@acme.test")
        self.admin.profile.system = self.system
        self.admin.profile.is_admin = True
        self.admin.profile.save()
        self.client.force_login(self.admin)

        self.booking = self._make_booking(self.system)

    def _make_booking(self, system):
        order = Order.objects.create(
            system=system, status=Order.STATUS_PLACED, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
            shipping_name="Ada", email="ada@example.test",
        )
        start = timezone.now() + timedelta(days=1)
        return Booking.objects.create(
            order=order, starts_at=start, ends_at=start + timedelta(hours=1),
            timezone="UTC", duration_minutes=60,
        )

    def test_list_returns_only_this_tenants_bookings(self):
        self._make_booking(self.other_system)

        response = self.client.get("/api/bookings/admin/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["customer_name"], "Ada")

    def test_a_non_admin_is_forbidden(self):
        plain = User.objects.create_user("plain", password="x", email="p@acme.test")
        plain.profile.system = self.system
        plain.profile.save()
        self.client.force_login(plain)

        self.assertEqual(self.client.get("/api/bookings/admin/").status_code, 403)

    def test_another_tenants_booking_is_a_404(self):
        theirs = self._make_booking(self.other_system)

        response = self.client.patch(
            f"/api/bookings/admin/{theirs.pk}/",
            {"action": "confirm"}, content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)

    def test_confirm_moves_the_booking_without_touching_the_money(self):
        response = self.client.patch(
            f"/api/bookings/admin/{self.booking.pk}/",
            {"action": "confirm"}, content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.booking.order.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_CONFIRMED)
        # Payment is a separate axis and must not move with the appointment.
        self.assertEqual(self.booking.order.status, Order.STATUS_PLACED)

    def test_complete_also_fulfils_the_order(self):
        self.client.patch(
            f"/api/bookings/admin/{self.booking.pk}/",
            {"action": "complete"}, content_type="application/json",
        )

        self.booking.refresh_from_db()
        self.booking.order.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_COMPLETED)
        self.assertTrue(self.booking.order.fulfilled)
        # Still not paid: the tenant may well be collecting on the day.
        self.assertEqual(self.booking.order.status, Order.STATUS_PLACED)

    def test_cancel_cancels_the_order_with_it(self):
        self.client.patch(
            f"/api/bookings/admin/{self.booking.pk}/",
            {"action": "cancel"}, content_type="application/json",
        )

        self.booking.refresh_from_db()
        self.booking.order.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_CANCELED)
        self.assertEqual(self.booking.order.status, Order.STATUS_CANCELED)
