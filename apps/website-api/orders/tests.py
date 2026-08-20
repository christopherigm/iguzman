"""Orders tests - deliberately few, except where money is involved.

This module is thinner than it was, but two areas are kept at **full fidelity**
and must stay that way:

* **Money.** Checkout, the Stripe webhook, deposits, the redemption ceiling and
  the stock draw-down. Every distinct failure mode still has an assertion.
* **The tenant boundary.** An event, an order, a coupon, an item or a resource
  reachable from the wrong System is the one class of bug here that leaks a
  customer's data or lets them spend somebody else's catalog.

Everything else is one happy path plus its refusals. See `CLAUDE.md` ->
"Tests - keep the suite small" before adding to this file.

Run with `REDIS_URL='' python manage.py test orders` (the local `.env` points
Redis at the cluster).
"""

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

from catalog.models import (
    MenuCategory,
    MenuItem,
    MenuSize,
    Product,
    ProductCategory,
    Service,
)
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
    eligible_subtotal,
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


def make_user(email, system, is_admin=False):
    user = User.objects.create_user(f"{system.id}_{email}", password="x", email=email)
    user.profile.system = system
    user.profile.is_admin = is_admin
    user.profile.save()
    return user


def stripe_system(host="acme.test", name="Acme", **extra):
    system = System.objects.create(
        site_name=name, host=host, stripe_enabled=True, **extra
    )
    system.set_stripe_secret_key("sk_test_123")
    system.set_stripe_webhook_secret("whsec_123")
    system.save()
    return system


class _StubSession(dict):
    """Stands in for a stripe Checkout Session (attribute *and* key access)."""

    id = "cs_test_123"
    url = "https://checkout.stripe.com/c/pay/cs_test_123"


class _StubRetrieved(dict):
    """A Checkout Session as `retrieve_session` hands it back."""

    def __init__(self, status="open", url="https://checkout.stripe.com/c/pay/cs_old"):
        super().__init__(id="cs_test_old", status=status, url=url)


class _BookingFixture(TestCase):
    """A branch open 09:00-17:00 every day, and a one-hour bookable service."""

    branch_kwargs = {}
    service_kwargs = {}

    def setUp(self):
        cache.clear()
        self.system = stripe_system()
        branch_fields = {
            "name": "Downtown", "is_main": True, "timezone": "UTC",
            "booking_capacity": 1, "booking_min_notice_hours": 0,
            "booking_max_days_ahead": 60,
            **self.branch_kwargs,
        }
        self.branch = Branch.objects.create(system=self.system, **branch_fields)
        for weekday in range(7):
            BranchHours.objects.create(
                branch=self.branch, weekday=weekday,
                opens_at=time(9, 0), closes_at=time(17, 0),
            )
        self.service = Service.objects.create(
            system=self.system, name="Haircut", slug="haircut",
            price=Decimal("100.00"), currency="USD", duration=60,
            booking_enabled=True, booking_in_branch=True,
            **self.service_kwargs,
        )

    def _slot(self):
        """The first slot the engine actually offers, so a test can never send a
        time the branch was never open for."""
        tomorrow = (timezone.now() + timedelta(days=1)).date()
        for offset in range(7):
            slots = slots_for_day(
                self.service, self.branch, tomorrow + timedelta(days=offset)
            )
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


# --------------------------------------------------------------------------- #
# Credentials
# --------------------------------------------------------------------------- #

class StripeCredentialTests(TestCase):
    """Per-tenant Stripe keys, encrypted at rest and never readable back out.

    `GET /api/system/` is `AllowAny` and feeds every public page, so a secret
    appearing there hands every tenant's ciphertext to anyone who asks.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def test_secrets_are_encrypted_at_rest_and_read_back(self):
        # Fernet is randomised, so equal secrets must not produce equal rows, and
        # a DB dump must not spill the key.
        self.assertEqual(decrypt(encrypt("sk_test_abc123")), "sk_test_abc123")
        self.assertNotIn("sk_test_abc123", encrypt("sk_test_abc123"))
        self.assertNotEqual(encrypt("same"), encrypt("same"))

        self.system.set_stripe_secret_key("sk_test_123")
        self.system.save()
        fresh = System.objects.get(pk=self.system.pk)
        self.assertNotIn("sk_test_123", fresh.stripe_secret_key_encrypted)
        self.assertEqual(fresh.stripe_secret_key, "sk_test_123")

        # Blank clears rather than encrypting an empty string.
        fresh.set_stripe_secret_key("")
        self.assertEqual(fresh.stripe_secret_key_encrypted, "")
        self.assertEqual(fresh.stripe_secret_key, "")

        # A site that can charge but can never confirm is not configured: the
        # order would take money and sit pending forever.
        self.assertFalse(self.system.stripe_configured)
        self.system.stripe_enabled = True
        self.system.set_stripe_secret_key("sk_test_123")
        self.assertFalse(self.system.stripe_configured)
        self.system.set_stripe_webhook_secret("whsec_123")
        self.assertTrue(self.system.stripe_configured)

    def test_the_public_payload_reports_the_flags_and_nothing_else(self):
        self.system.stripe_enabled = True
        self.system.set_stripe_secret_key("sk_test_supersecret")
        self.system.set_stripe_webhook_secret("whsec_supersecret")
        self.system.save()

        response = self.client.get("/api/system/", HTTP_X_WEBSITE_HOST="acme.test")

        self.assertEqual(response.status_code, 200)
        body = json.dumps(response.json())
        for leaked in (
            "sk_test_supersecret", "whsec_supersecret",
            "stripe_secret_key", "stripe_webhook_secret",
        ):
            self.assertNotIn(leaked, body)
        self.assertTrue(response.json()["stripe_enabled"])
        self.assertTrue(response.json()["stripe_configured"])


# --------------------------------------------------------------------------- #
# Checkout - money
# --------------------------------------------------------------------------- #

class CheckoutTests(TestCase):
    """The signed-in cart checkout. Every refusal here is money."""

    def setUp(self):
        cache.clear()
        self.system = stripe_system()
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )
        self.user = make_user("a@acme.test", self.system)
        self.client.force_login(self.user)

    def _checkout(self):
        return self.client.post(
            "/api/orders/checkout/", {"locale": "en"}, content_type="application/json",
        )

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_checkout_snapshots_the_cart_onto_the_order(self, mock_create):
        """An order is what was charged, not what the catalog says today."""
        self.product.sku = "BAG"
        self.product.save()
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
        self.assertEqual(response.json()["url"], _StubSession.url)

        line = order.lines.get()
        self.assertEqual(line.name, "Bag")
        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.line_total, Decimal("30.00"))
        self.assertEqual(line.sku, "BAG")

        self.product.price = Decimal("99.00")
        self.product.name = "Renamed Bag"
        self.product.save()
        line.refresh_from_db()
        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.name, "Bag")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_null_sku_snapshots_as_blank_and_a_service_is_always_orderable(
        self, mock_create,
    ):
        """`sku` is nullable on Product/Service but NOT NULL on the order line,
        so the snapshot must coalesce rather than pass None through."""
        self.assertIsNone(self.product.sku)
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        self.assertEqual(self._checkout().status_code, 201)
        self.assertEqual(Order.objects.get().lines.get().sku, "")

        Order.objects.all().delete()
        service = Service.objects.create(
            system=self.system, name="Setup", slug="setup",
            price=Decimal("50.00"), currency="USD",
        )
        CartItem.objects.all().delete()
        CartItem.objects.create(user=self.user, system=self.system, service=service)
        self.assertEqual(self._checkout().status_code, 201)
        self.assertEqual(Order.objects.get().lines.get().kind, "service")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_nothing_payable_is_ever_half_written(self, mock_create):
        """Every refusal has to leave no order behind - a phantom pending row is
        one a customer can find in their history and try to pay."""
        # An empty cart, signed in or not.
        empty = self._checkout()
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(empty.json()["code"], "CART_EMPTY")
        self.client.logout()
        anonymous = self.client.post(
            "/api/orders/checkout/", {"locale": "en"},
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(anonymous.json()["code"], "CART_EMPTY")
        self.client.force_login(self.user)

        # A site whose Stripe is switched off.
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        self.system.stripe_enabled = False
        self.system.save()
        unavailable = self._checkout()
        self.assertEqual(unavailable.status_code, 503)
        self.assertEqual(unavailable.json()["code"], "PAYMENTS_UNAVAILABLE")
        self.system.stripe_enabled = True
        self.system.save()

        # A mixed-currency cart is refused, not converted: a Checkout Session is
        # single-currency and `Buyable.currency` is per item.
        euro = Product.objects.create(
            system=self.system, name="Hat", slug="hat",
            price=Decimal("20.00"), currency="EUR",
        )
        CartItem.objects.create(user=self.user, system=self.system, product=euro)
        mixed = self._checkout()
        self.assertEqual(mixed.status_code, 400)
        self.assertEqual(mixed.json()["code"], "MIXED_CURRENCY")
        self.assertEqual(mixed.json()["currencies"], ["EUR", "USD"])
        mock_create.assert_not_called()
        CartItem.objects.filter(product=euro).delete()

        # An item that sold out since it was added.
        self.product.in_stock = False
        self.product.save()
        sold_out = self._checkout()
        self.assertEqual(sold_out.status_code, 409)
        self.assertEqual(sold_out.json()["code"], "OUT_OF_STOCK")
        self.product.in_stock = True
        self.product.save()

        self.assertFalse(Order.objects.exists())

    @patch("orders.views.create_checkout_session")
    def test_a_stripe_failure_leaves_no_phantom_order(self, mock_create):
        mock_create.side_effect = StripeGatewayError("card_declined internals")
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        response = self._checkout()

        self.assertEqual(response.status_code, 502)
        self.assertFalse(Order.objects.exists())
        # The upstream detail is logged, not handed to the browser.
        self.assertNotIn("internals", json.dumps(response.json()))

    def test_amounts_go_to_stripe_in_minor_units(self):
        self.assertEqual(to_minor_units(Decimal("10.99"), "USD"), 1099)
        # CLP is in CURRENCY_CHOICES and is zero-decimal: a bare `* 100` here
        # overcharges 100-fold.
        self.assertEqual(to_minor_units(Decimal("15000"), "CLP"), 15000)


class WebhookTests(TestCase):
    """The webhook is the only thing that may mark an order paid.

    The browser's return to the success URL is a plain redirect - forgeable,
    replayable, and often never followed. Stripe retries on any non-2xx and can
    double-deliver, so every path here has to be idempotent.
    """

    def setUp(self):
        cache.clear()
        self.system = stripe_system()
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.user = make_user("a@acme.test", self.system)
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
        url = f"/api/orders/stripe/webhook/{token or self.system.stripe_webhook_token}/"
        with patch("orders.views.verify_webhook", return_value=event):
            return self.client.post(
                url, data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

    def test_a_completed_session_pays_the_order_clears_the_cart_and_draws_stock(self):
        response = self._post(self._event())

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)
        self.assertIsNotNone(self.order.paid_at)
        self.assertEqual(self.order.stripe_payment_intent_id, "pi_test_123")
        self.assertEqual(self.order.email, "buyer@acme.test")
        self.assertEqual(self.order.shipping_city, "London")
        self.assertEqual(self.order.shipping_country, "GB")

        self.assertFalse(CartItem.objects.filter(user=self.user).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)

    def test_a_redelivered_event_does_not_apply_twice(self):
        self._post(self._event())
        refilled = CartItem.objects.create(
            user=self.user, system=self.system, product=self.product, quantity=1,
        )

        self._post(self._event())

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)
        self.assertTrue(CartItem.objects.filter(pk=refilled.pk).exists())

    def test_stock_never_goes_negative(self):
        self.product.stock_count = 1
        self.product.save()
        self._post(self._event())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 0)

    def test_an_unpaid_or_unsigned_event_changes_nothing(self):
        """A delayed payment method can complete the session without the money
        having moved; treating that as paid would ship on a promise."""
        self._post(self._event(payment_status="unpaid"))
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PENDING)
        self.assertTrue(CartItem.objects.filter(pk=self.cart_line.pk).exists())

        with patch("orders.views.verify_webhook", side_effect=ValueError("bad sig")):
            forged = self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=forged",
            )
        self.assertEqual(forged.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PENDING)

        # A 4xx would make Stripe retry an event we simply do not act on.
        unhandled = self._post(self._event(event_type="payment_intent.created"))
        self.assertEqual(unhandled.status_code, 200)
        self.assertTrue(unhandled.json()["received"])

    def test_an_event_cannot_reach_another_tenants_order(self):
        """Even a validly-signed one: the lookup is scoped to the System whose
        secret verified it, and an unknown token is a 404."""
        other = stripe_system(host="other.test", name="Other")

        response = self._post(self._event(), token=other.stripe_webhook_token)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PENDING)
        self.assertEqual(
            self.client.post(
                f"/api/orders/stripe/webhook/{uuid.uuid4()}/",
                data="{}", content_type="application/json",
            ).status_code,
            404,
        )

    def test_an_expiry_cancels_a_pending_order_but_cannot_undo_a_paid_one(self):
        self._post(self._event(event_type="checkout.session.expired"))
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_CANCELED)

        self._post(self._event())
        self._post(self._event(event_type="checkout.session.expired"))
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)


# --------------------------------------------------------------------------- #
# Reading, deleting and guest orders
# --------------------------------------------------------------------------- #

class OrderReadTests(TestCase):
    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = make_user("a@acme.test", self.system)
        self.other_user = make_user("b@acme.test", self.system)
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

    def test_an_order_reads_by_public_id_and_hides_the_stripe_ids(self):
        listed = self.client.get("/api/orders/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["item_count"], 2)

        self.order.stripe_session_id = "cs_test_secret"
        self.order.stripe_payment_intent_id = "pi_test_secret"
        self.order.save()

        response = self.client.get(f"/api/orders/{self.order.public_id}/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["lines"][0]["name"], "Bag")
        self.assertEqual(body["total"], "20.00")
        self.assertEqual(body["public_id"], str(self.order.public_id))
        for leaked in ("cs_test_secret", "pi_test_secret"):
            self.assertNotIn(leaked, json.dumps(body))
        # The sequential pk stays server-side - never serialised, and its route
        # no longer resolves.
        self.assertNotIn("id", body)
        self.assertEqual(self.client.get(f"/api/orders/{self.order.pk}/").status_code, 404)

    def test_who_may_read_an_order(self):
        """A tenant's admin may read any order of their own System - that is what
        makes the order QR useful at a counter, and grants no new data since they
        already see every one of them in the CMS. Admin is **not** a cross-tenant
        key: the boundary is upstream, in `request_system`.
        """
        self.client.force_login(self.other_user)
        self.assertEqual(
            self.client.get(f"/api/orders/{self.order.public_id}/").status_code, 404,
        )

        self.other_user.profile.is_admin = True
        self.other_user.profile.save()
        self.client.force_login(self.other_user)
        self.assertEqual(
            self.client.get(f"/api/orders/{self.order.public_id}/").status_code, 200,
        )

        rival = System.objects.create(site_name="Rival", host="rival.test")
        self.client.force_login(make_user("admin@rival.test", rival, is_admin=True))
        self.assertEqual(
            self.client.get(f"/api/orders/{self.order.public_id}/").status_code, 404,
        )

    def test_a_line_outlives_its_deleted_item(self):
        """SET_NULL, not CASCADE: deleting a catalog row must not delete the
        record that it was once sold. Only the link to a page that no longer
        exists goes away."""
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="o-bebidas",
            ),
            name="Michelada", slug="o-michelada", price=Decimal("6.00"),
        )
        product = Product.objects.create(
            system=self.system, name="Mug", slug="mug", price=Decimal("10.00"),
        )
        menu_line = OrderLine.objects.create(
            order=self.order, kind="menu_item", menu_item=item, name="Michelada",
            unit_price=Decimal("6.00"), quantity=1, line_total=Decimal("6.00"),
            currency="USD",
        )
        product_line = OrderLine.objects.create(
            order=self.order, kind="product", product=product, name="Mug",
            unit_price=Decimal("10.00"), quantity=1, line_total=Decimal("10.00"),
            currency="USD",
        )

        rows = {
            r["name"]: r
            for r in self.client.get(f"/api/orders/{self.order.public_id}/").json()["lines"]
        }
        # `item_menu_category_slug` is the first segment of the item's URL, read
        # live through the FK so it follows a dish re-filed in the CMS.
        self.assertEqual(rows["Michelada"]["item_menu_category_slug"], "o-bebidas")
        # A product line carries no menu category, so the frontend cannot
        # mistake one for a menu item.
        self.assertIsNone(rows["Mug"]["item_menu_category_slug"])

        item.delete()
        product.delete()
        cache.clear()

        product_line.refresh_from_db()
        self.assertIsNone(product_line.product_id)
        self.assertEqual(product_line.unit_price, Decimal("10.00"))

        rows = {
            r["id"]: r
            for r in self.client.get(f"/api/orders/{self.order.public_id}/").json()["lines"]
        }
        self.assertEqual(rows[menu_line.pk]["name"], "Michelada")
        self.assertIsNone(rows[menu_line.pk]["item_slug"])
        self.assertIsNone(rows[menu_line.pk]["item_menu_category_slug"])


class OrderDeleteTests(TestCase):
    """The one rule with teeth: a paid (or refunded) order is money that changed
    hands and cannot be erased."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = make_user("a@acme.test", self.system)
        self.client.force_login(self.user)

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

    def test_only_an_order_that_never_completed_payment_may_be_deleted(self):
        for status in (
            Order.STATUS_PENDING, Order.STATUS_FAILED, Order.STATUS_CANCELED,
        ):
            order = self._order(status)
            # Prime the list cache, then confirm the delete drops it from there
            # too. (Rows written straight through the ORM do not invalidate it,
            # hence the clear.)
            cache.clear()
            self.assertEqual(len(self.client.get("/api/orders/").json()), 1)
            self.assertEqual(
                self.client.delete(f"/api/orders/{order.public_id}/").status_code,
                204, status,
            )
            self.assertFalse(Order.objects.filter(pk=order.pk).exists(), status)
            self.assertFalse(OrderLine.objects.filter(order_id=order.pk).exists())
            self.assertEqual(self.client.get("/api/orders/").json(), [])

        for status in (Order.STATUS_PAID, Order.STATUS_REFUNDED):
            order = self._order(status)
            response = self.client.delete(f"/api/orders/{order.public_id}/")
            self.assertEqual(response.status_code, 403, status)
            self.assertEqual(response.json()["code"], "ORDER_NOT_DELETABLE")
            self.assertTrue(Order.objects.filter(pk=order.pk).exists())
            order.delete()

    def test_another_users_order_is_a_404_not_a_403(self):
        """Scoped to the caller, so the endpoint cannot be used to probe which
        order ids exist - a stranger's id is simply absent, never forbidden."""
        order = self._order(Order.STATUS_PENDING)
        self.client.force_login(make_user("b@acme.test", self.system))

        response = self.client.delete(f"/api/orders/{order.public_id}/")

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())


