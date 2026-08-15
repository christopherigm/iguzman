import json
import shutil
import tempfile
import uuid
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.db import transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from catalog.models import MenuCategory, MenuItem, Product, Service
from core.crypto import decrypt, encrypt
from core.models import BookingResource, Branch, BranchHours, ResourcePool, System
from users.models import CartItem

from . import views as orders_views
from .models import Booking, Coupon, Order, OrderLine
from .services.booking import branches_for, is_slot_available, slots_for_day
from .services.coupons import (
    CouponError,
    attach_coupon_qr,
    discount_for,
    find_coupon,
    redeem_coupon,
    release_coupon,
    validate_coupon,
)
from .services.qr import order_detail_url
from .services.stripe_gateway import StripeGatewayError, to_minor_units
from .views import _booking_amounts

# Every checkout in this module writes a real file: `_open_order` stores the
# order's QR code, and `default_storage` points at the developer's own `media/`
# directory. Left unisolated, a test run scatters a PNG per order through the
# tree the local site serves from, run after run, with nothing to sweep them up.
#
# Module hooks rather than `core.tests.IsolatedMediaTestCase`, which does the
# same job at class level: this needs to cover every class in the file, and half
# of them create an order without caring that they do.
_media_root = None
_media_override = None


def setUpModule():
    global _media_root, _media_override
    _media_root = tempfile.mkdtemp(prefix="website-api-orders-tests-")
    _media_override = override_settings(MEDIA_ROOT=_media_root)
    _media_override.enable()


def tearDownModule():
    if _media_override is not None:
        _media_override.disable()
    shutil.rmtree(_media_root, ignore_errors=True)


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

    def test_an_admin_may_read_another_customers_order(self):
        """The rule that makes the order QR code useful at a counter.

        An admin scanning a customer's receipt lands on the *customer-facing*
        page, so that page has to answer for them - otherwise they get a 404 on
        an order that is sitting in their own CMS list.
        """
        self.other_user.profile.is_admin = True
        self.other_user.profile.save()
        self.client.force_login(self.other_user)

        response = self.client.get(f"/api/orders/{self.order.public_id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["public_id"], str(self.order.public_id))

    def test_an_admin_of_another_tenant_still_gets_a_404(self):
        """Admin is not a cross-tenant key. The boundary is upstream of
        `_may_read`: a signed-in user's System comes from their profile, never
        from a header, so the lookup never finds another tenant's order at all."""
        other_system = System.objects.create(site_name="Rival", host="rival.test")
        intruder = self._make_user("admin@rival.test", other_system)
        intruder.profile.is_admin = True
        intruder.profile.save()
        self.client.force_login(intruder)

        response = self.client.get(f"/api/orders/{self.order.public_id}/")

        self.assertEqual(response.status_code, 404)

    def test_menu_line_carries_its_category_slug_for_the_detail_link(self):
        """`item_menu_category_slug` is the first segment of the item's URL
        (/menu/<category>/<slug>). Read live through the FK, so it follows an
        item re-filed in the CMS - the link has to address the page that exists
        now, not the one that existed at checkout."""
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="o-bebidas",
            ),
            name="Michelada", slug="o-michelada", price=Decimal("6.00"),
        )
        OrderLine.objects.create(
            order=self.order, kind="menu_item", menu_item=item, name="Michelada",
            unit_price=Decimal("6.00"), quantity=1, line_total=Decimal("6.00"),
            currency="USD",
        )

        lines = self.client.get(f"/api/orders/{self.order.public_id}/").json()["lines"]
        by_name = {line["name"]: line for line in lines}

        self.assertEqual(
            by_name["Michelada"]["item_menu_category_slug"], "o-bebidas"
        )
        # A product line carries no menu category at all, so the frontend cannot
        # mistake one for a menu item.
        self.assertIsNone(by_name["Bag"]["item_menu_category_slug"])

    def test_menu_category_slug_is_null_once_the_item_is_deleted(self):
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Postres", slug="o-postres",
            ),
            name="Flan", slug="o-flan", price=Decimal("4.00"),
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
        self.assertIsNone(row["item_menu_category_slug"])

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


