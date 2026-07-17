import logging
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import F, Value
from django.db.models.functions import Greatest
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import System
from core.tenancy import user_system
from users.cache import invalidate_cart
from users.models import CartItem

from .cache import ORDERS_CACHE_TTL, invalidate_orders, orders_key
from .models import Order, OrderLine
from .serializers import CheckoutSerializer, OrderSerializer, OrderSummarySerializer
from .services.stripe_gateway import (
    StripeGatewayError,
    StripeNotConfigured,
    create_checkout_session,
    verify_webhook,
)

logger = logging.getLogger(__name__)


def _site_base_url(system) -> str:
    """The origin Stripe sends the customer back to after paying.

    Derived from the System's own `host`, never from a request header. This is a
    redirect target handed to a third party, so letting the browser influence it
    (via X-Website-Host, which any client can set) would turn checkout into an
    open redirect on the tenant's domain - a ready-made phishing step in the
    middle of a payment flow, where the customer is least likely to notice.

    The local default host has no port, so development falls back to FRONTEND_URL.
    """
    host = (system.host or "").strip()
    if not host or host in {"localhost", "127.0.0.1"}:
        return settings.FRONTEND_URL.rstrip("/")
    return f"https://{host}"


def _cart_qs(user, system):
    return (
        CartItem.objects
        .filter(user=user, system=system)
        .select_related('product', 'service', 'menu_item', 'product_variant', 'service_variant')
        .prefetch_related(
            'product_variant__option_values', 'service_variant__option_values',
            'menu_item__ingredients',
        )
    )


def _customization_snapshot(item):
    """A human-readable freeze of a menu line's chosen ingredients.

    Built from the item's normalised selection and today's ingredient rows, so
    the order records exactly what the kitchen and the customer agreed to - and
    keeps rendering after the ingredient rows are edited or deleted. Returns []
    for products, services, and menu items left exactly as listed.
    """
    if not item.menu_item_id or not item.customization:
        return []
    by_id = {ing.id: ing for ing in item.menu_item.ingredients.all()}
    snapshot = []
    for row in item.customization:
        ingredient = by_id.get(row.get('ingredient'))
        if ingredient is None:
            continue
        qty = int(row.get('quantity', 0))
        chargeable = max(0, qty - ingredient.included_units)
        snapshot.append({
            'name': ingredient.name,
            'quantity': qty,
            'unit_price': str(ingredient.price),
            'line_upcharge': str(ingredient.upcharge_for_quantity(qty)),
            'removed': ingredient.is_default and qty == 0,
        })
    return snapshot


def _variant_label(variant) -> str:
    """"Size: Large, Color: Red" - what distinguishes this variant, frozen as text.

    Matches BaseVariant.__str__'s option rendering. Stored on the line because
    the variant row may be gone by the time anyone reads the order back.
    """
    if variant is None:
        return ""
    return ", ".join(str(value) for value in variant.option_values.all())