class GuestCheckoutTests(TestCase):
    """Checkout with no account, and who may read the order that comes out."""

    def setUp(self):
        cache.clear()
        self.system = stripe_system()
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )

    def _checkout(self, cart):
        return self.client.post(
            "/api/orders/checkout/", {"locale": "en", "cart": cart},
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_guest_order_is_priced_from_the_catalog_never_from_the_body(
        self, mock_create,
    ):
        """The whole reason the browser holds references rather than a cart."""
        response = self._checkout([{
            "kind": "product", "id": self.product.id, "quantity": 2,
            "price": "0.01", "unit_price": "0.01", "line_total": "0.01",
        }])

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get()
        self.assertIsNone(order.user_id)
        self.assertEqual(order.total, Decimal("20.00"))
        # Left blank for Stripe's own page to collect; the webhook fills it in.
        self.assertEqual(order.email, "")

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
    def test_an_ownerless_order_is_readable_by_its_link_and_an_owned_one_is_not(
        self, mock_create,
    ):
        self._checkout([{"kind": "product", "id": self.product.id, "quantity": 1}])
        guest_order = Order.objects.get()

        readable = self.client.get(
            f"/api/orders/{guest_order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(readable.status_code, 200)
        self.assertEqual(readable.json()["public_id"], str(guest_order.public_id))
        # But DELETE stays owner-only, even on an order a guest can read.
        self.assertEqual(
            self.client.delete(
                f"/api/orders/{guest_order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
            ).status_code,
            404,
        )

        owned = Order.objects.create(
            system=self.system, user=make_user("owner@acme.test", self.system),
            currency="USD", total=Decimal("10.00"),
        )
        self.assertEqual(
            self.client.get(
                f"/api/orders/{owned.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
            ).status_code,
            404,
        )

    def test_a_guest_order_is_claimed_by_email_within_its_own_tenant(self):
        """`Order.email` is blank until the webhook copies what the customer
        typed on Stripe's page, so an abandoned guest order has no address for
        someone to register and sweep up."""
        from .claims import claim_guest_orders

        user = make_user("Buyer@acme.test", self.system)
        mine = Order.objects.create(
            system=self.system, user=None, email="buyer@acme.test",
            currency="USD", total=Decimal("10.00"),
        )
        abandoned = Order.objects.create(
            system=self.system, user=None, email="",
            currency="USD", total=Decimal("10.00"),
        )
        other = System.objects.create(site_name="Other", host="other.test")
        theirs = Order.objects.create(
            system=other, user=None, email="buyer@acme.test",
            currency="USD", total=Decimal("10.00"),
        )

        self.assertEqual(claim_guest_orders(user, self.system), 1)

        mine.refresh_from_db()
        abandoned.refresh_from_db()
        theirs.refresh_from_db()
        self.assertEqual(mine.user_id, user.id)  # matched case-insensitively
        self.assertIsNone(abandoned.user_id)
        self.assertIsNone(theirs.user_id)


class OfflineCheckoutTests(TestCase):
    """Pay-in-store / pay-on-delivery: an order placed without Stripe.

    No session and no webhook, so the cart-clear and stock draw-down have to
    happen at placement instead, and the contact/address Stripe would have
    collected come from our own form.
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
        self.user = make_user("a@acme.test", self.system)
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
            "locale": "en", "payment_method": "in_store",
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

    def test_pay_on_delivery_snapshots_the_address_the_form_insists_on(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        # A name with no way to reach the customer, and a delivery with nowhere
        # to deliver to, are both refused before anything is written.
        self.assertEqual(
            self._post({
                "locale": "en", "payment_method": "in_store",
                "contact": {"name": "Jo"},
            }).status_code,
            400,
        )
        self.assertEqual(
            self._post({
                "locale": "en", "payment_method": "on_delivery",
                "contact": {"name": "Jo", "phone": "555-1234"},
            }).status_code,
            400,
        )
        self.assertFalse(Order.objects.exists())

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

    def test_a_switched_off_method_is_refused_and_a_guest_may_use_a_live_one(self):
        self.system.pay_in_store_enabled = False
        self.system.save()
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        refused = self._post({
            "locale": "en", "payment_method": "in_store",
            "contact": {"name": "Jo", "phone": "555-1234"},
        })
        self.assertEqual(refused.status_code, 503)
        self.assertEqual(refused.json()["code"], "METHOD_UNAVAILABLE")
        self.assertFalse(Order.objects.exists())

        self.system.pay_in_store_enabled = True
        self.system.save()
        self.client.logout()
        placed = self._post({
            "locale": "en", "payment_method": "in_store",
            "contact": {"name": "Guest", "email": "guest@x.test"},
            "cart": [{"kind": "product", "id": self.product.id, "quantity": 1}],
        })
        self.assertEqual(placed.status_code, 201)
        order = Order.objects.get()
        self.assertIsNone(order.user_id)
        self.assertEqual(order.email, "guest@x.test")
        self.assertEqual(order.status, Order.STATUS_PLACED)


# --------------------------------------------------------------------------- #
# The CMS: order management and the till
# --------------------------------------------------------------------------- #

class AdminOrderManagementTests(TestCase):
    """The tenant's order list and the mark-paid / mark-fulfilled actions."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Acme", host="acme.test", pay_in_store_enabled=True,
        )
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.admin = make_user("admin@acme.test", self.system, is_admin=True)
        self.order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_IN_STORE, currency="USD",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
        )
        self.client.force_login(self.admin)

    def _action(self, public_id, action):
        return self.client.post(
            f"/api/orders/admin/{public_id}/", {"action": action},
            content_type="application/json",
        )

    def test_the_two_axes_move_independently(self):
        listed = self.client.get("/api/orders/admin/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["payment_method"], "in_store")

        self.assertEqual(self._action(self.order.public_id, "mark_paid").status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)
        self.assertIsNotNone(self.order.paid_at)

        # Fulfilled without being paid is a valid state on the two-axis model.
        self._action(self.order.public_id, "mark_fulfilled")
        self.order.refresh_from_db()
        self.assertTrue(self.order.fulfilled)
        self.assertIsNotNone(self.order.fulfilled_at)
        self._action(self.order.public_id, "unmark_fulfilled")
        self.order.refresh_from_db()
        self.assertFalse(self.order.fulfilled)
        self.assertIsNone(self.order.fulfilled_at)

        # An online order is Stripe's to confirm, never the CMS's.
        online = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING,
            payment_method=Order.PAYMENT_ONLINE, currency="USD",
        )
        refused = self._action(online.public_id, "mark_paid")
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.json()["code"], "ONLINE_ORDER")

    def test_the_screen_is_admin_only_and_scoped_to_this_tenant(self):
        theirs = Order.objects.create(
            system=self.other_system, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_IN_STORE, currency="USD",
        )
        self.assertEqual(self._action(theirs.public_id, "mark_paid").status_code, 404)

        self.client.force_login(make_user("u@acme.test", self.system))
        self.assertEqual(self.client.get("/api/orders/admin/").status_code, 403)