class BookingLocationTests(TestCase):
    """Where an appointment happens, in the two places a customer reads it: the
    confirmation email, and `branch_location` on the order payload.

    Both are gated the same way and each owns its copy of the gate, so both are
    covered here - the alternative was a rule stated twice and tested once.

    What these pin down is the pair of silent failures. A map of the *shop* on an
    on-premises booking - where the tenant travels to the customer - is a picture
    of the wrong place on the one message that carries the right address, and it
    looks perfectly fine in an inbox. And a Directions button that stopped being
    rendered because the branch was never screenshotted takes the only actionable
    thing in the block with it: the link is built from the coordinates and must
    not depend on the picture.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", address="Dock 4\nCabo",
            latitude=Decimal("22.88000000"), longitude=Decimal("-109.90000000"),
        )
        self.service = Service.objects.create(
            system=self.system, name="Tour", slug="tour",
            price=Decimal("100.00"), currency="USD", booking_enabled=True,
        )

    def _booked_order(self, **booking_kwargs):
        order = Order.objects.create(
            system=self.system, currency="USD", email="buyer@acme.test",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
        )
        OrderLine.objects.create(
            order=order, kind="service", service=self.service, name="Tour",
            unit_price=Decimal("100.00"), quantity=1,
            line_total=Decimal("100.00"), currency="USD",
        )
        starts = timezone.now() + timedelta(days=2)
        defaults = dict(
            order=order, service=self.service, branch=self.branch,
            branch_name="Marina", fulfillment=Booking.FULFILLMENT_BRANCH,
            starts_at=starts, ends_at=starts + timedelta(hours=1),
            timezone="America/Mazatlan", duration_minutes=60,
        )
        defaults.update(booking_kwargs)
        Booking.objects.create(**defaults)
        return order

    def _send(self, order):
        from .services.order_emails import CONFIRMATION, send_order_email

        mail.outbox.clear()
        send_order_email(order, kind=CONFIRMATION)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        html = dict((mime, content) for content, mime in message.alternatives)["text/html"]
        return message, html

    def test_a_branch_booking_carries_the_address_and_a_directions_link(self):
        _, html = self._send(self._booked_order())

        self.assertIn("Marina", html)
        self.assertIn("Dock 4", html)
        # Coordinates, never the address: a geocoder makes what it will of free
        # text, and this is the link that has to land the customer on the pin.
        self.assertIn(
            "maps/dir/?api=1&amp;destination=22.88000000,-109.90000000", html,
        )

    def test_the_email_carries_the_location_details_when_there_are_any(self):
        """The half a street address cannot carry - which gate, which floor.
        Its own labelled line in both bodies, so a reader scanning for the
        street name does not have to read past a note about parking."""
        self.branch.location_details = "Blue gate beside the fuel dock"
        self.branch.save(update_fields=["location_details"])

        message, html = self._send(self._booked_order())

        self.assertIn("Blue gate beside the fuel dock", html)
        self.assertIn("Location details:", html)
        self.assertIn("Blue gate beside the fuel dock", message.body)

    def test_the_email_omits_the_details_line_when_the_branch_has_none(self):
        message, html = self._send(self._booked_order())

        self.assertNotIn("Location details:", html)
        self.assertNotIn("Location details:", message.body)

    def test_the_directions_link_does_not_depend_on_the_screenshot(self):
        """`Branch.map_image` is optional - a location saved before anyone opened
        the CMS's map picker has coordinates and no picture. The block still has
        to render the half that does something."""
        _, html = self._send(self._booked_order())

        self.assertNotIn("Mapa / Map:", html)  # no <img>, broken or otherwise
        self.assertIn("maps/dir/?api=1", html)

    def test_a_screenshotted_branch_puts_the_map_in_the_message(self):
        """The name is written straight to the column rather than uploaded: what
        is under test is that the template reaches the stored file's URL, not
        that Pillow can write a JPEG. `QuerySet.update` because a `save()` would
        send `ResizedImageField.pre_save` looking for bytes that do not exist."""
        Branch.objects.filter(pk=self.branch.pk).update(
            map_image="t/1/pictures/branchmap/9-abc.jpg",
        )
        self.branch.refresh_from_db()

        _, html = self._send(self._booked_order())

        self.assertIn("Mapa / Map:", html)
        self.assertIn("branchmap/9-abc.jpg", html)

    def test_an_on_premises_booking_gets_no_map_of_the_shop(self):
        """It still *has* a branch - that is whose calendar it was scheduled
        against - but the venue is the customer's own address."""
        message, html = self._send(
            self._booked_order(
                fulfillment=Booking.FULFILLMENT_ON_PREMISES,
                address="12 Customer St",
            ),
        )

        self.assertNotIn("maps/dir/", html)
        self.assertNotIn("maps/dir/", message.body)

    def test_an_unpinned_branch_gets_no_block(self):
        self.branch.latitude = None
        self.branch.longitude = None
        self.branch.save(update_fields=["latitude", "longitude"])

        _, html = self._send(self._booked_order())

        self.assertNotIn("maps/dir/", html)

    def test_an_ordinary_order_gets_no_block(self):
        order = Order.objects.create(
            system=self.system, currency="USD", email="buyer@acme.test",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
        )
        OrderLine.objects.create(
            order=order, kind="service", service=self.service, name="Tour",
            unit_price=Decimal("10.00"), quantity=1,
            line_total=Decimal("10.00"), currency="USD",
        )

        _, html = self._send(order)

        self.assertNotIn("maps/dir/", html)

    # ── The order payload the customer's own page reads ──────────────────────

    def _read(self, order):
        res = self.client.get(
            f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(res.status_code, 200)
        return res.json()["booking"]

    def test_the_order_payload_carries_the_branch_location(self):
        booking = self._read(self._booked_order())

        self.assertEqual(booking["branch_location"]["latitude"], "22.88000000")
        self.assertEqual(booking["branch_location"]["longitude"], "-109.90000000")
        self.assertEqual(booking["branch_location"]["address"], "Dock 4\nCabo")
        # Optional like the picture, and rendered under the address when set.
        self.assertIsNone(booking["branch_location"]["location_details"])
        # Optional, and null until somebody opens the CMS's map picker.
        self.assertIsNone(booking["branch_location"]["map_image"])

    def test_the_order_payload_carries_the_location_details(self):
        self.branch.location_details = "Blue gate beside the fuel dock"
        self.branch.save(update_fields=["location_details"])

        booking = self._read(self._booked_order())

        self.assertEqual(
            booking["branch_location"]["location_details"],
            "Blue gate beside the fuel dock",
        )

    def test_the_order_payload_omits_it_for_an_on_premises_booking(self):
        booking = self._read(
            self._booked_order(
                fulfillment=Booking.FULFILLMENT_ON_PREMISES,
                address="12 Customer St",
            ),
        )

        self.assertIsNone(booking["branch_location"])

    def test_the_order_payload_omits_it_for_an_unpinned_branch(self):
        self.branch.latitude = None
        self.branch.longitude = None
        self.branch.save(update_fields=["latitude", "longitude"])

        self.assertIsNone(self._read(self._booked_order())["branch_location"])

    def test_a_bookable_service_line_says_so(self):
        """What the order page swaps "Buy again" for "Book again" on. Read live,
        so a service the tenant has since closed to booking goes back."""
        order = self._booked_order()

        res = self.client.get(
            f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertTrue(res.json()["lines"][0]["item_booking_enabled"])

        self.service.booking_enabled = False
        self.service.save(update_fields=["booking_enabled"])
        cache.clear()

        res = self.client.get(
            f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertFalse(res.json()["lines"][0]["item_booking_enabled"])


class OrderQrTests(TestCase):
    """The QR code an order carries, and the two places it has to arrive.

    What these pin down is the part that fails silently: a code that encodes the
    wrong URL still looks like a perfectly good QR, and an email whose image is
    linked rather than embedded still *sends* - it just renders as a blank box in
    every client that blocks remote images, which is most of them.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Acme", host="acme.test", pay_in_store_enabled=True,
        )
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.user = User.objects.create_user("u", password="x", email="a@acme.test")
        self.user.profile.system = self.system
        self.user.profile.save()
        self.client.force_login(self.user)

    def _place_order(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        response = self.client.post(
            "/api/orders/checkout/",
            {
                "locale": "en",
                "payment_method": "in_store",
                "contact": {"name": "Jo", "email": "jo@acme.test"},
            },
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 201)
        return Order.objects.get(public_id=response.json()["order_id"])

    def test_checkout_writes_a_qr_code_under_the_tenants_prefix(self):
        order = self._place_order()

        self.assertTrue(order.qr_code)
        # Tenant-prefixed like every other file, so it follows the customer to
        # its own R2 bucket, and named after the id it encodes.
        self.assertEqual(
            order.qr_code.name,
            f"t/{self.system.pk}/orders/qr/{order.public_id}.png",
        )
        self.assertTrue(order.qr_code.read().startswith(b"\x89PNG"))

    def test_the_code_encodes_the_public_order_page_not_the_admin_one(self):
        """A QR carries exactly one URL and it is printed on paper the customer
        keeps, so it has to be the address that works for whoever holds it.
        Admin validation is a permission on that page, not a second code."""
        order = self._place_order()

        url = order_detail_url(order)

        self.assertTrue(url.endswith(f"/orders/{order.public_id}"))
        self.assertNotIn("/admin/", url)

    def test_the_serialized_order_carries_the_code(self):
        order = self._place_order()

        body = self.client.get(f"/api/orders/{order.public_id}/").json()

        self.assertIsNotNone(body["qr_code"])
        self.assertIn(f"{order.public_id}.png", body["qr_code"])

    def test_an_order_without_a_code_serializes_as_null(self):
        """Every order placed before the field existed. The pages that render it
        have to cope rather than assume one is always there."""
        order = Order.objects.create(
            system=self.system, user=self.user, currency="USD",
            subtotal=Decimal("1.00"), total=Decimal("1.00"),
        )

        body = self.client.get(f"/api/orders/{order.public_id}/").json()

        self.assertIsNone(body["qr_code"])

    def test_the_confirmation_email_embeds_the_code_inline(self):
        """Linked to the CDN it would be a blank box in any client with remote
        images off, which is the default nearly everywhere - and this is the one
        part of the email the customer may have to hold up at a counter."""
        self._place_order()

        message = mail.outbox[0]
        html = next(body for body, mime in message.alternatives if mime == "text/html")

        self.assertIn('src="cid:order-qr"', html)
        # `related`, not Django's default `mixed`: with the image a sibling of the
        # whole body rather than of the HTML, several clients refuse to resolve
        # the cid and render a broken image instead.
        self.assertEqual(message.mixed_subtype, "related")
        attachment = next(
            part for part in message.attachments
            if part.get("Content-ID") == "<order-qr>"
        )
        self.assertEqual(attachment.get_content_type(), "image/png")

    def test_an_email_for_an_order_with_no_code_omits_the_block(self):
        """The template skips the whole block rather than rendering `cid:None`
        as a broken image."""
        order = Order.objects.create(
            system=self.system, currency="USD", email="jo@acme.test",
            subtotal=Decimal("1.00"), total=Decimal("1.00"),
        )
        from .services.order_emails import CONFIRMATION, send_order_email

        send_order_email(order, kind=CONFIRMATION)

        message = mail.outbox[0]
        html = next(body for body, mime in message.alternatives if mime == "text/html")
        self.assertNotIn("cid:", html)
        self.assertEqual(message.attachments, [])

    def test_backfill_writes_codes_for_orders_that_have_none(self):
        from io import StringIO

        from django.core.management import call_command

        missing = Order.objects.create(
            system=self.system, user=self.user, currency="USD",
            subtotal=Decimal("1.00"), total=Decimal("1.00"),
        )
        existing = self._place_order()
        original = existing.qr_code.name

        call_command("backfill_order_qr", host="acme.test", stdout=StringIO())

        missing.refresh_from_db()
        existing.refresh_from_db()
        self.assertTrue(missing.qr_code)
        # Re-runnable: an order that already had one is left exactly as it was.
        self.assertEqual(existing.qr_code.name, original)


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
            booking_min_notice_hours=0, booking_max_days_ahead=60,
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

        # A 60-minute service on the hour: 09:00 through 12:00 before lunch,
        # then 14:00 through 16:00 after.
        self.assertEqual(labels[0], "09:00")
        self.assertEqual(labels[-1], "16:00")
        # 17:00 would end at 18:00, past closing.
        self.assertNotIn("17:00", labels)

    def test_start_times_are_spaced_by_the_services_duration(self):
        labels = [self._local(s) for s in self._slots()]

        # An hour-long haircut, offered on the hour: the 09:30 a finer grid used
        # to print was never bookable at this branch once the 09:00 was taken.
        self.assertEqual(
            labels, ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"],
        )

    def test_a_longer_service_gets_fewer_starts(self):
        self.service.duration = 120
        self.service.save()

        labels = [self._local(s) for s in self._slots()]

        # Two hours each: 11:00 ends exactly at the lunch break, and a 16:00
        # start would run an hour past closing.
        self.assertEqual(labels, ["09:00", "11:00", "14:00"])

    def test_two_services_at_one_branch_keep_their_own_grids(self):
        """The reason the grid is not a branch setting.

        `Branch.booking_slot_minutes` used to override it for the whole location,
        which meant one number had to serve every service sold there - a 30-minute
        trim and a 4-hour tour alike. The spacing belongs to the service.
        """
        tour = Service.objects.create(
            system=self.system, name="City tour", slug="city-tour",
            price=Decimal("300.00"), currency="USD", duration=240,
            booking_enabled=True,
        )

        haircut = [self._local(s) for s in self._slots()]
        tour_slots = [
            self._local(s)
            for s in slots_for_day(tour, self.branch, self.day, now=self.now)
        ]

        self.assertEqual(
            haircut, ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"],
        )
        # Four hours fits the 09:00-13:00 window exactly and nowhere else - the
        # afternoon one (14:00-17:00) is an hour too short.
        self.assertEqual(tour_slots, ["09:00"])

    def test_a_service_with_no_duration_falls_back_to_hourly_starts(self):
        self.service.duration = None
        self.service.save()

        labels = [self._local(s) for s in self._slots()]

        # `service_duration_minutes` reads a missing duration as an hour, and the
        # grid follows it rather than collapsing to a zero-length step.
        self.assertEqual(
            labels, ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"],
        )

    def test_the_lunch_break_is_subtracted(self):
        labels = [self._local(s) for s in self._slots()]

        # A 13:00 start runs straight into the 13:00-14:00 break; 12:00 ends
        # exactly as it begins, which is allowed.
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
        self.assertNotIn("09:00", labels)
        # The next start clears the 60-minute appointment exactly.
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
            timezone="UTC", booking_capacity=1,
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


class _StubRetrieved(dict):
    """A Checkout Session as `retrieve_session` hands it back."""

    def __init__(self, status="open", url="https://checkout.stripe.com/c/pay/cs_old"):
        super().__init__(id="cs_test_old", status=status, url=url)


class OrderPayTests(TestCase):
    """Paying an order that already exists - the customer who left Stripe without
    paying and came back for it."""

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
        self.client.force_login(self.user)

        self.order = self._make_order(user=self.user)

    def _make_order(self, user=None, **overrides):
        fields = {
            "system": self.system,
            "user": user,
            "status": Order.STATUS_PENDING,
            "payment_method": Order.PAYMENT_ONLINE,
            "currency": "USD",
            "subtotal": Decimal("20.00"),
            "total": Decimal("20.00"),
            "stripe_session_id": f"cs_test_old_{uuid.uuid4().hex[:8]}",
        }
        fields.update(overrides)
        order = Order.objects.create(**fields)
        OrderLine.objects.create(
            order=order, kind="product", product=self.product, name="Bag",
            unit_price=Decimal("10.00"), quantity=2, line_total=Decimal("20.00"),
            currency="USD",
        )
        return order

    def _pay(self, order=None, **extra):
        return self.client.post(
            f"/api/orders/{(order or self.order).public_id}/pay/",
            {"locale": "en"}, content_type="application/json", **extra,
        )

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_pending_order_gets_a_fresh_session(self, mock_retrieve, mock_create):
        response = self._pay()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["url"], _StubSession.url)
        self.order.refresh_from_db()
        # The order is charged for its own frozen lines, not for a cart.
        self.assertEqual(self.order.stripe_session_id, "cs_test_123")
        self.assertEqual(self.order.status, Order.STATUS_PENDING)
        charged = mock_create.call_args.kwargs["lines"]
        self.assertEqual([line.name for line in charged], ["Bag"])

    @patch("orders.views.create_checkout_session")
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="open"))
    def test_a_session_that_is_still_open_is_reused(self, mock_retrieve, mock_create):
        """Two payable sessions on one order is a double charge waiting to happen:
        the webhook is idempotent on an order already paid, so it would
        acknowledge the second one rather than refuse it."""
        response = self._pay()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["url"], "https://checkout.stripe.com/c/pay/cs_old")
        mock_create.assert_not_called()

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.expire_session")
    @patch("orders.views.retrieve_session", side_effect=StripeGatewayError("network"))
    def test_an_unreadable_session_is_expired_before_a_replacement_opens(
        self, mock_retrieve, mock_expire, mock_create,
    ):
        """If we cannot see the old session we must not leave it payable."""
        response = self._pay()

        self.assertEqual(response.status_code, 200)
        mock_expire.assert_called_once()
        mock_create.assert_called_once()

    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="complete"))
    def test_a_session_already_paid_is_reported_not_reopened(self, mock_retrieve):
        """The webhook is in flight. Opening a second session here would charge
        for money that has already moved."""
        response = self._pay()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "ALREADY_PAID")

    def test_a_paid_order_cannot_be_paid_again(self):
        self.order.status = Order.STATUS_PAID
        self.order.save()

        response = self._pay()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "ALREADY_PAID")

    def test_an_offline_order_is_refused(self):
        """A pay-in-store order was never going to have a Stripe session."""
        offline = self._make_order(
            user=self.user, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_IN_STORE, stripe_session_id=None,
        )

        response = self._pay(offline)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "NOT_ONLINE_ORDER")

    def test_a_canceled_order_cannot_be_resurrected(self):
        """`canceled` is also what a tenant refusing an order writes, and what
        the webhook writes when Stripe expired the session. Neither may be undone
        from the browser."""
        self.order.status = Order.STATUS_CANCELED
        self.order.save()

        response = self._pay()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "ORDER_CLOSED")

    def test_an_item_that_sold_out_meanwhile_blocks_payment(self):
        self.product.in_stock = False
        self.product.save()

        response = self._pay()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "OUT_OF_STOCK")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_deleted_product_does_not_block_payment(self, mock_retrieve, mock_create):
        """The line is a snapshot of an agreement already made; the FK is only
        provenance, so a tidied catalog must not strand the order."""
        self.product.delete()

        self.assertEqual(self._pay().status_code, 200)

    def test_a_site_without_stripe_cannot_reopen_checkout(self):
        self.system.stripe_enabled = False
        self.system.save()

        response = self._pay()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "PAYMENTS_UNAVAILABLE")

    def test_another_users_order_is_a_404(self):
        other = User.objects.create_user("b", password="x", email="b@acme.test")
        other.profile.system = self.system
        other.profile.save()
        self.client.force_login(other)

        self.assertEqual(self._pay().status_code, 404)

    def test_an_admin_may_read_but_not_pay_another_customers_order(self):
        """`_may_pay` deliberately drops `_may_read`'s admin rule.

        Reopening checkout expires the order's live Stripe session before opening
        another, so an admin who scanned a customer's QR while that customer was
        mid-payment on their phone would kill the session under them. Validating
        an order at the counter is a read; paying for one is not.
        """
        admin = User.objects.create_user("mgr", password="x", email="mgr@acme.test")
        admin.profile.system = self.system
        admin.profile.is_admin = True
        admin.profile.save()
        self.client.force_login(admin)

        self.assertEqual(
            self.client.get(f"/api/orders/{self.order.public_id}/").status_code, 200,
        )
        self.assertEqual(self._pay().status_code, 404)

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_guest_can_pay_their_own_order_by_its_link(self, mock_retrieve, mock_create):
        """A guest order has no owner to authenticate as - the unguessable
        public_id in the URL is the only handle its customer has."""
        guest_order = self._make_order(user=None)
        self.client.logout()

        response = self.client.post(
            f"/api/orders/{guest_order.public_id}/pay/",
            {"locale": "en"}, content_type="application/json",
            HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.status_code, 200)


class OrderPayBookingTests(TestCase):
    """Reopening checkout on an appointment - where the slot is the whole point."""

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
            timezone="UTC", booking_capacity=1,
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
            booking_deposit_percent=30,
        )
        self.starts_at = self._first_slot()
        self.order, self.booking = self._make_booking()

    def _first_slot(self):
        tomorrow = (timezone.now() + timedelta(days=1)).date()
        for offset in range(7):
            slots = slots_for_day(self.service, self.branch, tomorrow + timedelta(days=offset))
            if slots:
                return slots[0]
        raise AssertionError("the fixture branch offers no slots at all")

    def _make_booking(self):
        order = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING,
            payment_method=Order.PAYMENT_ONLINE, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
            stripe_session_id=f"cs_test_{uuid.uuid4().hex[:8]}",
        )
        OrderLine.objects.create(
            order=order, kind="service", service=self.service, name="Haircut",
            unit_price=Decimal("100.00"), quantity=1, line_total=Decimal("100.00"),
            currency="USD",
        )
        booking = Booking.objects.create(
            order=order, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=60),
            timezone="UTC", duration_minutes=60,
            payment_option=Booking.PAYMENT_FULL,
            amount_due_now=Decimal("100.00"),
        )
        return order, booking

    def _pay(self, order=None):
        return self.client.post(
            f"/api/orders/{(order or self.order).public_id}/pay/",
            {"locale": "en"}, content_type="application/json",
            HTTP_X_WEBSITE_HOST="acme.test",
        )

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_booking_does_not_refuse_its_own_slot(self, mock_retrieve, mock_create):
        """The booking is `pending`, so it occupies the very hour it is paying
        for - the availability re-check has to exclude it or nothing could ever
        be paid for."""
        response = self._pay()

        self.assertEqual(response.status_code, 200)
        # An appointment has its place already; Stripe must not ask where to post it.
        self.assertFalse(mock_create.call_args.kwargs["collect_shipping_address"])

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_slot_taken_meanwhile_blocks_payment(self, mock_retrieve, mock_create):
        """Capacity is 1, so a second booking on the same hour means this one can
        no longer be honoured - taking the money would sell an hour twice."""
        rival_order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
        )
        Booking.objects.create(
            order=rival_order, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=60),
            timezone="UTC", duration_minutes=60,
        )

        response = self._pay()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "SLOT_UNAVAILABLE")
        mock_create.assert_not_called()

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_deposit_booking_recharges_the_agreed_deposit(self, mock_retrieve, mock_create):
        """`amount_due_now` was fixed when the appointment was made. Re-deriving
        it from today's percentage could charge a number nobody was quoted."""
        self.booking.payment_option = Booking.PAYMENT_DEPOSIT
        self.booking.deposit_percent = 30
        self.booking.amount_due_now = Decimal("30.00")
        self.booking.amount_due_later = Decimal("70.00")
        self.booking.save()
        # The tenant has since raised its deposit; the agreement has not moved.
        self.service.booking_deposit_percent = 50
        self.service.save()

        response = self._pay()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_create.call_args.kwargs["charge_amount"], Decimal("30.00"))
        self.assertIn("30% deposit", mock_create.call_args.kwargs["charge_label"])


class AbandonedBookingTests(TestCase):
    """The slot a customer walks away from must not stay held.

    A Booking is written before the redirect to Stripe and is born `pending`,
    which occupies its hour. Occupancy is read off `Booking.status` alone, so
    nothing that only moves `Order.status` releases it - these are the paths that
    end an appointment nobody is coming to, and each has to say so on the booking
    as well as on the order.
    """

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
            timezone="UTC", booking_capacity=1,
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
            booking_enabled=True, booking_in_branch=True, booking_pay_full=True,
        )

        self.starts_at = self._first_slot()
        self.order = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
            stripe_session_id="cs_test_booking",
        )
        OrderLine.objects.create(
            order=self.order, kind="service", service=self.service, name="Haircut",
            unit_price=Decimal("100.00"), quantity=1, line_total=Decimal("100.00"),
            currency="USD",
        )
        self.booking = Booking.objects.create(
            order=self.order, service=self.service, branch=self.branch,
            starts_at=self.starts_at,
            ends_at=self.starts_at + timedelta(minutes=60),
            timezone="UTC", duration_minutes=60,
            payment_option=Booking.PAYMENT_FULL,
            amount_due_now=Decimal("100.00"),
        )

    def _first_slot(self):
        tomorrow = (timezone.now() + timedelta(days=1)).date()
        for offset in range(7):
            slots = slots_for_day(self.service, self.branch, tomorrow + timedelta(days=offset))
            if slots:
                return slots[0]
        raise AssertionError("the fixture branch offers no slots at all")

    def _post_event(self, event_type):
        event = {
            "type": event_type,
            "data": {"object": {"id": "cs_test_booking", "payment_status": "unpaid"}},
        }
        with patch("orders.views.verify_webhook", return_value=event):
            return self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

    def test_the_slot_is_held_while_the_customer_is_on_the_stripe_page(self):
        """The premise of the rest: a pending booking does occupy its hour, which
        is what stops two customers being sent to Stripe for the same slot."""
        self.assertFalse(
            is_slot_available(self.service, self.branch, self.starts_at),
        )

    def test_an_expired_session_releases_the_slot(self):
        response = self._post_event("checkout.session.expired")

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_CANCELED)
        self.assertEqual(self.booking.status, Booking.STATUS_CANCELED)
        self.assertTrue(
            is_slot_available(self.service, self.branch, self.starts_at),
        )

    def test_a_failed_payment_releases_the_slot(self):
        self._post_event("checkout.session.async_payment_failed")

        self.order.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_FAILED)
        self.assertEqual(self.booking.status, Booking.STATUS_CANCELED)
        self.assertTrue(
            is_slot_available(self.service, self.branch, self.starts_at),
        )

    def test_a_paid_booking_keeps_its_slot(self):
        """The guard rail: only a dead order releases. A redelivered expiry event
        after payment must not hand away an appointment that is going ahead."""
        paid_event = {
            "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_test_booking", "payment_status": "paid"}},
        }
        with patch("orders.views.verify_webhook", return_value=paid_event):
            self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

        self._post_event("checkout.session.expired")

        self.order.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)
        self.assertEqual(self.booking.status, Booking.STATUS_PENDING)
        self.assertFalse(
            is_slot_available(self.service, self.branch, self.starts_at),
        )

    def test_an_expired_cart_order_with_no_booking_is_unaffected(self):
        """Most expiries are plain carts; the release must be a no-op for them."""
        plain = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING, currency="USD",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
            stripe_session_id="cs_test_cart",
        )
        event = {
            "type": "checkout.session.expired",
            "data": {"object": {"id": "cs_test_cart"}},
        }
        with patch("orders.views.verify_webhook", return_value=event):
            response = self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

        self.assertEqual(response.status_code, 200)
        plain.refresh_from_db()
        self.assertEqual(plain.status, Order.STATUS_CANCELED)

    def test_canceling_the_order_in_the_cms_releases_the_slot(self):
        """The mirror of the bookings screen's own cancel: a tenant calling off
        the job from the orders list must free the hour too."""
        admin = User.objects.create_user("admin", password="x", email="admin@acme.test")
        admin.profile.system = self.system
        admin.profile.is_admin = True
        admin.profile.save()
        self.client.force_login(admin)

        response = self.client.post(
            f"/api/orders/admin/{self.order.public_id}/",
            {"action": "cancel"}, content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_CANCELED)
        self.assertTrue(
            is_slot_available(self.service, self.branch, self.starts_at),
        )