class CheckoutView(APIView):
    """
    POST /api/orders/checkout/ - turn the user's cart into a pending Order and a
    Stripe Checkout Session, and return the URL to redirect to.

    The request body carries only a locale. Items, quantities, prices and
    currency are all read from the cart server-side: a client that could name a
    price could name its own.

    Nothing here marks anything paid. This creates a `pending` Order and hands
    back a Stripe URL; only the webhook (which is signed) may move it to `paid`.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        locale = serializer.validated_data.get("locale") or "en"

        system = user_system(request)
        if system is None:
            return Response(
                {"detail": "No system for this user.", "code": "NO_SYSTEM"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not system.stripe_configured:
            # Not 500: nothing is broken, this site simply has not connected a
            # Stripe account. The frontend hides the button on the same signal.
            return Response(
                {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        items = list(_cart_qs(request.user, system))
        if not items:
            return Response(
                {"detail": "Your cart is empty.", "code": "CART_EMPTY"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # A Checkout Session is single-currency and Buyable.currency is per item,
        # so a mixed cart has no correct total to charge. Refused rather than
        # converted: we have no rate, and inventing one would be charging a price
        # nobody agreed to.
        currencies = {item.target.currency for item in items}
        if len(currencies) > 1:
            return Response(
                {
                    "detail": "Your cart has items in more than one currency.",
                    "code": "MIXED_CURRENCY",
                    "currencies": sorted(currencies),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        currency = currencies.pop()

        # Re-checked at checkout rather than trusted from when the line was added:
        # the cart holds a row for as long as the user leaves it there, and the
        # item may have sold out in the meantime.
        out_of_stock = [item for item in items if not _in_stock(item)]
        if out_of_stock:
            return Response(
                {
                    "detail": "Some items are no longer available.",
                    "code": "OUT_OF_STOCK",
                    "line_ids": [item.pk for item in out_of_stock],
                },
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            order = Order.objects.create(
                system=system,
                user=request.user,
                status=Order.STATUS_PENDING,
                currency=currency,
                email=request.user.email or "",
            )
            lines = [
                OrderLine.objects.create(
                    order=order,
                    kind=item.kind,
                    product=item.product,
                    service=item.service,
                    menu_item=item.menu_item,
                    product_variant=item.product_variant,
                    service_variant=item.service_variant,
                    name=item.target.name or "",
                    variant_label=_variant_label(item.variant),
                    sku=getattr(item.variant, "sku", "") or getattr(item.target, "sku", "") or "",
                    customization=_customization_snapshot(item),
                    unit_price=item.unit_price,
                    quantity=item.quantity,
                    line_total=item.line_total,
                    currency=currency,
                )
                for item in items
            ]
            subtotal = sum((line.line_total for line in lines), Decimal("0.00"))
            order.subtotal = subtotal
            # No tax or shipping is modelled yet, so the total is the subtotal.
            # They get their own columns when they exist rather than being folded
            # in here, where they would be indistinguishable after the fact.
            order.total = subtotal
            order.save(update_fields=["subtotal", "total"])

        base_url = _site_base_url(system)
        try:
            session = create_checkout_session(
                system=system,
                order=order,
                lines=lines,
                success_url=f"{base_url}/{locale}/orders/{order.public_id}?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{base_url}/{locale}/cart",
                customer_email=request.user.email or "",
            )
        except StripeNotConfigured:
            order.delete()
            return Response(
                {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except StripeGatewayError:
            # The order has no session and can never be paid, so it would only sit
            # in the customer's history as a phantom. Already logged in the gateway
            # with the upstream detail, which is not for the browser.
            order.delete()
            return Response(
                {"detail": "Could not start checkout. Please try again.", "code": "STRIPE_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.stripe_session_id = session.id
        order.save(update_fields=["stripe_session_id", "updated_at"])
        invalidate_orders(request.user.id, system.id)

        logger.info("Checkout session %s created for order %s", session.id, order.pk)
        return Response({"url": session.url, "order_id": str(order.public_id)}, status=status.HTTP_201_CREATED)


def _in_stock(item) -> bool:
    """Services are always orderable; a menu item follows its own availability
    flag; only products carry stock.

    The same rule CartItemSerializer.get_in_stock reports to the cart page, so
    what the customer was shown and what checkout enforces cannot drift.
    """
    if item.service_id:
        return True
    if item.menu_item_id:
        return item.menu_item.is_available
    if item.product_variant_id:
        return item.product_variant.in_stock
    return item.product.in_stock


class OrderListView(APIView):
    """GET /api/orders/ - the authenticated user's order history for this tenant."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        system = user_system(request)
        cache_key = orders_key(request.user.id, system.id if system else 0)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        orders = (
            Order.objects
            .filter(user=request.user, system=system)
            .prefetch_related(
                "lines", "lines__product", "lines__service", "lines__menu_item",
                "lines__product_variant", "lines__service_variant",
                # The image preview falls back to the item's gallery when it has
                # no own `image`; prefetch it so the strip is not an N+1.
                "lines__product__images", "lines__service__images", "lines__menu_item__images",
            )
        )
        data = OrderSummarySerializer(orders, many=True, context={"request": request}).data
        cache.set(cache_key, data, ORDERS_CACHE_TTL)
        return Response(data)


# A paid order is a record of money that changed hands, and a refunded one was
# paid before it was reversed - both are financial history the customer must not
# be able to erase. Only orders that never completed a payment (a pending session
# they abandoned, or one Stripe expired/failed) may be removed from the history.
DELETABLE_STATUSES = frozenset(
    {Order.STATUS_PENDING, Order.STATUS_FAILED, Order.STATUS_CANCELED}
)