class PosCheckoutTests(TestCase):
    """The counter sale: an order rung up by a store associate, not a customer.

    It is the only checkout path whose caller is signed in but is *not* the
    buyer, and the only one that may settle both order axes in a single action.
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
        self.admin = make_user("admin@acme.test", self.system, is_admin=True)
        self.client.force_login(self.admin)

    def _sell(self, body):
        return self.client.post(
            "/api/orders/admin/pos/", body, content_type="application/json",
        )

    def _action(self, public_id, action):
        return self.client.post(
            f"/api/orders/admin/{public_id}/", {"action": action},
            content_type="application/json",
        )

    def test_a_sale_is_priced_from_the_catalog_and_belongs_to_no_user(self):
        # The bug this endpoint exists to prevent: `CheckoutView` would have sold
        # the associate their own saved items.
        CartItem.objects.create(
            user=self.admin, system=self.system, product=self.product, quantity=7,
        )

        response = self._sell({
            "cart": [{
                "kind": "product", "id": self.product.pk, "quantity": 2,
                "unit_price": "0.01", "price": "0.01",
            }],
            "payment_method": "terminal",
            "contact": {"email": "walkin@example.test", "name": "Jo"},
        })

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(public_id=response.json()["public_id"])
        self.assertEqual(order.status, Order.STATUS_PLACED)
        self.assertEqual(order.payment_method, Order.PAYMENT_TERMINAL)
        # The body cannot name a price, and the associate is the seller, not the
        # buyer - a counter sale must not land in whoever is logged into the till.
        self.assertEqual(order.total, Decimal("20.00"))
        self.assertIsNone(order.user)
        self.assertFalse(order.fulfilled)
        self.assertEqual(order.email, "walkin@example.test")
        self.assertEqual(order.shipping_name, "Jo")

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 3)
        self.assertTrue(CartItem.objects.filter(user=self.admin, quantity=7).exists())

        self.assertEqual(
            self.client.get("/api/orders/admin/").json()[0]["payment_method"], "terminal",
        )

    def test_the_till_refuses_what_it_may_not_sell(self):
        theirs = Product.objects.create(
            system=self.other_system, name="Theirs", slug="theirs",
            price=Decimal("99.00"), currency="USD",
        )
        cart = [{"kind": "product", "id": self.product.pk, "quantity": 1}]

        cross_tenant = self._sell({
            "cart": [{"kind": "product", "id": theirs.pk, "quantity": 1}],
            "payment_method": "cash",
        })
        self.assertEqual(cross_tenant.status_code, 400)
        self.assertEqual(cross_tenant.json()["code"], "CART_EMPTY")

        self.assertEqual(self._sell({"cart": [], "payment_method": "cash"}).status_code, 400)
        # The POS rings up counter sales only - it may not mint an order that
        # claims to have been paid through Stripe.
        self.assertEqual(
            self._sell({"cart": cart, "payment_method": "online"}).status_code, 400,
        )

        self.product.in_stock = False
        self.product.save()
        sold_out = self._sell({"cart": cart, "payment_method": "cash"})
        self.assertEqual(sold_out.status_code, 409)
        self.assertEqual(sold_out.json()["code"], "OUT_OF_STOCK")

        self.assertFalse(Order.objects.exists())
        self.client.force_login(make_user("u@acme.test", self.system))
        self.assertEqual(self._sell({"cart": cart, "payment_method": "cash"}).status_code, 403)

    def test_complete_settles_both_axes_once_and_only_on_a_counter_order(self):
        sale = self._sell({
            "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
            "payment_method": "terminal",
        }).json()

        self.assertEqual(self._action(sale["public_id"], "complete").status_code, 200)
        order = Order.objects.get(public_id=sale["public_id"])
        self.assertEqual(order.status, Order.STATUS_PAID)
        self.assertIsNotNone(order.paid_at)
        self.assertTrue(order.fulfilled)
        self.assertIsNotNone(order.fulfilled_at)

        repeated = self._action(sale["public_id"], "complete")
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(repeated.json()["code"], "BAD_TRANSITION")

        # It must not become a way to skip fulfillment tracking on an order that
        # still has to be delivered.
        delivery = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_ON_DELIVERY, currency="USD",
        )
        wrong_kind = self._action(delivery.public_id, "complete")
        self.assertEqual(wrong_kind.status_code, 409)
        self.assertEqual(wrong_kind.json()["code"], "NOT_POS_ORDER")


# --------------------------------------------------------------------------- #
# Emails and QR codes
# --------------------------------------------------------------------------- #

class OrderEmailTests(TestCase):
    """A confirmation when the order is placed (or first paid, for an online
    one) and a fresh copy every time its status moves - keyed on the address the
    order carries rather than on an account."""

    def setUp(self):
        cache.clear()
        self.system = stripe_system(pay_in_store_enabled=True)
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.admin = make_user("admin@acme.test", self.system, is_admin=True)

    def _make_order(self, *, customization=None, **kwargs):
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

    def _action(self, order, action):
        return self.client.post(
            f"/api/orders/admin/{order.public_id}/", {"action": action},
            content_type="application/json",
        )

    def test_payment_emails_the_customer_a_full_confirmation(self):
        order = self._make_order(
            stripe_session_id="cs_1",
            customization=[{"name": "Extra cheese", "quantity": 2, "removed": False}],
        )
        event = {"type": "checkout.session.completed", "data": {"object": {
            "id": "cs_1", "payment_status": "paid", "payment_intent": "pi_1",
            "customer_details": {"email": "buyer@acme.test"},
        }}}
        with patch("orders.views.verify_webhook", return_value=event):
            self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["buyer@acme.test"])
        self.assertIn(str(order.public_id)[:8].upper(), msg.subject)
        self.assertIn(f"/orders/{order.public_id}", msg.body)
        self.assertIn("Bag", msg.body)
        self.assertIn("Extra cheese", msg.body)
        html = dict((mime, content) for content, mime in msg.alternatives)["text/html"]
        self.assertIn("Bag", html)
        # The reply goes to the store, not into a void.
        self.assertEqual(msg.reply_to, ["admin@acme.test"])

    def test_a_status_change_emails_the_customer_in_the_words_that_fit(self):
        self.client.force_login(self.admin)

        pickup = self._make_order(
            status=Order.STATUS_PLACED, payment_method=Order.PAYMENT_IN_STORE,
            email="guest@acme.test",  # no shipping address -> pickup
        )
        mail.outbox.clear()
        self._action(pickup, "mark_fulfilled")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["guest@acme.test"])
        self.assertIn("listo", mail.outbox[0].subject)
        self.assertIn("ready for pickup", mail.outbox[0].body)

        # Reversing the flag is an admin correction, not news to the customer.
        mail.outbox.clear()
        self._action(pickup, "unmark_fulfilled")
        self.assertEqual(len(mail.outbox), 0)

        self._action(pickup, "cancel")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Cancelado", mail.outbox[0].subject)

        delivery = self._make_order(
            status=Order.STATUS_PAID, payment_method=Order.PAYMENT_ON_DELIVERY,
            email="buyer@acme.test", shipping_line1="1 Analytical Way",
        )
        mail.outbox.clear()
        self._action(delivery, "mark_fulfilled")
        self.assertIn("en camino", mail.outbox[0].subject)
        self.assertIn("on its way", mail.outbox[0].body)

        # `complete` moves both axes at once; the customer gets a single email,
        # and it reads as the payment update rather than fulfillment.
        counter = self._make_order(
            status=Order.STATUS_PLACED, payment_method=Order.PAYMENT_CASH,
            email="walkin@acme.test",
        )
        mail.outbox.clear()
        self._action(counter, "complete")
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

        # A guest offline checkout, by contrast, is confirmed straight away.
        response = self.client.post(
            "/api/orders/checkout/",
            {
                "payment_method": "in_store",
                "cart": [{"kind": "product", "id": self.product.pk, "quantity": 1}],
                "contact": {"name": "Jo", "email": "jo@guest.test"},
            },
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["jo@guest.test"])


class OrderQrTests(TestCase):
    """The QR code an order carries, and the two places it has to arrive.

    A code that encodes the wrong URL still looks like a perfectly good QR, and
    an email whose image is linked rather than embedded still *sends* - it just
    renders as a blank box in every client that blocks remote images.
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
        self.user = make_user("a@acme.test", self.system)
        self.client.force_login(self.user)

    def _place_order(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        response = self.client.post(
            "/api/orders/checkout/",
            {
                "locale": "en", "payment_method": "in_store",
                "contact": {"name": "Jo", "email": "jo@acme.test"},
            },
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(response.status_code, 201)
        return Order.objects.get(public_id=response.json()["order_id"])

    def test_checkout_writes_a_tenant_scoped_code_for_the_public_page(self):
        order = self._place_order()

        self.assertTrue(order.qr_code)
        # Tenant-prefixed like every other file, and named after the id it
        # encodes - ⚠ never a sequential one, which would put every other
        # order's code one guess away from the last.
        self.assertEqual(
            order.qr_code.name,
            f"t/{self.system.pk}/orders/qr/{order.public_id}.png",
        )
        self.assertTrue(order.qr_code.read().startswith(b"\x89PNG"))

        # A QR carries exactly one URL and it is printed on paper the customer
        # keeps, so it has to be the address that works for whoever holds it.
        url = order_detail_url(order)
        self.assertTrue(url.endswith(f"/orders/{order.public_id}"))
        self.assertNotIn("/admin/", url)

        body = self.client.get(f"/api/orders/{order.public_id}/").json()
        self.assertIn(f"{order.public_id}.png", body["qr_code"])

    def test_the_email_embeds_it_inline_and_every_render_copes_without_one(self):
        self._place_order()

        message = mail.outbox[0]
        html = next(body for body, mime in message.alternatives if mime == "text/html")
        self.assertIn('src="cid:order-qr"', html)
        # `related`, not Django's default `mixed`: with the image a sibling of
        # the whole body rather than of the HTML, several clients refuse to
        # resolve the cid and render a broken image instead.
        self.assertEqual(message.mixed_subtype, "related")
        attachment = next(
            part for part in message.attachments if part.get("Content-ID") == "<order-qr>"
        )
        self.assertEqual(attachment.get_content_type(), "image/png")

        # Every order placed before the field existed, plus any whose storage
        # write failed: the payload serialises null and the template skips the
        # whole block rather than rendering `cid:None`.
        from .services.order_emails import CONFIRMATION, send_order_email

        bare = Order.objects.create(
            system=self.system, user=self.user, email="jo@acme.test",
            currency="USD", subtotal=Decimal("1.00"), total=Decimal("1.00"),
        )
        self.assertIsNone(self.client.get(f"/api/orders/{bare.public_id}/").json()["qr_code"])

        mail.outbox.clear()
        send_order_email(bare, kind=CONFIRMATION)
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


# --------------------------------------------------------------------------- #
# Bookings
# --------------------------------------------------------------------------- #

class BookingAvailabilityTests(TestCase):
    """The slot engine: hours, lunch, notice, horizon and capacity.

    `now` is pinned to a fixed instant rather than read off the clock, because
    "is this slot in the future" is half of what the engine decides.
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
        self.day = date(2026, 9, 9)          # a Wednesday
        self.now = datetime(2026, 9, 1, 12, 0, tzinfo=dt_timezone.utc)

    def _labels(self, service=None, day=None, now=None):
        slots = slots_for_day(
            service or self.service, self.branch, day or self.day, now=now or self.now,
        )
        zone = ZoneInfo(self.branch.timezone)
        return [s.astimezone(zone).strftime("%H:%M") for s in slots]

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

    def test_the_grid_is_the_services_own_duration_inside_opening_hours(self):
        """⚠ There is no per-branch grid setting and adding one back is a
        regression: one number had to serve a 30-minute trim and a 4-hour tour
        alike, and printed start times that deleted each other the moment one was
        taken."""
        # 13:00 would run into the break; 17:00 would end past closing.
        self.assertEqual(
            self._labels(),
            ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"],
        )

        self.service.duration = 120
        self.service.save()
        # 11:00 ends exactly at the lunch break; a 16:00 start would overrun.
        self.assertEqual(self._labels(), ["09:00", "11:00", "14:00"])

        # A missing duration reads as an hour rather than collapsing the step.
        self.service.duration = None
        self.service.save()
        self.assertEqual(len(self._labels()), 7)

        # Two services at one branch keep their own grids: four hours fits the
        # 09:00-13:00 window exactly and nowhere else.
        tour = Service.objects.create(
            system=self.system, name="City tour", slug="city-tour",
            price=Decimal("300.00"), currency="USD", duration=240,
            booking_enabled=True,
        )
        self.assertEqual(self._labels(service=tour), ["09:00"])

        # A weekday with no BranchHours row is closed - absence *is* the closure.
        self.assertEqual(self._labels(day=date(2026, 9, 13)), [])

    def test_notice_horizon_and_capacity_trim_the_list(self):
        # 12:00 UTC on the 8th is 06:00 in Mexico City; +26h lands at 08:00 local
        # on the 9th, which still clears the 09:00 opening...
        eve = datetime(2026, 9, 8, 12, 0, tzinfo=dt_timezone.utc)
        self.branch.booking_min_notice_hours = 26
        self.branch.save()
        self.assertIn("09:00", self._labels(now=eve))
        # ...while a 32-hour notice pushes past it and eats the morning.
        self.branch.booking_min_notice_hours = 32
        self.branch.save()
        labels = self._labels(now=eve)
        self.assertNotIn("09:00", labels)
        self.assertIn("14:00", labels)

        self.branch.booking_min_notice_hours = 0
        self.branch.booking_max_days_ahead = 3
        self.branch.save()
        self.assertEqual(self._labels(), [])

        self.branch.booking_max_days_ahead = 60
        self.branch.booking_capacity = 2
        self.branch.save()
        nine = slots_for_day(self.service, self.branch, self.day, now=self.now)[0]
        self._book(nine)
        # Capacity lets that many overlap, and the next start clears the
        # 60-minute appointment exactly.
        self.assertIn("09:00", self._labels())
        self.assertIn("10:00", self._labels())
        second = self._book(nine)
        self.assertNotIn("09:00", self._labels())
        # Only ACTIVE_STATUSES occupy a slot, so a cancellation hands it back.
        second.status = Booking.STATUS_CANCELED
        second.save()
        self.assertIn("09:00", self._labels())

    def test_is_slot_available_agrees_with_the_offered_list(self):
        """The invariant the whole design rests on: what the calendar shows and
        what checkout accepts are the same answer. **Never write a second,
        "quick" overlap check inline in a view.**"""
        for slot in slots_for_day(self.service, self.branch, self.day, now=self.now):
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

        # The home business: no Branch rows at all, so the defaults apply.
        solo_system = System.objects.create(site_name="Solo", host="solo.test")
        solo = Service.objects.create(
            system=solo_system, name="Consult", slug="consult",
            price=Decimal("50.00"), currency="USD", duration=60, booking_enabled=True,
        )
        self.assertEqual(branches_for(solo), [])
        self.assertTrue(slots_for_day(solo, None, self.day, now=self.now))


class BookingCheckoutTests(_BookingFixture):
    """Booking a slot: what is accepted, what is refused, and what gets charged."""

    service_kwargs = {
        "booking_pay_full": True, "booking_pay_deposit": True,
        "booking_deposit_percent": 30, "booking_pay_in_person": True,
    }

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

    def test_the_body_is_revalidated_against_the_engine(self):
        """Checkout re-derives the slot rather than trusting the request: the
        calendar in front of the customer may be minutes old."""
        slot = self._slot()
        self.assertEqual(self._book(starts_at=slot.isoformat()).status_code, 201)

        taken = self._book(starts_at=slot.isoformat())
        self.assertEqual(taken.status_code, 409)
        self.assertEqual(taken.json()["code"], "SLOT_UNAVAILABLE")

        # 03:00 UTC, hours away from the 09:00-17:00 window.
        night = (timezone.now() + timedelta(days=2)).replace(
            hour=3, minute=0, second=0, microsecond=0,
        )
        self.assertEqual(self._book(starts_at=night.isoformat()).status_code, 409)

        # A service that is not bookable, and another tenant's, are both 404s.
        other = System.objects.create(site_name="Beta", host="beta.test")
        theirs = Service.objects.create(
            system=other, name="Theirs", slug="theirs",
            price=Decimal("10.00"), currency="USD", booking_enabled=True,
        )
        self.assertEqual(self._book(service=theirs.pk).status_code, 404)
        self.service.booking_enabled = False
        self.service.save()
        self.assertEqual(self._book().status_code, 404)

    def test_the_form_and_the_tenants_switches_are_both_enforced(self):
        elsewhere = Branch.objects.create(system=self.system, name="Uptown")
        self.service.booking_branches.set([self.branch])
        wrong_branch = self._book(branch=elsewhere.pk)
        self.assertEqual(wrong_branch.status_code, 400)
        self.assertEqual(wrong_branch.json()["code"], "BRANCH_REQUIRED")
        self.service.booking_branches.clear()

        self.service.booking_pay_full = False
        self.service.save()
        disabled = self._book(payment_option="full")
        self.assertEqual(disabled.status_code, 400)
        self.assertEqual(disabled.json()["code"], "PAYMENT_OPTION_UNAVAILABLE")

        self.service.booking_on_premises = True
        self.service.save()
        no_address = self._book(fulfillment="on_premises", address="")
        self.assertEqual(no_address.status_code, 400)
        self.assertIn("address", no_address.json())

        unreachable = self._book(contact={"name": "Ada", "email": "", "phone": ""})
        self.assertEqual(unreachable.status_code, 400)
        self.assertEqual(unreachable.json()["code"], "CONTACT_REQUIRED")

        self.assertFalse(Booking.objects.exists())

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    def test_a_deposit_charges_the_percentage_and_records_the_rest(self, mocked):
        """A deposit is not a discount: the order still records the service at
        full price, and `amount_due_later` is what the tenant collects."""
        response = self._book(payment_option="deposit")

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.amount_due_now, Decimal("30.00"))
        self.assertEqual(booking.amount_due_later, Decimal("70.00"))
        self.assertEqual(booking.order.total, Decimal("100.00"))
        self.assertEqual(booking.order.status, Order.STATUS_PENDING)
        # Stripe is asked for the deposit, not the total.
        self.assertEqual(mocked.call_args.kwargs["charge_amount"], Decimal("30.00"))

        # Paying in full sends the lines rather than an amount.
        Booking.objects.all().delete()
        Order.objects.all().delete()
        full = self._book(payment_option="full")
        self.assertEqual(full.status_code, 201)
        self.assertIsNone(mocked.call_args.kwargs["charge_amount"])
        self.assertEqual(
            Booking.objects.get(pk=full.json()["booking_id"]).amount_due_later,
            Decimal("0.00"),
        )

        # A percentage of an awkward price must not lose a cent: the remainder is
        # taken as the difference so the halves always sum back to the total.
        now, later = _booking_amounts(
            Decimal("99.99"), self.service, Booking.PAYMENT_DEPOSIT,
        )
        self.assertEqual(now + later, Decimal("99.99"))

    def test_a_site_without_stripe_cannot_take_a_deposit(self):
        self.system.stripe_enabled = False
        self.system.save()

        response = self._book(payment_option="deposit")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "PAYMENTS_UNAVAILABLE")
        # And nothing was written - a slot must not be held for a booking that
        # could never be paid for.
        self.assertFalse(Booking.objects.exists())


class BookingAdminTests(TestCase):
    """The CMS bookings screen and its actions.

    `Booking.status` is the appointment axis; `Order.status` is the money. They
    move independently, and the CMS actions never touch payment - except that
    `complete` sets `Order.fulfilled`, because for an appointment the work and
    the handover are the same moment.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.admin = make_user("admin@acme.test", self.system, is_admin=True)
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

    def _act(self, booking, action):
        return self.client.patch(
            f"/api/bookings/admin/{booking.pk}/", {"action": action},
            content_type="application/json",
        )

    def test_the_actions_move_the_appointment_not_the_money(self):
        self.assertEqual(self._act(self.booking, "confirm").status_code, 200)
        self.booking.refresh_from_db()
        self.booking.order.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_CONFIRMED)
        self.assertEqual(self.booking.order.status, Order.STATUS_PLACED)

        self._act(self.booking, "complete")
        self.booking.refresh_from_db()
        self.booking.order.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_COMPLETED)
        self.assertTrue(self.booking.order.fulfilled)
        # Still not paid: the tenant may well be collecting on the day.
        self.assertEqual(self.booking.order.status, Order.STATUS_PLACED)

        other = self._make_booking(self.system)
        self._act(other, "cancel")
        other.refresh_from_db()
        other.order.refresh_from_db()
        self.assertEqual(other.status, Booking.STATUS_CANCELED)
        self.assertEqual(other.order.status, Order.STATUS_CANCELED)

    def test_the_screen_is_admin_only_and_scoped_to_this_tenant(self):
        theirs = self._make_booking(self.other_system)

        listed = self.client.get("/api/bookings/admin/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["customer_name"], "Ada")
        self.assertEqual(self._act(theirs, "confirm").status_code, 404)

        self.client.force_login(make_user("plain@acme.test", self.system))
        self.assertEqual(self.client.get("/api/bookings/admin/").status_code, 403)


class BookingLocationTests(TestCase):
    """Where an appointment happens, in the two places a customer reads it: the
    confirmation email, and `branch_location` on the order payload.

    Both are gated the same way and each owns its copy of the gate. The two
    silent failures: a map of the *shop* on an on-premises booking is a picture
    of the wrong place on the one message that carries the right address, and a
    Directions link that stopped rendering because nobody screenshotted the
    branch takes the only actionable thing in the block with it.
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

    def test_a_branch_booking_carries_its_location_in_the_email(self):
        message, html = self._send(self._booked_order())
        self.assertIn("Marina", html)
        self.assertIn("Dock 4", html)
        # Coordinates, never the address: a geocoder makes what it will of free
        # text, and this is the link that has to land the customer on the pin.
        self.assertIn(
            "maps/dir/?api=1&amp;destination=22.88000000,-109.90000000", html,
        )
        # `Branch.map_image` is optional, and the link must not depend on it.
        self.assertNotIn("Mapa / Map:", html)
        self.assertNotIn("Location details:", html)

        # The half a street address cannot carry - which gate, which floor - gets
        # its own labelled line in both bodies.
        self.branch.location_details = "Blue gate beside the fuel dock"
        self.branch.save(update_fields=["location_details"])
        message, html = self._send(self._booked_order())
        self.assertIn("Location details:", html)
        self.assertIn("Blue gate beside the fuel dock", message.body)

        # The name is written straight to the column rather than uploaded: what
        # is under test is that the template reaches the stored file's URL.
        # `QuerySet.update` because a `save()` would send
        # `ResizedImageField.pre_save` looking for bytes that do not exist.
        Branch.objects.filter(pk=self.branch.pk).update(
            map_image="t/1/pictures/branchmap/9-abc.jpg",
        )
        self.branch.refresh_from_db()
        _, html = self._send(self._booked_order())
        self.assertIn("Mapa / Map:", html)
        self.assertIn("branchmap/9-abc.jpg", html)

    def test_the_block_is_gated_on_a_pinned_branch_the_customer_travels_to(self):
        # ⚠ An `on_premises` booking **does** carry a branch - it is scheduled
        # against that branch's calendar - so without the fulfillment check the
        # confirmation for a visit to the customer's home would carry a map of
        # the shop.
        _, html = self._send(
            self._booked_order(
                fulfillment=Booking.FULFILLMENT_ON_PREMISES, address="12 Customer St",
            ),
        )
        self.assertNotIn("maps/dir/", html)

        self.branch.latitude = None
        self.branch.longitude = None
        self.branch.save(update_fields=["latitude", "longitude"])
        _, html = self._send(self._booked_order())
        self.assertNotIn("maps/dir/", html)

        # And an ordinary order is not a booking at all.
        plain = Order.objects.create(
            system=self.system, currency="USD", email="buyer@acme.test",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
        )
        OrderLine.objects.create(
            order=plain, kind="service", service=self.service, name="Tour",
            unit_price=Decimal("10.00"), quantity=1,
            line_total=Decimal("10.00"), currency="USD",
        )
        _, html = self._send(plain)
        self.assertNotIn("maps/dir/", html)

    def test_the_order_payload_applies_the_same_gate(self):
        def read(order):
            res = self.client.get(
                f"/api/orders/{order.public_id}/", HTTP_X_WEBSITE_HOST="acme.test",
            )
            self.assertEqual(res.status_code, 200)
            return res.json()

        body = read(self._booked_order())
        location = body["booking"]["branch_location"]
        self.assertEqual(location["latitude"], "22.88000000")
        self.assertEqual(location["address"], "Dock 4\nCabo")
        # Optional, and null until somebody opens the CMS's map picker.
        self.assertIsNone(location["location_details"])
        self.assertIsNone(location["map_image"])
        # What the order page swaps "Buy again" for "Book again" on. Read live,
        # so a service the tenant has since closed to booking goes back.
        self.assertTrue(body["lines"][0]["item_booking_enabled"])
        self.service.booking_enabled = False
        self.service.save(update_fields=["booking_enabled"])
        cache.clear()
        self.assertFalse(read(body_order := self._booked_order())["lines"][0]["item_booking_enabled"])
        self.assertIsNotNone(body_order)

        self.branch.location_details = "Blue gate beside the fuel dock"
        self.branch.save(update_fields=["location_details"])
        cache.clear()
        self.assertEqual(
            read(self._booked_order())["booking"]["branch_location"]["location_details"],
            "Blue gate beside the fuel dock",
        )

        self.assertIsNone(
            read(
                self._booked_order(
                    fulfillment=Booking.FULFILLMENT_ON_PREMISES,
                    address="12 Customer St",
                )
            )["booking"]["branch_location"]
        )
        self.branch.latitude = None
        self.branch.longitude = None
        self.branch.save(update_fields=["latitude", "longitude"])
        cache.clear()
        self.assertIsNone(read(self._booked_order())["booking"]["branch_location"])


class OrderPayTests(TestCase):
    """`POST /api/orders/<public_id>/pay/` - the customer who reached Stripe and
    came back without paying.

    Two rules hold it together: **only a `pending` online order qualifies**, and
    **an order must never carry two payable sessions at once** - with two live
    sessions a customer can pay both, and the webhook, idempotent on an order
    already `paid`, would acknowledge the second charge instead of refusing it.
    """

    def setUp(self):
        cache.clear()
        self.system = stripe_system()
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD", stock_count=5,
        )
        self.user = make_user("a@acme.test", self.system)
        self.client.force_login(self.user)
        self.order = self._make_order(user=self.user)

    def _make_order(self, user=None, **overrides):
        fields = {
            "system": self.system, "user": user,
            "status": Order.STATUS_PENDING,
            "payment_method": Order.PAYMENT_ONLINE,
            "currency": "USD", "subtotal": Decimal("20.00"), "total": Decimal("20.00"),
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
    def test_a_pending_order_gets_a_fresh_session_for_its_own_lines(
        self, mock_retrieve, mock_create,
    ):
        response = self._pay()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["url"], _StubSession.url)
        self.order.refresh_from_db()
        # The order is charged for its own frozen lines, not for a cart.
        self.assertEqual(self.order.stripe_session_id, "cs_test_123")
        self.assertEqual(self.order.status, Order.STATUS_PENDING)
        self.assertEqual([l.name for l in mock_create.call_args.kwargs["lines"]], ["Bag"])

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.expire_session")
    def test_an_order_never_carries_two_payable_sessions(self, mock_expire, mock_create):
        with patch(
            "orders.views.retrieve_session", return_value=_StubRetrieved(status="open"),
        ):
            reused = self._pay()
        self.assertEqual(reused.status_code, 200)
        self.assertEqual(reused.json()["url"], "https://checkout.stripe.com/c/pay/cs_old")
        mock_create.assert_not_called()

        # If we cannot see the old session we must not leave it payable.
        with patch(
            "orders.views.retrieve_session", side_effect=StripeGatewayError("network"),
        ):
            replaced = self._pay()
        self.assertEqual(replaced.status_code, 200)
        mock_expire.assert_called_once()
        mock_create.assert_called_once()

        # The webhook is in flight: opening a second session here would charge
        # for money that has already moved.
        with patch(
            "orders.views.retrieve_session",
            return_value=_StubRetrieved(status="complete"),
        ):
            in_flight = self._pay()
        self.assertEqual(in_flight.status_code, 409)
        self.assertEqual(in_flight.json()["code"], "ALREADY_PAID")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_only_a_pending_online_order_with_stock_may_be_reopened(
        self, mock_retrieve, mock_create,
    ):
        offline = self._make_order(
            user=self.user, status=Order.STATUS_PLACED,
            payment_method=Order.PAYMENT_IN_STORE, stripe_session_id=None,
        )
        refused = self._pay(offline)
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.json()["code"], "NOT_ONLINE_ORDER")

        # ⚠ `canceled` is also what a tenant refusing an order writes, and what
        # the webhook writes on expiry. Neither may be undone from a browser.
        for status, code in (
            (Order.STATUS_PAID, "ALREADY_PAID"),
            (Order.STATUS_CANCELED, "ORDER_CLOSED"),
        ):
            self.order.status = status
            self.order.save()
            response = self._pay()
            self.assertEqual(response.status_code, 409, status)
            self.assertEqual(response.json()["code"], code)
        self.order.status = Order.STATUS_PENDING
        self.order.save()

        # Stock is re-derived, since the order has been sitting unpaid...
        self.product.in_stock = False
        self.product.save()
        sold_out = self._pay()
        self.assertEqual(sold_out.status_code, 409)
        self.assertEqual(sold_out.json()["code"], "OUT_OF_STOCK")

        # ...but the line is a snapshot of an agreement already made, so a tidied
        # catalog must not strand the order.
        self.product.delete()
        self.assertEqual(self._pay().status_code, 200)

        self.system.stripe_enabled = False
        self.system.save()
        unavailable = self._pay()
        self.assertEqual(unavailable.status_code, 503)
        self.assertEqual(unavailable.json()["code"], "PAYMENTS_UNAVAILABLE")

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_who_may_pay(self, mock_retrieve, mock_create):
        """⚠ `_may_pay` deliberately drops `_may_read`'s admin rule: reopening
        checkout expires the order's live session, so an admin who scanned a
        customer's QR while they were mid-payment on their phone would kill the
        session under them. Validating an order is a read; paying for one is not.
        """
        self.client.force_login(make_user("b@acme.test", self.system))
        self.assertEqual(self._pay().status_code, 404)

        self.client.force_login(make_user("mgr@acme.test", self.system, is_admin=True))
        self.assertEqual(
            self.client.get(f"/api/orders/{self.order.public_id}/").status_code, 200,
        )
        self.assertEqual(self._pay().status_code, 404)

        # A guest order has no owner to authenticate as - the unguessable
        # public_id in the URL is the only handle its customer has.
        guest_order = self._make_order(user=None)
        self.client.logout()
        self.assertEqual(
            self.client.post(
                f"/api/orders/{guest_order.public_id}/pay/",
                {"locale": "en"}, content_type="application/json",
                HTTP_X_WEBSITE_HOST="acme.test",
            ).status_code,
            200,
        )


class OrderPayBookingTests(_BookingFixture):
    """Reopening checkout on an appointment - where the slot is the whole point."""

    service_kwargs = {
        "booking_pay_full": True, "booking_pay_deposit": True,
        "booking_deposit_percent": 30,
    }

    def setUp(self):
        super().setUp()
        self.starts_at = self._slot()
        self.order = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING,
            payment_method=Order.PAYMENT_ONLINE, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
            stripe_session_id=f"cs_test_{uuid.uuid4().hex[:8]}",
        )
        OrderLine.objects.create(
            order=self.order, kind="service", service=self.service, name="Haircut",
            unit_price=Decimal("100.00"), quantity=1, line_total=Decimal("100.00"),
            currency="USD",
        )
        self.booking = Booking.objects.create(
            order=self.order, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=60),
            timezone="UTC", duration_minutes=60,
            payment_option=Booking.PAYMENT_FULL, amount_due_now=Decimal("100.00"),
        )

    def _pay(self):
        return self.client.post(
            f"/api/orders/{self.order.public_id}/pay/",
            {"locale": "en"}, content_type="application/json",
            HTTP_X_WEBSITE_HOST="acme.test",
        )

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_booking_pays_for_its_own_slot_but_not_one_taken_meanwhile(
        self, mock_retrieve, mock_create,
    ):
        """The booking is `pending`, so it occupies the very hour it is paying
        for - the availability re-check has to exclude it or nothing could ever
        be paid for."""
        response = self._pay()
        self.assertEqual(response.status_code, 200)
        # An appointment has its place already; Stripe must not ask where to post it.
        self.assertFalse(mock_create.call_args.kwargs["collect_shipping_address"])

        # Capacity is 1, so a second booking on the same hour means this one can
        # no longer be honoured - taking the money would sell an hour twice.
        rival_order = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="USD",
            subtotal=Decimal("100.00"), total=Decimal("100.00"),
        )
        Booking.objects.create(
            order=rival_order, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=60),
            timezone="UTC", duration_minutes=60,
        )
        mock_create.reset_mock()

        blocked = self._pay()
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()["code"], "SLOT_UNAVAILABLE")
        mock_create.assert_not_called()

    @patch("orders.views.create_checkout_session", return_value=_StubSession())
    @patch("orders.views.retrieve_session", return_value=_StubRetrieved(status="expired"))
    def test_a_deposit_booking_recharges_the_agreed_deposit(
        self, mock_retrieve, mock_create,
    ):
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


class AbandonedBookingTests(_BookingFixture):
    """⚠ A Booking is written *before* the redirect to Stripe and is born
    `pending`, which occupies its hour - deliberately, so two customers are not
    sent to Stripe for the same slot. But `_occupancy` reads `Booking.status`
    alone, so nothing that only moves `Order.status` releases it.

    Drop any of these and a customer who backs out of the Stripe page leaves that
    hour blocked forever - blocked hardest for themselves, since the slot they
    wanted is the one slot they can no longer rebook.
    """

    service_kwargs = {"booking_pay_full": True}

    def setUp(self):
        super().setUp()
        self.starts_at = self._slot()
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
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=60),
            timezone="UTC", duration_minutes=60,
            payment_option=Booking.PAYMENT_FULL, amount_due_now=Decimal("100.00"),
        )

    def _post_event(self, event_type, session_id="cs_test_booking", **extra):
        event = {
            "type": event_type,
            "data": {"object": {"id": session_id, "payment_status": "unpaid", **extra}},
        }
        with patch("orders.views.verify_webhook", return_value=event):
            return self.client.post(
                f"/api/orders/stripe/webhook/{self.system.stripe_webhook_token}/",
                data="{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=stub",
            )

    def _available(self):
        return is_slot_available(self.service, self.branch, self.starts_at)

    def test_a_dead_order_releases_its_slot(self):
        # The premise of the rest: a pending booking does occupy its hour.
        self.assertFalse(self._available())

        for event_type, order_status in (
            ("checkout.session.expired", Order.STATUS_CANCELED),
            ("checkout.session.async_payment_failed", Order.STATUS_FAILED),
        ):
            self.order.status = Order.STATUS_PENDING
            self.order.save()
            self.booking.status = Booking.STATUS_PENDING
            self.booking.save()

            self.assertEqual(self._post_event(event_type).status_code, 200)
            self.order.refresh_from_db()
            self.booking.refresh_from_db()
            self.assertEqual(self.order.status, order_status, event_type)
            self.assertEqual(self.booking.status, Booking.STATUS_CANCELED, event_type)
            self.assertTrue(self._available(), event_type)

        # The mirror of the bookings screen's own cancel: a tenant calling off
        # the job from the *orders* list must free the hour too.
        self.order.status = Order.STATUS_PENDING
        self.order.save()
        self.booking.status = Booking.STATUS_PENDING
        self.booking.save()
        self.client.force_login(make_user("admin@acme.test", self.system, is_admin=True))
        self.assertEqual(
            self.client.post(
                f"/api/orders/admin/{self.order.public_id}/", {"action": "cancel"},
                content_type="application/json",
            ).status_code,
            200,
        )
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.STATUS_CANCELED)
        self.assertTrue(self._available())

    def test_a_paid_booking_keeps_its_slot_and_a_plain_cart_is_unaffected(self):
        """Only a dead order releases. A redelivered expiry after payment must
        not hand away an appointment that is going ahead."""
        self._post_event("checkout.session.completed", payment_status="paid")
        self._post_event("checkout.session.expired")

        self.order.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(self.order.status, Order.STATUS_PAID)
        self.assertEqual(self.booking.status, Booking.STATUS_PENDING)
        self.assertFalse(self._available())

        # Most expiries are plain carts; the release must be a no-op for them.
        plain = Order.objects.create(
            system=self.system, status=Order.STATUS_PENDING, currency="USD",
            subtotal=Decimal("10.00"), total=Decimal("10.00"),
            stripe_session_id="cs_test_cart",
        )
        self.assertEqual(
            self._post_event("checkout.session.expired", session_id="cs_test_cart")
            .status_code,
            200,
        )
        plain.refresh_from_db()
        self.assertEqual(plain.status, Order.STATUS_CANCELED)


class PartyBookingTests(_BookingFixture):
    """Party size: **seats**, not bookings, and the arithmetic that has to agree.

    The premise of the whole feature is that turning it on changes nothing for a
    tenant that never configures it, so the first assertion here pins the old
    behaviour down at party size 1.
    """

    branch_kwargs = {"booking_capacity": 10}
    service_kwargs = {
        "booking_pay_in_person": True, "booking_party_enabled": True,
        "booking_party_min": 1, "booking_party_max": 8,
    }

    def setUp(self):
        super().setUp()
        self.service.duration = 240
        self.service.currency = "MXN"
        self.service.price = Decimal("500.00")
        self.service.save()

    def test_seats_reproduce_the_old_booking_count_at_party_one(self):
        """Capacity 3, three solo bookings, and the fourth is refused - exactly
        what counting rows used to do."""
        self.branch.booking_capacity = 3
        self.branch.save()
        slot = self._slot()

        for _ in range(3):
            self.assertEqual(
                self._book(starts_at=slot.isoformat(), party_size=1).status_code, 201,
            )
        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=1).status_code, 409,
        )

    def test_a_branch_with_no_pools_spends_its_capacity_in_seats(self):
        slot = self._slot()

        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=6).status_code, 201,
        )
        # 6 of 10 seats gone; a party of 5 no longer fits, a party of 4 does -
        # two parties sharing one departure.
        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=5).status_code, 409,
        )
        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=4).status_code, 201,
        )
        self.assertEqual(sum(b.party_size for b in Booking.objects.all()), 10)

    def test_the_party_multiplies_the_price_and_is_validated_never_clamped(self):
        response = self._book(party_size=4)
        booking = Booking.objects.get(pk=response.json()["booking_id"])
        self.assertEqual(booking.party_size, 4)
        self.assertEqual(booking.order.total, Decimal("2000.00"))
        self.assertEqual(booking.order.lines.get().quantity, 4)

        # Clamping would charge a customer for a different number of people than
        # they asked for.
        oversized = self._book(party_size=9)
        self.assertEqual(oversized.status_code, 400)
        self.assertEqual(oversized.json()["code"], "PARTY_SIZE_INVALID")

        # Party off forces 1 whatever the body claims.
        Booking.objects.all().delete()
        Order.objects.all().delete()
        self.service.booking_party_enabled = False
        self.service.save()
        forced = self._book(party_size=6)
        booking = Booking.objects.get(pk=forced.json()["booking_id"])
        self.assertEqual(booking.party_size, 1)
        self.assertEqual(booking.order.total, Decimal("500.00"))

    def test_the_availability_payload_reports_seats_left_per_party(self):
        slot = self._slot()
        self._book(starts_at=slot.isoformat(), party_size=4)
        cache.clear()

        def availability(party):
            return self.client.get(
                "/api/bookings/availability/",
                {"service": self.service.pk, "branch": self.branch.pk, "party": party},
                HTTP_X_WEBSITE_HOST="acme.test",
            ).json()

        payload = availability(2)
        self.assertEqual(payload["party"], 2)
        self.assertEqual(payload["party_max"], 8)
        entry = next(
            s
            for day in payload["availability"].values()
            for s in day
            if s["at"] in (slot.isoformat().replace("+00:00", "Z"), slot.isoformat())
        )
        self.assertEqual(entry["seats_left"], 6)

        # ⚠ `availability_key` includes `party`: leaving it out would serve a
        # party of six the calendar computed for a solo customer for a minute.
        self.branch.booking_capacity = 4
        self.branch.save()
        cache.clear()
        self.assertTrue(availability(1)["availability"])
        self.assertEqual(availability(8)["availability"], {})


class ResourcePoolTests(_BookingFixture):
    """Pools, best fit, and the customer-selectable picker.

    Assignment is automatic and **best fit**: of the resources that can take the
    whole party, the one with the least room left. That consolidates (two
    half-full boats become one) and so preserves the large free blocks large
    parties need; first fit does the precise opposite. A party never splits
    across two resources.
    """

    service_kwargs = {
        "booking_pay_in_person": True, "booking_party_enabled": True,
        "booking_party_min": 1, "booking_party_max": 10,
    }

    def setUp(self):
        super().setUp()
        self.service.duration = 240
        self.service.currency = "MXN"
        self.service.price = Decimal("500.00")
        self.service.save()
        self.pool = ResourcePool.objects.create(
            branch=self.branch, name="Boats", unit_label="boat",
        )
        self.small = BookingResource.objects.create(
            pool=self.pool, name="Panga", capacity=4,
        )
        self.large = BookingResource.objects.create(
            pool=self.pool, name="Marlin", capacity=10,
        )

    def test_best_fit_consolidates_and_seats_are_counted_per_resource(self):
        # `booking_capacity` is 1 on this fixture and irrelevant: the resources
        # say 14 seats, and that is what the engine counts.
        slot = self._slot()
        first = self._book(starts_at=slot.isoformat(), party_size=3)
        self.assertEqual(first.status_code, 201)
        booking = Booking.objects.get(pk=first.json()["booking_id"])
        # The 4-seat Panga, not the 10-seat Marlin: consolidating small parties
        # is what preserves the big boat for a party that needs it.
        self.assertEqual(booking.resource, self.small)
        self.assertEqual(booking.resource_name, "Panga")

        second = self._book(starts_at=slot.isoformat(), party_size=9)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(
            Booking.objects.get(pk=second.json()["booking_id"]).resource, self.large,
        )
        # 1 seat left on the Marlin, 1 on the Panga - and a party does not split.
        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=2).status_code, 409,
        )

        # 14 seats exist, but no single boat holds 12.
        Booking.objects.all().delete()
        self.service.booking_party_max = 14
        self.service.save()
        self.assertEqual(self._book(party_size=12).status_code, 409)

        # A disabled resource stops being offered.
        self.service.booking_party_max = 10
        self.service.save()
        self.large.enabled = False
        self.large.save()
        self.assertEqual(self._book(party_size=10).status_code, 409)
        self.assertEqual(self._book(party_size=4).status_code, 201)

    def test_a_pool_is_only_published_and_pickable_when_it_says_so(self):
        def resources():
            return self.client.get(
                "/api/bookings/availability/",
                {"service": self.service.pk, "branch": self.branch.pk},
                HTTP_X_WEBSITE_HOST="acme.test",
            ).json()["resources"]

        self.assertEqual(resources(), [])
        # A pick on a non-selectable pool is *ignored*, not refused.
        ignored = self._book(party_size=2, resource=self.large.pk)
        self.assertEqual(ignored.status_code, 201)
        self.assertEqual(
            Booking.objects.get(pk=ignored.json()["booking_id"]).resource, self.small,
        )
        Booking.objects.all().delete()
        Order.objects.all().delete()

        self.pool.customer_selectable = True
        self.pool.save()
        cache.clear()
        published = resources()
        self.assertEqual([r["name"] for r in published], ["Panga", "Marlin"])
        self.assertEqual(published[0]["unit_label"], "boat")

        # Best fit would have chosen the Panga; the customer asked for the Marlin.
        honoured = self._book(party_size=2, resource=self.large.pk)
        self.assertEqual(
            Booking.objects.get(pk=honoured.json()["booking_id"]).resource, self.large,
        )

        # Another tenant's resource can never be picked.
        other_system = System.objects.create(site_name="Beta", host="beta.test")
        other_branch = Branch.objects.create(system=other_system, name="Theirs")
        theirs = BookingResource.objects.create(
            pool=ResourcePool.objects.create(
                branch=other_branch, name="Theirs", customer_selectable=True,
            ),
            name="Theirs", capacity=50,
        )
        crossed = self._book(party_size=2, resource=theirs.pk)
        self.assertEqual(crossed.status_code, 201)
        self.assertNotEqual(
            Booking.objects.get(pk=crossed.json()["booking_id"]).resource, theirs,
        )

    def test_booking_pools_scopes_which_resources_a_service_uses(self):
        other = ResourcePool.objects.create(branch=self.branch, name="Kayaks")
        BookingResource.objects.create(pool=other, name="Kayak fleet", capacity=20)
        self.service.booking_pools.set([other])
        self.service.booking_party_max = 20
        self.service.save()

        response = self._book(party_size=20)

        self.assertEqual(
            Booking.objects.get(pk=response.json()["booking_id"]).resource.pool, other,
        )

    def test_an_unassigned_booking_is_charged_to_every_resource(self):
        """⚠ A row written before pools existed carries no assignment and there
        is no way to know which boat it is on - so it weighs on all of them
        rather than vanishing from the arithmetic and overselling every real one.
        """
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

        # 8 unattributed seats: the Panga (4) can take nobody, the Marlin (10)
        # has 2 left.
        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=3).status_code, 409,
        )
        self.assertEqual(
            self._book(starts_at=slot.isoformat(), party_size=2).status_code, 201,
        )


class BookingReassignTests(_BookingFixture):
    """Moving a party to another resource from the CMS."""

    service_kwargs = {"booking_party_enabled": True, "booking_party_max": 10}

    def setUp(self):
        super().setUp()
        self.service.duration = 240
        self.service.currency = "MXN"
        self.service.price = Decimal("500.00")
        self.service.save()
        self.pool = ResourcePool.objects.create(
            branch=self.branch, name="Boats", unit_label="boat",
        )
        self.small = BookingResource.objects.create(
            pool=self.pool, name="Panga", capacity=4,
        )
        self.large = BookingResource.objects.create(
            pool=self.pool, name="Marlin", capacity=10,
        )
        self.starts_at = self._slot()
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
        self.client.force_login(make_user("admin@acme.test", self.system, is_admin=True))

    def _patch(self, **body):
        return self.client.patch(
            f"/api/bookings/admin/{self.booking.pk}/",
            {"action": "reassign", **body}, content_type="application/json",
        )

    def _fill_the_marlin(self):
        other = Order.objects.create(
            system=self.system, status=Order.STATUS_PLACED, currency="MXN",
            subtotal=Decimal("0.00"), total=Decimal("0.00"),
        )
        Booking.objects.create(
            order=other, service=self.service, branch=self.branch,
            starts_at=self.starts_at, ends_at=self.starts_at + timedelta(minutes=240),
            timezone="UTC", duration_minutes=240, party_size=10, resource=self.large,
        )

    def test_a_reassignment_moves_the_snapshot_and_is_revalidated(self):
        response = self._patch(resource=self.large.pk)
        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.resource, self.large)
        self.assertEqual(self.booking.resource_name, "Marlin")

        # Refused by the availability *authority*, not by an inline check.
        self.booking.resource = self.small
        self.booking.resource_name = "Panga"
        self.booking.save()
        self._fill_the_marlin()
        refused = self._patch(resource=self.large.pk)
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.json()["code"], "RESOURCE_FULL")
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.resource, self.small)

        # Staff may overbook, but only deliberately.
        self.assertEqual(self._patch(resource=self.large.pk, force=True).status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.resource, self.large)

    def test_a_reassignment_refuses_what_it_may_not_move(self):
        other_system = System.objects.create(site_name="Beta", host="beta.test")
        theirs = BookingResource.objects.create(
            pool=ResourcePool.objects.create(
                branch=Branch.objects.create(system=other_system, name="Theirs"),
                name="Theirs",
            ),
            name="Theirs", capacity=99,
        )
        cross_tenant = self._patch(resource=theirs.pk)
        self.assertEqual(cross_tenant.status_code, 400)
        self.assertEqual(cross_tenant.json()["code"], "RESOURCE_INVALID")

        self.assertEqual(
            self.client.patch(
                f"/api/bookings/admin/{self.booking.pk}/", {"action": "reassign"},
                content_type="application/json",
            ).status_code,
            400,
        )

        self.booking.status = Booking.STATUS_COMPLETED
        self.booking.save()
        closed = self._patch(resource=self.large.pk)
        self.assertEqual(closed.status_code, 409)
        self.assertEqual(closed.json()["code"], "BOOKING_CLOSED")


class BookingCheckoutAtomicityTests(TransactionTestCase):
    """The seat check and the booking write must be one transaction, and the QR
    write must not be.

    Un-serialised, two checkouts can both see the last four seats free and both
    take them. Real concurrency is not what is tested here - threads against
    SQLite inside Django's own test transaction prove nothing about Postgres row
    locks. What is tested is the invariant that makes the lock work at all.

    ⚠ `TransactionTestCase`, not `TestCase`: the latter wraps every test in its
    own atomic block, so `in_atomic_block` would read True everywhere and both
    assertions below would be meaningless.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", is_main=True, timezone="UTC",
            booking_capacity=10, booking_min_notice_hours=0, booking_max_days_ahead=60,
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

    def _checkout(self, **extra):
        tomorrow = (timezone.now() + timedelta(days=1)).date()
        for offset in range(7):
            slots = slots_for_day(
                self.service, self.branch, tomorrow + timedelta(days=offset)
            )
            if slots:
                break
        else:
            raise AssertionError("the fixture branch offers no slots at all")
        return self.client.post(
            "/api/bookings/checkout/",
            {
                "service": self.service.pk, "branch": self.branch.pk,
                "fulfillment": "branch", "starts_at": slots[0].isoformat(),
                "payment_option": "in_person",
                "contact": {"name": "Ada", "email": "ada@example.test"},
                "locale": "en",
                **extra,
            },
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    def test_the_assignment_locks_and_the_qr_write_does_not(self):
        """A round-trip to object storage under a row lock would queue every
        other checkout at this branch behind the network."""
        seen = {}

        def spy(name, real):
            def wrapper(*args, **kwargs):
                seen[name] = transaction.get_connection().in_atomic_block
                return real(*args, **kwargs)

            return wrapper

        with patch.object(
            orders_views, "assign_for_slot",
            side_effect=spy("assign", orders_views.assign_for_slot),
        ), patch.object(
            orders_views, "attach_order_qr",
            side_effect=spy("qr", orders_views.attach_order_qr),
        ):
            response = self._checkout(party_size=4)

        self.assertEqual(response.status_code, 201)
        self.assertTrue(seen["assign"])
        self.assertFalse(seen["qr"])


# --------------------------------------------------------------------------- #
# Coupons - money
# --------------------------------------------------------------------------- #

class CouponTests(TestCase):
    """The discount engine: what a coupon is worth, and who may still have it.

    Every case here costs real money if it regresses - the arithmetic that
    decides what is charged, the tenant boundary, and the redemption ceiling that
    is the only thing standing between a campaign and being redeemed forever.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Beta", host="beta.test")
        self.product = Product.objects.create(
            system=self.system, name="Loaf", slug="loaf",
            price=Decimal("100.00"), currency="USD", stock_count=50,
        )
        self.admin = make_user("admin@acme.test", self.system, is_admin=True)

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

    def _refuses(self, coupon, code, **kwargs):
        with self.assertRaises(CouponError) as caught:
            validate_coupon(
                self.system, coupon.code if hasattr(coupon, "code") else coupon,
                subtotal=kwargs.get("subtotal", Decimal("100.00")),
                currency=kwargs.get("currency", "USD"),
            )
        self.assertEqual(caught.exception.code, code)

    def test_what_a_coupon_is_worth(self):
        self.assertEqual(discount_for(self._coupon(), Decimal("200.00")), Decimal("40.00"))
        # 33% of 10.10 is 3.333; the column holds two decimals, and a value that
        # does not round here is a total that will not reconcile against Stripe.
        self.assertEqual(
            discount_for(self._coupon(code="A", value=Decimal("33.00")), Decimal("10.10")),
            Decimal("3.33"),
        )
        fixed = self._coupon(code="B", kind=Coupon.KIND_FIXED, value=Decimal("15.00"))
        self.assertEqual(discount_for(fixed, Decimal("200.00")), Decimal("15.00"))
        # A negative total is not a refund - it is a Stripe session that cannot
        # be created and an order nobody can reconcile.
        big = self._coupon(code="C", kind=Coupon.KIND_FIXED, value=Decimal("500.00"))
        self.assertEqual(discount_for(big, Decimal("30.00")), Decimal("30.00"))

    def test_who_may_still_have_it(self):
        self._refuses(
            self._coupon(code="A", expires_at=timezone.now() - timedelta(days=1)),
            "COUPON_EXPIRED",
        )
        self._refuses(
            self._coupon(code="B", starts_at=timezone.now() + timedelta(days=1)),
            "COUPON_NOT_STARTED",
        )
        self._refuses(
            self._coupon(code="C", max_redemptions=2, times_redeemed=2),
            "COUPON_EXHAUSTED",
        )
        self._refuses(self._coupon(code="D", enabled=False), "COUPON_INACTIVE")
        self._refuses(
            self._coupon(code="E", min_order_amount=Decimal("150.00")), "COUPON_MIN_ORDER",
        )
        # Honouring a fixed amount in another currency would mean inventing an
        # exchange rate - the same thing checkout refuses for a mixed cart.
        self._refuses(
            self._coupon(
                code="F", kind=Coupon.KIND_FIXED, value=Decimal("50.00"), currency="MXN",
            ),
            "COUPON_WRONG_CURRENCY",
        )
        # A percentage carries no currency and applies to any basket.
        percent = self._coupon(code="G", currency="MXN")
        self.assertEqual(
            validate_coupon(
                self.system, "G", subtotal=Decimal("100.00"), currency="USD",
            ),
            percent,
        )
        # The customer is typing off a poster, on a keyboard that auto-capitalises.
        mixed = self._coupon(code="SummerSale")
        self.assertEqual(find_coupon(self.system, "summersale"), mixed)
        self.assertEqual(find_coupon(self.system, "  SUMMERSALE "), mixed)

    def test_another_tenants_coupon_is_not_found(self):
        """A code guessed off a rival's poster must not work here, and must be
        indistinguishable from a code that does not exist."""
        Coupon.objects.create(
            system=self.other_system, code="BETAONLY",
            kind=Coupon.KIND_PERCENT, value=Decimal("50.00"),
        )
        self._refuses("BETAONLY", "COUPON_NOT_FOUND")

        theirs = Coupon.objects.get(code="BETAONLY")
        self.client.force_login(self.admin)
        self.assertEqual(
            self.client.get(f"/api/coupons/admin/{theirs.pk}/").status_code, 404,
        )

    def test_the_redemption_ceiling_is_a_single_conditional_update(self):
        """⚠ Two customers checking out at the same instant both pass
        `validate_coupon`; a read-modify-write would let both take the 50th of 50
        redemptions and store 50 either way. `.update()` returning 0 means
        someone else won."""
        coupon = self._coupon(max_redemptions=2)
        self.assertTrue(redeem_coupon(coupon))
        coupon.refresh_from_db()
        self.assertTrue(redeem_coupon(coupon))
        coupon.refresh_from_db()
        # The third must fail even though `coupon` in memory is stale.
        self.assertFalse(redeem_coupon(coupon))
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 2)

        # The race the up-front validation cannot close: two checkouts both read
        # the coupon with one redemption left. Only one may take it.
        single = self._coupon(code="ONE", max_redemptions=1)
        first = Coupon.objects.get(pk=single.pk)
        second = Coupon.objects.get(pk=single.pk)
        self.assertTrue(redeem_coupon(first))
        self.assertFalse(redeem_coupon(second))
        single.refresh_from_db()
        self.assertEqual(single.times_redeemed, 1)

        unlimited = self._coupon(code="FOREVER", max_redemptions=0)
        for _ in range(3):
            self.assertTrue(redeem_coupon(unlimited))
        unlimited.refresh_from_db()
        self.assertEqual(unlimited.times_redeemed, 3)

        # ⚠ A dead order has to hand its redemption back, floored at zero so a
        # double-delivered webhook cannot drive a PositiveIntegerField negative
        # and fail a webhook that has nothing else wrong with it.
        released = self._coupon(code="BACK")
        redeem_coupon(released)
        released.refresh_from_db()
        self.assertTrue(release_coupon(released))
        self.assertFalse(release_coupon(released))
        released.refresh_from_db()
        self.assertEqual(released.times_redeemed, 0)

    def test_a_sale_records_the_discount_and_takes_a_redemption(self):
        coupon = self._coupon(max_redemptions=5)

        response = self._sell({
            "cart": self._cart(quantity=2), "payment_method": "cash",
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

        # `Order.coupon` is SET_NULL and the two columns are snapshots: deleting
        # a finished campaign must not erase the record of the discounts it gave.
        coupon.delete()
        order.refresh_from_db()
        self.assertIsNone(order.coupon)
        self.assertEqual(order.coupon_code, "SUMMER20")
        self.assertEqual(order.discount_amount, Decimal("40.00"))

    def test_a_scoped_coupon_only_discounts_what_it_is_for(self):
        """⚠ The whole point of `Coupon.scope_kind`: "20% off pizzas" must take a
        fifth of the pizzas and nothing off the jacket beside them.

        Every assertion here is money. A scope that silently widened to the whole
        basket would over-discount every mixed order; one that silently narrowed
        to nothing would charge a customer the full price of an offer they were
        quoted a discount on."""
        bakery = ProductCategory.objects.create(
            system=self.system, name="Bakery", slug="bakery",
        )
        Product.objects.filter(pk=self.product.pk).update(category=bakery)
        self.product.refresh_from_db()
        jacket = Product.objects.create(
            system=self.system, name="Jacket", slug="jacket",
            price=Decimal("300.00"), currency="USD", stock_count=5,
        )

        basket = [
            CartItem(product=self.product, quantity=2),   # 200.00, in Bakery
            CartItem(product=jacket, quantity=1),         # 300.00, uncategorized
        ]
        subtotal = Decimal("500.00")

        # Scoped to the item: a fifth of 200, not of 500.
        on_item = self._coupon(
            code="LOAF20", scope_kind=Coupon.SCOPE_PRODUCT, scope_id=self.product.pk,
        )
        self.assertEqual(eligible_subtotal(on_item, basket), Decimal("200.00"))
        self.assertEqual(discount_for(on_item, subtotal, basket), Decimal("40.00"))

        # Scoped to the category: the same lines here, but by a different route -
        # the line is judged on its `category_id` rather than its own id.
        on_category = self._coupon(
            code="BAKERY20",
            scope_kind=Coupon.SCOPE_PRODUCT_CATEGORY, scope_id=bakery.pk,
        )
        self.assertEqual(discount_for(on_category, subtotal, basket), Decimal("40.00"))

        # ⚠ A fixed amount is clamped to the *eligible* base, not the subtotal -
        # or a 500-off coupon aimed at one 200-peso line would take 500 off a
        # basket that merely contains it.
        fixed = self._coupon(
            code="LOAF500", kind=Coupon.KIND_FIXED, value=Decimal("500.00"),
            scope_kind=Coupon.SCOPE_PRODUCT, scope_id=self.product.pk,
        )
        self.assertEqual(discount_for(fixed, subtotal, basket), Decimal("200.00"))

        # A basket with none of the target is refused, never discounted by zero:
        # a code that appeared to apply and changed nothing has no explanation on
        # screen.
        with self.assertRaises(CouponError) as caught:
            validate_coupon(
                self.system, "LOAF20", subtotal=Decimal("300.00"), currency="USD",
                lines=[CartItem(product=jacket, quantity=1)],
            )
        self.assertEqual(caught.exception.code, "COUPON_NOT_APPLICABLE")

        # ⚠ And a scoped coupon handed no lines raises rather than falling back
        # to the whole subtotal - the fallback is the over-discount this feature
        # exists to prevent, so it must never be reachable by omission.
        with self.assertRaises(ValueError):
            discount_for(on_item, subtotal)

        # An order-wide coupon is unaffected by any of it and needs no lines.
        self.assertEqual(discount_for(self._coupon(code="ALL20"), subtotal), Decimal("100.00"))

        # End to end at the till, which is where the arithmetic is actually
        # charged: two loaves and a jacket, 20% off the loaves only.
        self._coupon(
            code="TILL20", scope_kind=Coupon.SCOPE_PRODUCT, scope_id=self.product.pk,
        )
        response = self._sell({
            "cart": [
                {"kind": "product", "id": self.product.pk, "quantity": 2},
                {"kind": "product", "id": jacket.pk, "quantity": 1},
            ],
            "payment_method": "cash",
            "coupon_code": "till20",
        })
        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(public_id=response.json()["public_id"])
        self.assertEqual(order.subtotal, Decimal("500.00"))
        self.assertEqual(order.discount_amount, Decimal("40.00"))
        self.assertEqual(order.total, Decimal("460.00"))

    def test_the_scope_snapshot_names_the_category_the_target_is_filed_under(self):
        """The flyer prints "Bakery - Sourdough", so the snapshot the CMS draws it
        from has to carry the category as well as the name - a dish name on its
        own says nothing about where on the menu the offer sits.

        A category target is filed under nothing (its `parent` is a different
        question) and an uncategorized product has no answer to give, so both
        report None rather than a prefix the flyer would draw as a dangling
        separator."""
        bakery = ProductCategory.objects.create(
            system=self.system, name="Bakery", slug="bakery",
        )
        Product.objects.filter(pk=self.product.pk).update(category=bakery)
        loose = Product.objects.create(
            system=self.system, name="Jacket", slug="jacket",
            price=Decimal("300.00"), currency="USD",
        )
        on_item = self._coupon(
            code="LOAF10", scope_kind=Coupon.SCOPE_PRODUCT, scope_id=self.product.pk,
        )
        on_loose = self._coupon(
            code="COAT10", scope_kind=Coupon.SCOPE_PRODUCT, scope_id=loose.pk,
        )
        on_category = self._coupon(
            code="BAKERY10",
            scope_kind=Coupon.SCOPE_PRODUCT_CATEGORY, scope_id=bakery.pk,
        )

        self.client.force_login(self.admin)

        def scope(coupon):
            response = self.client.get(f"/api/coupons/admin/{coupon.pk}/")
            self.assertEqual(response.status_code, 200)
            return response.json()["scope"]

        self.assertEqual(scope(on_item)["category_name"], "Bakery")
        self.assertIsNone(scope(on_loose)["category_name"])
        self.assertIsNone(scope(on_category)["category_name"])

    def test_a_coupon_cannot_be_scoped_to_another_tenants_item(self):
        """⚠ `scope_id` is a bare integer with no FK behind it, and the pricing
        engine matches a cart line by id *within its own family* - so a coupon
        carrying a rival's product id would discount whichever of this tenant's
        items happened to share the number."""
        theirs = Product.objects.create(
            system=self.other_system, name="Theirs", slug="theirs",
            price=Decimal("10.00"), currency="USD",
        )
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/coupons/admin/",
            {
                "code": "CROSS", "kind": "percent", "value": "10.00",
                "scope_kind": "product", "scope_id": theirs.pk,
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("scope_id", response.json())

        # A kind with no id names a table and no row, which would match every
        # line in that family - refused in the serializer, before the model's
        # check constraint has to answer with a 500.
        self.assertEqual(
            self.client.post(
                "/api/coupons/admin/",
                {"code": "HALF", "kind": "percent", "value": "10.00",
                 "scope_kind": "product"},
                content_type="application/json",
            ).status_code,
            400,
        )

        plain = self._sell({"cart": self._cart(), "payment_method": "cash"})
        untouched = Order.objects.get(public_id=plain.json()["public_id"])
        self.assertEqual(untouched.discount_amount, Decimal("0.00"))
        self.assertEqual(untouched.total, untouched.subtotal)
        self.assertEqual(untouched.coupon_code, "")

    def test_a_refused_coupon_writes_no_order_and_touches_no_stock(self):
        """The order is discarded rather than left as a phantom, exactly as the
        Stripe-failure branches discard theirs - a customer quoted 160 and
        charged 200 is a surprise on the Stripe page, and at a counter it is an
        associate reading one number off the till while the receipt prints
        another."""
        self._coupon(expires_at=timezone.now() - timedelta(days=1))

        response = self._sell({
            "cart": self._cart(quantity=3), "payment_method": "cash",
            "coupon_code": "SUMMER20",
        })

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "COUPON_EXPIRED")
        self.assertFalse(Order.objects.exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_count, 50)

    def test_the_advisory_endpoints_price_without_redeeming(self):
        coupon = self._coupon(
            name="Internal name", max_redemptions=50, times_redeemed=12,
        )

        validated = self.client.post(
            "/api/coupons/validate/",
            {"code": "SUMMER20", "cart": self._cart(quantity=2)},
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(validated.status_code, 200)
        self.assertEqual(validated.json()["discount"], "40.00")
        self.assertEqual(validated.json()["total"], "160.00")
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_redeemed, 12)  # nothing consumed by asking

        self.assertEqual(
            self.client.post(
                "/api/coupons/validate/", {"code": "SUMMER20", "cart": []},
                content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
            ).json()["code"],
            "CART_EMPTY",
        )

        # The public landing serves what the offer *is*, never how the campaign
        # is performing.
        landing = self.client.get(
            "/api/coupons/SUMMER20/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(landing.status_code, 200)
        self.assertTrue(landing.json()["valid"])
        for leaked in ("times_redeemed", "max_redemptions", "name"):
            self.assertNotIn(leaked, landing.json())

        # 200 with valid:false, not 404: the page has to be able to say "this
        # offer has ended" for a code the tenant really did print.
        coupon.expires_at = timezone.now() - timedelta(days=1)
        coupon.save()
        expired = self.client.get(
            "/api/coupons/SUMMER20/", HTTP_X_WEBSITE_HOST="acme.test",
        )
        self.assertEqual(expired.status_code, 200)
        self.assertFalse(expired.json()["valid"])

        self.assertEqual(
            self.client.get(
                "/api/coupons/NOPE/", HTTP_X_WEBSITE_HOST="acme.test",
            ).status_code,
            404,
        )

    def test_the_admin_crud_validates_the_code_and_writes_its_qr(self):
        self.client.force_login(self.admin)

        created = self.client.post(
            "/api/coupons/admin/", {"code": "NEW10", "kind": "percent", "value": "10.00"},
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()["qr_code"])
        self.assertTrue(Coupon.objects.get(code="NEW10").qr_code)

        for body in (
            {"code": "TOOMUCH", "kind": "percent", "value": "120.00"},
            # It travels in the `/coupon/<code>` path the QR encodes.
            {"code": "SUM/20", "kind": "percent", "value": "10.00"},
        ):
            self.assertEqual(
                self.client.post(
                    "/api/coupons/admin/", body, content_type="application/json",
                ).status_code,
                400, body,
            )

        # ⚠ A coupon's code is editable and the PNG encodes a URL built from it,
        # so a rename has to re-render - and the file is named after `public_id`,
        # not `code`, so a tenant fixing a typo does not orphan the PNG that is
        # already on a printed flyer.
        coupon = Coupon.objects.get(code="NEW10")
        attach_coupon_qr(coupon)
        before = coupon.qr_code.name
        renamed = self.client.patch(
            f"/api/coupons/admin/{coupon.pk}/", {"code": "WINTER30"},
            content_type="application/json",
        )
        self.assertEqual(renamed.status_code, 200)
        coupon.refresh_from_db()
        self.assertEqual(coupon.qr_code.name, before)
        with coupon.qr_code.open("rb") as handle:
            self.assertTrue(handle.read())

        plated = self.client.patch(
            f"/api/coupons/admin/{coupon.pk}/",
            {
                "brand_logo_background": "hexagon",
                "brand_logo_background_scale": 80,
                "brand_logo_scale": 60,
            },
            content_type="application/json",
        )
        self.assertEqual(plated.status_code, 200)
        self.assertEqual(plated.json()["brand_logo_background"], "hexagon")
        coupon.refresh_from_db()
        self.assertEqual(coupon.brand_logo_background_scale, 80)
        # Below 30 the logo all but vanishes, and there is nothing above 100 to
        # draw - and the CMS is not the only possible caller.
        self.assertEqual(
            self.client.patch(
                f"/api/coupons/admin/{coupon.pk}/", {"brand_logo_scale": 10},
                content_type="application/json",
            ).status_code,
            400,
        )

        # Last, because the view catches the IntegrityError rather than taking a
        # savepoint first, which leaves this TestCase's transaction unusable.
        # The unique constraint is on Upper("code") per system: two rows
        # differing only in case would race for the same redemptions.
        self.assertEqual(
            self.client.post(
                "/api/coupons/admin/",
                {"code": "winter30", "kind": "percent", "value": "10.00"},
                content_type="application/json",
            ).status_code,
            400,
        )


class OrderLineSizeSnapshotTests(TestCase):
    """An order line freezes the size it sold, like every other displayable fact
    on it - the receipt has to keep saying "Grande" after the tenant renames or
    retires that size."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(
            site_name="Piccolo", host="piccolo.test", pay_in_store_enabled=True,
        )
        category = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="snap-pizzas",
        )
        self.item = MenuItem.objects.create(
            system=self.system, category=category, name="Margarita",
            slug="snap-margarita", price=Decimal("200.00"), currency="MXN",
        )
        MenuSize.objects.create(
            category=category, name="Mediana", price_delta=Decimal("0.00"),
            is_default=True, sort_order=0,
        )
        self.large = MenuSize.objects.create(
            category=category, name="Grande", en_name="Large",
            price_delta=Decimal("40.00"), sort_order=1,
        )
        self.user = make_user("a@piccolo.test", self.system)
        self.client.force_login(self.user)

    def _place(self):
        response = self.client.post(
            "/api/orders/checkout/",
            {
                "locale": "en", "payment_method": "in_store",
                "contact": {"name": "Jo", "phone": "555-1234"},
            },
            content_type="application/json", HTTP_X_WEBSITE_HOST="piccolo.test",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return Order.objects.get(public_id=response.json()["order_id"])

    def test_the_line_freezes_the_size_it_sold(self):
        CartItem.objects.create(
            user=self.user, system=self.system, menu_item=self.item,
            menu_size=self.large, quantity=1,
        )
        order = self._place()
        line = order.lines.get()
        self.assertEqual(line.size_name, "Grande")
        self.assertEqual(line.size_en_name, "Large")
        # The delta is already inside `unit_price`; it is stored so the line
        # reads back as base + size rather than as one unreconcilable number.
        self.assertEqual(line.size_price_delta, Decimal("40.00"))
        self.assertEqual(line.unit_price, Decimal("240.00"))

        self.large.delete()
        line.refresh_from_db()
        self.assertEqual(line.size_name, "Grande")
        self.assertEqual(line.unit_price, Decimal("240.00"))

        # A dish sold in one size records nothing.
        self.item.sizes_enabled = True
        self.item.sizes_enabled = False
        self.item.save()
        CartItem.objects.create(
            user=self.user, system=self.system, menu_item=self.item, quantity=1,
        )
        plain = self._place().lines.get()
        self.assertEqual(plain.size_name, "")
        self.assertEqual(plain.size_price_delta, Decimal("0.00"))
        self.assertEqual(plain.unit_price, Decimal("200.00"))