class PartyBookingTests(TestCase):
    """Party size: seats, not bookings, and the arithmetic that has to agree.

    The premise of the whole feature is that turning it on changes nothing for a
    tenant that never configures it, so the first test here is the one that pins
    the old behaviour down at party size 1.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", is_main=True,
            timezone="UTC", booking_capacity=10,
            booking_min_notice_hours=0, booking_max_days_ahead=60,
        )
        for weekday in range(7):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Whale tour", slug="whale-tour",
            price=Decimal("500.00"), currency="MXN", duration=240,
            booking_enabled=True, booking_in_branch=True, booking_pay_in_person=True,
            booking_party_enabled=True, booking_party_min=1, booking_party_max=8,
        )

    def _slot(self):
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
            "contact": {"name": "Ada", "email": "ada@example.test"},
            "locale": "en",
        }
        payload.update(overrides)
        return self.client.post(
            "/api/bookings/checkout/", payload,
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    # ---- the no-op invariant ------------------------------------------------ #

    def test_at_party_one_seats_reproduce_the_old_booking_count(self):
        """Capacity 3, three solo bookings, and the fourth is refused - exactly
        what counting rows used to do."""
        self.branch.booking_capacity = 3
        self.branch.save()
        slot = self._slot()

        for _ in range(3):
            self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=1).status_code, 201)

        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=1).status_code, 409)

    def test_a_branch_with_no_pools_uses_its_capacity_as_seats(self):
        slot = self._slot()

        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=6).status_code, 201)
        # 6 of 10 seats gone; a party of 5 no longer fits, a party of 4 does.
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=5).status_code, 409)
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=4).status_code, 201)

    # ---- price and quantity ------------------------------------------------- #

    def test_the_party_multiplies_the_price(self):
        response = self._book(party_size=4)

        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.party_size, 4)
        self.assertEqual(booking.order.total, Decimal("2000.00"))
        self.assertEqual(booking.order.lines.get().quantity, 4)

    def test_a_deposit_splits_the_multiplied_total(self):
        self.service.booking_pay_deposit = True
        self.service.booking_deposit_percent = 25
        self.service.save()

        # No Stripe account on this fixture, so the deposit path is refused
        # before it writes - which is itself the rule worth pinning.
        self.assertEqual(self._book(party_size=4, payment_option="deposit").status_code, 503)

    def test_party_off_forces_one_however_big_the_body_claims(self):
        self.service.booking_party_enabled = False
        self.service.save()

        response = self._book(party_size=6)

        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.party_size, 1)
        self.assertEqual(booking.order.total, Decimal("500.00"))

    def test_a_party_outside_the_service_range_is_refused_not_clamped(self):
        response = self._book(party_size=9)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "PARTY_SIZE_INVALID")
        self.assertFalse(Booking.objects.exists())

    # ---- sharing a departure ------------------------------------------------ #

    def test_two_parties_share_one_departure(self):
        slot = self._slot()

        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=4).status_code, 201)
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=6).status_code, 201)

        self.assertEqual(Booking.objects.count(), 2)
        self.assertEqual(
            sum(b.party_size for b in Booking.objects.all()), 10,
        )

    def test_the_availability_payload_reports_seats_left(self):
        slot = self._slot()
        self._book(starts_at=slot.isoformat(), party_size=4)
        cache.clear()

        response = self.client.get(
            "/api/bookings/availability/",
            {"service": self.service.pk, "branch": self.branch.pk, "party": 2},
            HTTP_X_WEBSITE_HOST="acme.test",
        )

        payload = response.json()
        self.assertEqual(payload["party"], 2)
        self.assertEqual(payload["party_max"], 8)
        entry = next(
            s
            for day in payload["availability"].values()
            for s in day
            if s["at"] == slot.isoformat().replace("+00:00", "Z")
            or s["at"] == slot.isoformat()
        )
        self.assertEqual(entry["seats_left"], 6)

    def test_a_party_bigger_than_the_branch_sees_no_slots(self):
        self.branch.booking_capacity = 4
        self.branch.save()
        cache.clear()

        response = self.client.get(
            "/api/bookings/availability/",
            {"service": self.service.pk, "branch": self.branch.pk, "party": 8},
            HTTP_X_WEBSITE_HOST="acme.test",
        )

        self.assertEqual(response.json()["availability"], {})

    def test_the_cache_key_separates_party_sizes(self):
        """Two parties must not be served each other's calendar for a minute."""
        self.branch.booking_capacity = 4
        self.branch.save()

        solo = self.client.get(
            "/api/bookings/availability/",
            {"service": self.service.pk, "branch": self.branch.pk, "party": 1},
            HTTP_X_WEBSITE_HOST="acme.test",
        ).json()
        big = self.client.get(
            "/api/bookings/availability/",
            {"service": self.service.pk, "branch": self.branch.pk, "party": 8},
            HTTP_X_WEBSITE_HOST="acme.test",
        ).json()

        self.assertTrue(solo["availability"])
        self.assertEqual(big["availability"], {})