class OrderDetailView(APIView):
    """GET/DELETE /api/orders/<public_id>/ - one order in full, or remove it.

    Addressed by the public UUID, never the pk: the sequential id stays inside
    the database. Uncached on purpose: the confirmation page polls this while
    the webhook is still in flight, and a cached `pending` would outlive the
    payment.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request, public_id):
        # Filtering by user is the authorization check: another user's order id
        # simply does not exist as far as this request is concerned.
        order = (
            Order.objects
            .filter(public_id=public_id, user=request.user, system=user_system(request))
            .prefetch_related(
                "lines", "lines__product", "lines__service",
                "lines__product_variant", "lines__service_variant",
                # The serializer falls back to the item's gallery when it has no
                # own `image`; prefetch it so that fallback is not an N+1.
                "lines__product__images", "lines__service__images",
            )
            .first()
        )
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order, context={"request": request}).data)

    def delete(self, request, public_id):
        """Remove one of the caller's own orders from their history.

        Scoped to the user, exactly as the GET is: another user's id is a 404,
        never a 403, so this endpoint cannot be used to probe which order ids
        exist. A paid or refunded order is refused (403) - it is financial
        history, not clutter (see `DELETABLE_STATUSES`). The delete cascades to
        the order's lines.
        """
        order = (
            Order.objects
            .filter(public_id=public_id, user=request.user, system=user_system(request))
            .first()
        )
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if order.status not in DELETABLE_STATUSES:
            return Response(
                {"detail": "A paid order cannot be deleted.", "code": "ORDER_NOT_DELETABLE"},
                status=status.HTTP_403_FORBIDDEN,
            )

        system_id = order.system_id
        order.delete()
        invalidate_orders(request.user.id, system_id or 0)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StripeWebhookView(APIView):
    """
    POST /api/orders/stripe/webhook/<token>/ - Stripe's payment notifications.

    **This is the only thing that may mark an order paid.** The browser's return
    to the success URL proves nothing: it is a plain redirect the customer can
    forge, replay, or simply never follow by closing the tab mid-payment.

    The endpoint is keyed per tenant because each connects its own Stripe account
    and so has its own signing secret - each pastes this URL, with their own
    token, into their own dashboard. A single shared URL would leave us trying
    every tenant's secret against every event, unable to distinguish a forgery
    from a mis-routed delivery.

    The key is `stripe_webhook_token`, not the pk: the tenant is shown this URL
    in the CMS to paste into Stripe, and the pk would make that a handout of
    every other tenant's addressable id. The token is not a credential, though -
    it only routes. The signature is what authenticates.

    Unauthenticated by necessity (Stripe has no session here); the signature *is*
    the authentication, and an unsigned or unverifiable request is rejected
    before anything is read out of it.
    """

    authentication_classes = []
    permission_classes = (AllowAny,)

    def post(self, request, token):
        system = System.objects.filter(stripe_webhook_token=token).first()
        if system is None:
            return Response({"detail": "Unknown system."}, status=status.HTTP_404_NOT_FOUND)
        system_id = system.pk

        signature = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        try:
            # request.body, not request.data: the signature covers the exact bytes
            # Stripe sent, and a parsed-then-reserialized payload would not match.
            event = verify_webhook(system, request.body, signature)
        except StripeNotConfigured:
            logger.error("Webhook for system %s but no webhook secret is set", system_id)
            return Response({"detail": "Not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ValueError as exc:
            # Covers both an unparseable body and a failed signature check
            # (SignatureVerificationError subclasses ValueError).
            logger.warning("Stripe webhook rejected for system %s: %s", system_id, exc)
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        handler = {
            "checkout.session.completed": self._handle_completed,
            "checkout.session.expired": self._handle_expired,
            "checkout.session.async_payment_failed": self._handle_failed,
        }.get(event["type"])

        if handler is None:
            # 200, not 4xx: an event we do not act on is not an error, and telling
            # Stripe otherwise would make it retry the delivery for days.
            return Response({"received": True})

        session = event["data"]["object"]
        order = self._order_for(system, session)
        if order is None:
            logger.error(
                "Stripe event %s for system %s names no known order (session %s)",
                event["type"], system_id, session.get("id"),
            )
            # 200 as well: retrying cannot conjure the order, and a permanent 4xx
            # here only fills the tenant's dashboard with failed deliveries.
            return Response({"received": True})

        handler(order, session)
        return Response({"received": True})

    def _order_for(self, system, session):
        """The order this session belongs to, scoped to the verified System.

        Looked up by session id, and by our own metadata only as a fallback -
        both re-read from our database. Nothing in the payload's amounts is
        trusted: the money was agreed when the order was written.

        Scoping to `system` matters even though the signature is verified: it is
        what stops one tenant's (valid) event from ever naming another tenant's
        order.
        """
        session_id = session.get("id")
        order = Order.objects.filter(stripe_session_id=session_id, system=system).first()
        if order is not None:
            return order

        order_id = (session.get("metadata") or {}).get("order_id")
        if not order_id:
            return None
        return Order.objects.filter(pk=order_id, system=system).first()

    def _handle_completed(self, order, session):
        # Stripe re-delivers on any non-2xx and can send the same event twice, so
        # this must be idempotent: a second delivery for an order already paid
        # must not re-clear a cart the customer has since refilled.
        if order.status == Order.STATUS_PAID:
            logger.info("Duplicate completed webhook for order %s ignored", order.pk)
            return

        # `payment_status` is what says the money actually moved. A completed
        # session can still be unpaid (a delayed method like a bank debit), and
        # treating that as paid would ship the goods on a promise.
        if session.get("payment_status") not in {"paid", "no_payment_required"}:
            logger.info(
                "Session %s completed but payment_status=%s; leaving order %s pending",
                session.get("id"), session.get("payment_status"), order.pk,
            )
            return

        with transaction.atomic():
            order.status = Order.STATUS_PAID
            order.paid_at = timezone.now()
            order.stripe_payment_intent_id = session.get("payment_intent") or ""
            order.email = session.get("customer_details", {}).get("email") or order.email
            self._apply_shipping(order, session)
            order.save()
            self._decrement_stock(order)
            # The cart did its job the moment the order was written; leaving it
            # full would invite the customer to pay for the same thing twice.
            CartItem.objects.filter(user=order.user, system=order.system).delete()

        invalidate_cart(order.user_id, order.system_id or 0)
        invalidate_orders(order.user_id, order.system_id or 0)
        logger.info("Order %s paid (payment_intent %s)", order.pk, order.stripe_payment_intent_id)

    def _handle_expired(self, order, session):
        if order.status != Order.STATUS_PENDING:
            return
        order.status = Order.STATUS_CANCELED
        order.save(update_fields=["status", "updated_at"])
        invalidate_orders(order.user_id, order.system_id or 0)

    def _handle_failed(self, order, session):
        if order.status != Order.STATUS_PENDING:
            return
        order.status = Order.STATUS_FAILED
        order.save(update_fields=["status", "updated_at"])
        invalidate_orders(order.user_id, order.system_id or 0)

    def _apply_shipping(self, order, session):
        details = session.get("collected_information", {}).get("shipping_details") or {}
        if not details:
            # Older API versions put it on the session directly. Cheap to accept
            # both; a missing address must not cost the customer their order.
            details = session.get("shipping_details") or {}
        address = details.get("address") or {}
        if not address:
            return
        order.shipping_name = details.get("name") or ""
        order.shipping_line1 = address.get("line1") or ""
        order.shipping_line2 = address.get("line2") or ""
        order.shipping_city = address.get("city") or ""
        order.shipping_state = address.get("state") or ""
        order.shipping_postal_code = address.get("postal_code") or ""
        order.shipping_country = address.get("country") or ""

    def _decrement_stock(self, order):
        """Draw down `stock_count` for the products actually sold.

        An F() expression, not read-modify-write: two orders confirming at once
        would otherwise both read the same count and one decrement would vanish.
        A null `stock_count` means the tenant does not track units, so there is
        nothing to draw down - only the `in_stock` flag, which is theirs to set.

        Clamped at zero because `stock_count` is a PositiveIntegerField: an
        oversell would otherwise try to write a negative and raise here, at the
        worst possible moment - after the customer has already been charged.
        """
        for line in order.lines.all():
            target = line.product_variant or line.product
            if target is None or target.stock_count is None:
                continue
            type(target).objects.filter(pk=target.pk).update(
                stock_count=Greatest(F("stock_count") - line.quantity, Value(0)),
            )