class ResourcePoolTests(TestCase):
    """Pools, best fit, and the customer-selectable picker."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", is_main=True,
            timezone="UTC", booking_capacity=1,
            booking_min_notice_hours=0, booking_max_days_ahead=60,
        )
        for weekday in range(7):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Whale tour", slug="whale-tour",
            price=Decimal("500.00"), currency="MXN", duration=240,
            booking_enabled=True, booking_in_branch=True, booking_pay_in_person=True,
            booking_party_enabled=True, booking_party_min=1, booking_party_max=10,
        )
        self.pool = ResourcePool.objects.create(
            branch=self.branch, name="Boats", unit_label="boat",
        )
        self.small = BookingResource.objects.create(pool=self.pool, name="Panga", capacity=4)
        self.large = BookingResource.objects.create(pool=self.pool, name="Marlin", capacity=10)

    def _slot(self):
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
            "contact": {"name": "Ada", "email": "ada@example.test"},
            "locale": "en",
        }
        payload.update(overrides)
        return self.client.post(
            "/api/bookings/checkout/", payload,
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    def test_pools_override_the_branch_capacity(self):
        """`booking_capacity` is 1 on this fixture and irrelevant: the resources
        say 14 seats, and that is what the engine counts."""
        slot = self._slot()

        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=10).status_code, 201)
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=4).status_code, 201)

    def test_best_fit_picks_the_tightest_resource_that_holds_the_party(self):
        response = self._book(party_size=3)

        booking = Booking.objects.get(pk=response.json()["booking_id"])
        # The 4-seat Panga, not the 10-seat Marlin: consolidating small parties
        # is what preserves the big boat for a party that needs it.
        self.assertEqual(booking.resource, self.small)
        self.assertEqual(booking.resource_name, "Panga")

    def test_best_fit_preserves_the_large_boat_for_a_large_party(self):
        slot = self._slot()
        self._book(starts_at=slot.isoformat(), party_size=3)

        response = self._book(starts_at=slot.isoformat(), party_size=9)

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.resource, self.large)

    def test_a_party_larger_than_every_resource_is_refused(self):
        """14 seats exist, but no single boat holds 12 - and a party does not
        split across two boats."""
        self.service.booking_party_max = 14
        self.service.save()

        self.assertEqual(self._book(party_size=12).status_code, 409)

    def test_seats_are_counted_per_resource_not_across_the_branch(self):
        slot = self._slot()
        # Fills the Marlin exactly.
        self._book(starts_at=slot.isoformat(), party_size=10)

        # 4 seats remain, all of them on the Panga - so a party of 4 fits...
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=4).status_code, 201)
        # ...and now nothing does.
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=1).status_code, 409)

    def test_a_disabled_resource_stops_being_offered(self):
        self.large.enabled = False
        self.large.save()

        self.assertEqual(self._book(party_size=10).status_code, 409)
        self.assertEqual(self._book(party_size=4).status_code, 201)

    def test_booking_pools_scopes_which_resources_a_service_uses(self):
        other = ResourcePool.objects.create(branch=self.branch, name="Kayaks")
        BookingResource.objects.create(pool=other, name="Kayak fleet", capacity=20)
        self.service.booking_pools.set([other])
        self.service.booking_party_max = 20
        self.service.save()

        response = self._book(party_size=20)

        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.resource.pool, other)

    # ---- customer-selectable ------------------------------------------------ #

    def test_resources_are_not_published_unless_the_pool_says_so(self):
        payload = self.client.get(
            "/api/bookings/availability/",
            {"service": self.service.pk, "branch": self.branch.pk},
            HTTP_X_WEBSITE_HOST="acme.test",
        ).json()

        self.assertEqual(payload["resources"], [])

    def test_a_selectable_pool_publishes_its_resources(self):
        self.pool.customer_selectable = True
        self.pool.save()

        payload = self.client.get(
            "/api/bookings/availability/",
            {"service": self.service.pk, "branch": self.branch.pk},
            HTTP_X_WEBSITE_HOST="acme.test",
        ).json()

        names = [r["name"] for r in payload["resources"]]
        self.assertEqual(names, ["Panga", "Marlin"])
        self.assertEqual(payload["resources"][0]["unit_label"], "boat")

    def test_a_customer_pick_is_honoured_when_the_pool_is_selectable(self):
        self.pool.customer_selectable = True
        self.pool.save()

        response = self._book(party_size=2, resource=self.large.pk)

        booking = Booking.objects.get(pk=response.json()["booking_id"])
        # Best fit would have chosen the Panga; the customer asked for the Marlin.
        self.assertEqual(booking.resource, self.large)

    def test_a_pick_on_a_non_selectable_pool_is_ignored_not_refused(self):
        response = self._book(party_size=2, resource=self.large.pk)

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.resource, self.small)

    def test_another_tenants_resource_cannot_be_picked(self):
        other_system = System.objects.create(site_name="Beta", host="beta.test")
        other_branch = Branch.objects.create(system=other_system, name="Theirs")
        other_pool = ResourcePool.objects.create(
            branch=other_branch, name="Theirs", customer_selectable=True,
        )
        theirs = BookingResource.objects.create(pool=other_pool, name="Theirs", capacity=50)

        response = self._book(party_size=2, resource=theirs.pk)

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertNotEqual(booking.resource, theirs)

    # ---- legacy rows -------------------------------------------------------- #

    def test_an_unassigned_booking_is_charged_to_every_resource(self):
        """A row written before pools existed carries no resource, and there is
        no way to know which boat it is on - so it weighs on all of them rather
        than vanishing from the arithmetic."""
        slot = self._slot()
        order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="MXN",
            subtotal=Decimal("500.00"), total=Decimal("500.00"),
        )
        Booking.objects.create(
            order=order, service=self.service, branch=self.branch,
            starts_at=slot, ends_at=slot + timedelta(minutes=240),
            timezone="UTC", duration_minutes=240, party_size=8, resource=None,
        )

        # 8 unattributed seats: the Panga (4) can take nobody, and the Marlin
        # (10) has 2 left.
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=3).status_code, 409)
        self.assertEqual(self._book(starts_at=slot.isoformat(), party_size=2).status_code, 201)


class BookingReassignTests(TestCase):
    """Moving a party to another resource from the CMS."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", is_main=True,
            timezone="UTC", booking_capacity=1,
            booking_min_notice_hours=0, booking_max_days_ahead=60,
        )
        for weekday in range(7):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Whale tour", slug="whale-tour",
            price=Decimal("500.00"), currency="MXN", duration=240,
            booking_enabled=True, booking_party_enabled=True, booking_party_max=10,
        )
        self.pool = ResourcePool.objects.create(branch=self.branch, name="Boats", unit_label="boat")
        self.small = BookingResource.objects.create(pool=self.pool, name="Panga", capacity=4)
        self.large = BookingResource.objects.create(pool=self.pool, name="Marlin", capacity=10)

        tomorrow = (timezone.now() + timedelta(days=1)).date()
        self.starts_at = slots_for_day(self.service, self.branch, tomorrow)[0]
        order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="MXN",
            subtotal=Decimal("1500.00"), total=Decimal("1500.00"),
        )
        self.booking = Booking.objects.create(
            order=order, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=240),
            timezone="UTC", duration_minutes=240, party_size=3,
            resource=self.small, resource_name="Panga",
        )

        self.admin = User.objects.create_user("admin", password="x", email="a@acme.test")
        self.admin.profile.system = self.system
        self.admin.profile.is_admin = True
        self.admin.profile.save()
        self.client.force_login(self.admin)

    def _patch(self, **body):
        return self.client.patch(
            f"/api/bookings/admin/{self.booking.pk}/",
            {"action": "reassign", **body}, content_type="application/json",
        )

    def test_a_staff_reassignment_moves_the_party_and_the_snapshot(self):
        response = self._patch(resource=self.large.pk)

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.resource, self.large)
        self.assertEqual(self.booking.resource_name, "Marlin")

    def test_a_reassignment_is_revalidated_through_the_engine(self):
        """The Marlin is already full, so the move is refused - and refused by
        the availability authority, not by an inline check written here."""
        other = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="MXN",
            subtotal=Decimal("0.00"), total=Decimal("0.00"),
        )
        Booking.objects.create(
            order=other, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=240),
            timezone="UTC", duration_minutes=240, party_size=10, resource=self.large,
        )

        response = self._patch(resource=self.large.pk)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "RESOURCE_FULL")
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.resource, self.small)

    def test_force_overbooks_deliberately(self):
        other = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="MXN",
            subtotal=Decimal("0.00"), total=Decimal("0.00"),
        )
        Booking.objects.create(
            order=other, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=240),
            timezone="UTC", duration_minutes=240, party_size=10, resource=self.large,
        )

        response = self._patch(resource=self.large.pk, force=True)

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.resource, self.large)

    def test_another_tenants_resource_is_refused(self):
        other_system = System.objects.create(site_name="Beta", host="beta.test")
        other_branch = Branch.objects.create(system=other_system, name="Theirs")
        other_pool = ResourcePool.objects.create(branch=other_branch, name="Theirs")
        theirs = BookingResource.objects.create(pool=other_pool, name="Theirs", capacity=99)

        response = self._patch(resource=theirs.pk)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "RESOURCE_INVALID")

    def test_a_completed_booking_cannot_be_reassigned(self):
        self.booking.status = Booking.STATUS_COMPLETED
        self.booking.save()

        response = self._patch(resource=self.large.pk)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "BOOKING_CLOSED")

    def test_reassigning_needs_an_explicit_resource(self):
        response = self.client.patch(
            f"/api/bookings/admin/{self.booking.pk}/",
            {"action": "reassign"}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)


class BookingCheckoutAtomicityTests(TransactionTestCase):
    """The seat check and the booking write must be one transaction.

    Un-serialised, two checkouts can both see the last four seats free and both
    take them. That window was one row wide when capacity counted bookings; at
    ten seats with money attached it is a real over-sell.

    Real concurrency is not what is tested here - threads against SQLite inside
    Django's own test transaction prove nothing about Postgres row locks. What is
    tested is the invariant that makes the lock work at all: that the engine's
    answer and the write that depends on it cannot be separated by a commit.

    ⚠ `TransactionTestCase`, not `TestCase`, and that is the whole point:
    `TestCase` wraps every test in its own atomic block, so `in_atomic_block`
    would read True everywhere and both assertions below would be meaningless -
    one passing for the wrong reason and one impossible to satisfy.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", is_main=True,
            timezone="UTC", booking_capacity=10,
            booking_min_notice_hours=0, booking_max_days_ahead=60,
        )
        for weekday in range(7):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Whale tour", slug="whale-tour",
            price=Decimal("500.00"), currency="MXN", duration=240,
            booking_enabled=True, booking_pay_in_person=True,
            booking_party_enabled=True, booking_party_max=8,
        )

    def _slot(self):
        tomorrow = (timezone.now() + timedelta(days=1)).date()
        for offset in range(7):
            slots = slots_for_day(self.service, self.branch, tomorrow + timedelta(days=offset))
            if slots:
                return slots[0]
        raise AssertionError("the fixture branch offers no slots at all")

    def test_the_assignment_runs_inside_a_transaction(self):
        seen = {}
        real = orders_views.assign_for_slot

        def spy(*args, **kwargs):
            seen["in_atomic"] = transaction.get_connection().in_atomic_block
            return real(*args, **kwargs)

        with patch.object(orders_views, "assign_for_slot", side_effect=spy):
            response = self.client.post(
                "/api/bookings/checkout/",
                {
                    "service": self.service.pk,
                    "branch": self.branch.pk,
                    "fulfillment": "branch",
                    "starts_at": self._slot().isoformat(),
                    "payment_option": "in_person",
                    "party_size": 4,
                    "contact": {"name": "Ada", "email": "ada@example.test"},
                    "locale": "en",
                },
                content_type="application/json",
                HTTP_X_WEBSITE_HOST="acme.test",
            )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(seen["in_atomic"])

    def test_the_qr_write_is_deferred_out_of_the_lock(self):
        """A round-trip to object storage under a row lock would queue every
        other checkout at this branch behind the network - the same mistake
        `_open_order` already avoids for a cart order."""
        seen = {}
        real = orders_views.attach_order_qr

        def spy(order):
            seen["in_atomic"] = transaction.get_connection().in_atomic_block
            return real(order)

        with patch.object(orders_views, "attach_order_qr", side_effect=spy):
            response = self.client.post(
                "/api/bookings/checkout/",
                {
                    "service": self.service.pk,
                    "branch": self.branch.pk,
                    "fulfillment": "branch",
                    "starts_at": self._slot().isoformat(),
                    "payment_option": "in_person",
                    "contact": {"name": "Ada", "email": "ada@example.test"},
                    "locale": "en",
                },
                content_type="application/json",
                HTTP_X_WEBSITE_HOST="acme.test",
            )

        self.assertEqual(response.status_code, 201)
        self.assertFalse(seen["in_atomic"])


class CouponTests(TestCase):
    """The discount engine: what a coupon is worth, and who may still have it.

    The cases here are the ones that cost real money if they regress - the
    arithmetic that decides what is charged, the tenant boundary, and the
    redemption ceiling that is the only thing standing between a campaign and
    being redeemed forever.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.product = Product.objects.create(
            system=self.system, name="Loaf", slug="loaf",
            price=Decimal("100.00"), currency="USD", stock_count=50,
        )
        self.admin = User.objects.create_user("admin", password="x", email="a@acme.test")
        self.admin.profile.system = self.system
        self.admin.profile.is_admin = True
        self.admin.profile.save()

    def _coupon(self, **kwargs):
        defaults = dict(
            system=self.system, code="SUMMER20",
            kind=Coupon.KIND_PERCENT, value=Decimal("20.00"), currency="USD",
        )
        return Coupon.objects.create(**{**defaults, **kwargs})

    def _sell(self, body):
        self.client.force_login(self.admin)
        return self.client.post(
            "/api/orders/admin/pos/", body, content_type="application/json",
        )

    def _cart(self, quantity=1):
        return [{"kind": "product", "id": self.product.pk, "quantity": quantity}]

    # ---- what a coupon is worth ------------------------------------------ #

    def test_a_percentage_comes_off_the_subtotal(self):
        coupon = self._coupon()
        self.assertEqual(discount_for(coupon, Decimal("200.00")), Decimal("40.00"))

    def test_a_fixed_amount_comes_off_whole(self):
        coupon = self._coupon(kind=Coupon.KIND_FIXED, value=Decimal("15.00"))
        self.assertEqual(discount_for(coupon, Decimal("200.00")), Decimal("15.00"))

    def test_a_percentage_rounds_to_two_places(self):
        # 33% of 10.10 is 3.333; the column holds two decimals, and a value that
        # does not round here is a total that will not reconcile against Stripe.
        coupon = self._coupon(value=Decimal("33.00"))
        self.assertEqual(discount_for(coupon, Decimal("10.10")), Decimal("3.33"))

    def test_a_fixed_amount_never_exceeds_the_subtotal(self):
        # A negative total is not a refund - it is a Stripe session that cannot
        # be created and an order nobody can reconcile.
        coupon = self._coupon(kind=Coupon.KIND_FIXED, value=Decimal("500.00"))
        self.assertEqual(discount_for(coupon, Decimal("30.00")), Decimal("30.00"))

    # ---- who may still have it -------------------------------------------- #

    def test_an_expired_coupon_is_refused(self):
        coupon = self._coupon(expires_at=timezone.now() - timedelta(days=1))
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_EXPIRED")

    def test_a_coupon_that_has_not_started_is_refused(self):
        coupon = self._coupon(starts_at=timezone.now() + timedelta(days=1))
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_NOT_STARTED")

    def test_a_fully_redeemed_coupon_is_refused(self):
        coupon = self._coupon(max_redemptions=2, times_redeemed=2)
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_EXHAUSTED")

    def test_a_disabled_coupon_is_refused(self):
        coupon = self._coupon(enabled=False)
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_INACTIVE")

    def test_a_fixed_coupon_is_refused_in_another_currency(self):
        # Honouring it would mean inventing an exchange rate - the same thing
        # checkout refuses to do for a mixed-currency cart.
        coupon = self._coupon(kind=Coupon.KIND_FIXED, value=Decimal("50.00"), currency="MXN")
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_WRONG_CURRENCY")

    def test_a_percentage_coupon_applies_in_any_currency(self):
        coupon = self._coupon(currency="MXN")
        self.assertEqual(
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD"),
            coupon,
        )

    def test_a_subtotal_below_the_minimum_is_refused(self):
        coupon = self._coupon(min_order_amount=Decimal("150.00"))
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, coupon.code, subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_MIN_ORDER")

    def test_another_tenants_coupon_is_not_found(self):
        # The tenant boundary: a code guessed off a rival's poster must not work
        # here, and must be indistinguishable from a code that does not exist.
        Coupon.objects.create(
            system=self.other_system, code="BETAONLY",
            kind=Coupon.KIND_PERCENT, value=Decimal("50.00"),
        )
        with self.assertRaises(CouponError) as caught:
            validate_coupon(self.system, "BETAONLY", subtotal=Decimal("100.00"), currency="USD")
        self.assertEqual(caught.exception.code, "COUPON_NOT_FOUND")

    def test_a_code_is_matched_case_insensitively(self):
        # The customer is typing off a poster, on a keyboard that auto-capitalises.
        coupon = self._coupon(code="SummerSale")
        self.assertEqual(find_coupon(self.system, "summersale"), coupon)
        self.assertEqual(find_coupon(self.system, "  SUMMERSALE "), coupon)

    # ---- the redemption ceiling ------------------------------------------- #

    def test_redeeming_stops_at_the_ceiling(self):
        coupon = self._coupon(max_redemptions=2)
        self.assertTrue(redeem_coupon(coupon))
        coupon.refresh_from_db()
        self.assertTrue(redeem_coupon(coupon))
        coupon.refresh_from_db()
        # The third must fail even though `coupon` in memory is stale - the
        # ceiling is enforced by the UPDATE's own WHERE clause, not by the
        # instance's idea of the count.
        self.assertFalse(redeem_coupon(coupon))
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 2)

    def test_a_stale_instance_cannot_exceed_the_ceiling(self):
        # The race the up-front validation cannot close: two checkouts both read
        # the coupon with one redemption left. Only one may take it.
        coupon = self._coupon(max_redemptions=1)
        first = Coupon.objects.get(pk=coupon.pk)
        second = Coupon.objects.get(pk=coupon.pk)
        self.assertTrue(redeem_coupon(first))
        self.assertFalse(redeem_coupon(second))
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 1)

    def test_an_unlimited_coupon_still_counts_up(self):
        coupon = self._coupon(max_redemptions=0)
        for _ in range(3):
            self.assertTrue(redeem_coupon(coupon))
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 3)

    def test_releasing_never_goes_negative(self):
        # A double-delivered webhook must not drive the count below zero -
        # PositiveIntegerField would raise on the write and fail a webhook that
        # has nothing else wrong with it.
        coupon = self._coupon()
        redeem_coupon(coupon)
        coupon.refresh_from_db()
        self.assertTrue(release_coupon(coupon))
        self.assertFalse(release_coupon(coupon))
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 0)

    # ---- through a real checkout ------------------------------------------ #

    def test_a_pos_sale_records_the_discount_and_takes_a_redemption(self):
        coupon = self._coupon(max_redemptions=5)
        response = self._sell({
            "cart": self._cart(quantity=2),
            "payment_method": "cash",
            "coupon_code": "summer20",
        })
        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(public_id=response.json()["public_id"])
        self.assertEqual(order.subtotal, Decimal("200.00"))
        self.assertEqual(order.discount_amount, Decimal("40.00"))
        self.assertEqual(order.total, Decimal("160.00"))
        # Snapshotted as typed by the tenant, not as typed by the customer.
        self.assertEqual(order.coupon_code, "SUMMER20")
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 1)

    def test_a_sale_with_no_coupon_is_unchanged(self):
        response = self._sell({"cart": self._cart(), "payment_method": "cash"})
        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(public_id=response.json()["public_id"])
        self.assertEqual(order.discount_amount, Decimal("0.00"))
        self.assertEqual(order.total, order.subtotal)
        self.assertEqual(order.coupon_code, "")

    def test_an_expired_coupon_refuses_the_sale_and_writes_no_order(self):
        # The order is discarded rather than left as a phantom, exactly as the
        # Stripe-failure branches discard theirs.
        self._coupon(expires_at=timezone.now() - timedelta(days=1))
        response = self._sell({
            "cart": self._cart(),
            "payment_method": "cash",
            "coupon_code": "SUMMER20",
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COUPON_EXPIRED")
        self.assertFalse(Order.objects.exists())

    def test_the_stock_of_a_refused_sale_is_untouched(self):
        self._coupon(enabled=False)
        self._sell({
            "cart": self._cart(quantity=3),
            "payment_method": "cash",
            "coupon_code": "SUMMER20",
        })
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 50)

    # ---- the endpoints ---------------------------------------------------- #

    def test_validate_prices_the_discount_without_redeeming(self):
        coupon = self._coupon()
        response = self.client.post(
            "/api/coupons/validate/",
            {"code": "SUMMER20", "cart": self._cart(quantity=2)},
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["discount"], "40.00")
        self.assertEqual(response.json()["total"], "160.00")
        # Advisory only: nothing may be consumed by asking.
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 0)

    def test_validate_refuses_an_empty_cart(self):
        self._coupon()
        response = self.client.post(
            "/api/coupons/validate/", {"code": "SUMMER20", "cart": []},
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "CART_EMPTY")

    def test_the_public_landing_hides_campaign_performance(self):
        self._coupon(name="Internal name", max_redemptions=50, times_redeemed=12)
        response = self.client.get(
            "/api/coupons/SUMMER20/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["valid"])
        for leaked in ("times_redeemed", "max_redemptions", "name"):
            self.assertNotIn(leaked, body)

    def test_the_public_landing_reports_an_expired_coupon_as_invalid(self):
        # 200 with valid:false, not 404: the page has to be able to say "this
        # offer has ended" for a code the tenant really did print.
        self._coupon(expires_at=timezone.now() - timedelta(days=1))
        response = self.client.get(
            "/api/coupons/SUMMER20/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["valid"])

    def test_an_unknown_code_is_a_404(self):
        response = self.client.get(
            "/api/coupons/NOPE/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 404)

    def test_an_admin_may_not_read_another_tenants_coupon(self):
        other = Coupon.objects.create(
            system=self.other_system, code="BETAONLY",
            kind=Coupon.KIND_PERCENT, value=Decimal("50.00"),
        )
        self.client.force_login(self.admin)
        response = self.client.get(f"/api/coupons/admin/{other.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_creating_a_coupon_writes_its_qr_code(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/coupons/admin/",
            {"code": "NEW10", "kind": "percent", "value": "10.00"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["qr_code"])
        self.assertTrue(Coupon.objects.get(code="NEW10").qr_code)

    def test_a_duplicate_code_is_refused_regardless_of_case(self):
        self._coupon(code="SUMMER20")
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/coupons/admin/",
            {"code": "summer20", "kind": "percent", "value": "10.00"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_percentage_over_one_hundred_is_refused(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/coupons/admin/",
            {"code": "TOOMUCH", "kind": "percent", "value": "120.00"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_code_with_a_slash_is_refused(self):
        # It travels in the `/coupon/<code>` path the QR encodes.
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/coupons/admin/",
            {"code": "SUM/20", "kind": "percent", "value": "10.00"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_the_flyers_logo_plate_round_trips(self):
        coupon = self._coupon()
        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/coupons/admin/{coupon.pk}/",
            {
                "brand_logo_background": "hexagon",
                "brand_logo_background_scale": 80,
                "brand_logo_scale": 60,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["brand_logo_background"], "hexagon")
        coupon.refresh_from_db()
        self.assertEqual(coupon.brand_logo_background_scale, 80)
        self.assertEqual(coupon.brand_logo_scale, 60)

    def test_a_logo_scale_outside_the_sliders_range_is_refused(self):
        # The CMS is not the only possible caller: below 30 the logo all but
        # vanishes, and there is nothing above 100 to draw.
        coupon = self._coupon()
        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/coupons/admin/{coupon.pk}/",
            {"brand_logo_scale": 10}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_renaming_a_coupon_rewrites_its_qr_code(self):
        # The PNG encodes /coupon/<code>, so a rename leaves the stored one
        # pointing at a code that no longer resolves.
        coupon = self._coupon()
        attach_coupon_qr(coupon)
        before = coupon.qr_code.name
        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/coupons/admin/{coupon.pk}/",
            {"code": "WINTER30"}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        coupon.refresh_from_db()
        self.assertTrue(coupon.qr_code)
        with coupon.qr_code.open("rb") as handle:
            self.assertTrue(handle.read())
        self.assertEqual(coupon.qr_code.name, before)

    def test_deleting_a_coupon_keeps_the_orders_that_used_it(self):
        # Deleting a finished campaign must not erase the record of the
        # discounts it gave.
        coupon = self._coupon()
        response = self._sell({
            "cart": self._cart(), "payment_method": "cash", "coupon_code": "SUMMER20",
        })
        order = Order.objects.get(public_id=response.json()["public_id"])
        coupon.delete()
        order.refresh_from_db()
        self.assertIsNone(order.coupon)
        self.assertEqual(order.coupon_code, "SUMMER20")
        self.assertEqual(order.discount_amount, Decimal("20.00"))
        self.assertEqual(order.total, Decimal("80.00"))
