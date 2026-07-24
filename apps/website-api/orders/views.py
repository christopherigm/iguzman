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
from core.permissions import IsSystemAdmin
from core.tenancy import host_system, request_system, user_system
from users.cache import invalidate_cart
from users.guest import resolve_guest_cart
from users.models import CartItem

from .cache import ORDERS_CACHE_TTL, invalidate_orders, orders_key
from .models import Order, OrderLine
from .serializers import (
    AdminOrderActionSerializer,
    AdminOrderSerializer,
    AdminOrderSummarySerializer,
    CheckoutSerializer,
    OrderSerializer,
    OrderSummarySerializer,
    PosCheckoutSerializer,
)
from .services.order_emails import (
    CONFIRMATION,
    FULFILLED,
    STATUS,
    send_order_email,
)
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
        .select_related('product', 'service', 'menu_item')
        .prefetch_related(
            'menu_item__ingredients', 'menu_item__ingredients__options__ingredient',
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
        # Resolve the chosen option (default when unset) so the frozen line names
        # the exact alternative the customer picked and prices it at that option.
        chosen_ing, option_price = ingredient.resolve_option(row.get('option'))
        snapshot.append({
            'name': chosen_ing.name,
            'quantity': qty,
            'unit_price': str(option_price),
            'line_upcharge': str(ingredient.upcharge_for_quantity(qty, option_price)),
            'removed': ingredient.included_units > 0 and qty == 0,
        })
    return snapshot


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

    # AllowAny: a visitor may check out without an account. What they may not do
    # is name a price - the guest branch re-reads every line out of the catalog
    # exactly as the signed-in branch reads it out of the cart, so the only thing
    # the body decides either way is *which* items, never what they cost.
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        locale = data.get("locale") or "en"
        method = data.get("payment_method") or Order.PAYMENT_ONLINE

        if not request.user.is_authenticated:
            return self._guest_checkout(request, data, locale, method)

        system = user_system(request)
        if system is None:
            return Response(
                {"detail": "No system for this user.", "code": "NO_SYSTEM"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        unavailable = self._method_unavailable(system, method)
        if unavailable is not None:
            return unavailable

        items = list(_cart_qs(request.user, system))
        return self._checkout(request, system, request.user, items, locale, method, data)

    def _method_unavailable(self, system, method):
        """A 503 Response if `system` does not offer `method`, else None.

        Each payment method is gated on its own tenant switch, exactly as it is
        surfaced to the frontend: online on `stripe_configured`, and the two
        offline methods on their own booleans. Not a 500 in any case - a site not
        offering a method is a configuration fact, not a fault, and the cart hides
        the option on the same signal.
        """
        if method == Order.PAYMENT_ONLINE:
            if not system.stripe_configured:
                return Response(
                    {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        elif method == Order.PAYMENT_IN_STORE:
            if not system.pay_in_store_enabled:
                return Response(
                    {"detail": "This site does not offer paying in store.", "code": "METHOD_UNAVAILABLE"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        elif method == Order.PAYMENT_ON_DELIVERY:
            if not system.pay_on_delivery_enabled:
                return Response(
                    {"detail": "This site does not offer paying on delivery.", "code": "METHOD_UNAVAILABLE"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        return None

    def _guest_checkout(self, request, data, locale, method):
        """Check out an anonymous visitor's localStorage cart.

        The only difference from the signed-in path is where the lines come
        from - a list of references in the body rather than rows in the database
        - and that the resulting Order has no `user`. Everything that decides
        money is identical: `resolve_guest_cart` re-reads each reference out of
        this tenant's catalog and prices it there, so the body names *which*
        items and nothing else.

        The tenant comes from the request host, because an anonymous caller has
        no profile to read one off. That is the same resolution the public
        catalog uses, and it can only ever select a published catalog - it is not
        used for the Stripe return URL, which stays derived from `System.host`
        (see `_site_base_url`) precisely because a header must never steer a
        redirect in the middle of a payment.

        For an online order no email is collected here: Stripe Checkout asks for
        it, and the webhook copies it onto the order. An offline order has no
        Stripe page, so its `contact` (validated present) is what fills that in -
        and that address is likewise what later lets the customer claim the order
        by registering (`claim_guest_orders`).
        """
        system = host_system(request)
        if system is None:
            return Response(
                {"detail": "No system for this host.", "code": "NO_SYSTEM"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        unavailable = self._method_unavailable(system, method)
        if unavailable is not None:
            return unavailable

        items = resolve_guest_cart(system, data.get("cart") or [])
        return self._checkout(request, system, None, items, locale, method, data)

    def _checkout(self, request, system, user, items, locale, method, data):
        """Turn a list of priced cart lines into an Order.

        Shared by every branch - signed-in or guest, online or offline - so all
        four are priced by exactly the same code: `user` is simply None for a
        guest, and `method` decides only what happens *after* the order and its
        snapshotted lines exist. An online order gets a Stripe session and stays
        `pending`; an offline one is finalized here and stays `placed`. Neither
        reads a price from the body - `data` only carries who and where.

        `items` are `CartItem` instances; for a guest they are unsaved ones built
        from the request's references, which every property this reads
        (`target`, `unit_price`, `line_total`) supports without a row.
        """
        is_offline = method in (Order.PAYMENT_IN_STORE, Order.PAYMENT_ON_DELIVERY)
        contact = data.get("contact") or {}
        if not items:
            return Response(
                {"detail": "Your cart is empty.", "code": "CART_EMPTY"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order, lines, error = _open_order(
            system,
            user,
            items,
            # An offline order is born `placed` (no Stripe session will ever move
            # it off `pending`); an online one waits on the webhook.
            order_status=Order.STATUS_PLACED if is_offline else Order.STATUS_PENDING,
            payment_method=method,
            # Online: blank for a guest until the webhook copies what Stripe
            # collected - which is also what makes the order claimable later.
            # Offline: taken from the contact form (or the account), since no
            # Stripe page will ever fill it in.
            email=(
                (contact.get("email") or (user.email if user else "") or "").strip()
                if is_offline
                else ((user.email or "") if user else "")
            ),
        )
        if error is not None:
            return error

        if is_offline:
            return self._finalize_offline(
                order, user, system, method, locale, contact, data.get("shipping") or {},
            )

        base_url = _site_base_url(system)
        try:
            session = create_checkout_session(
                system=system,
                order=order,
                lines=lines,
                success_url=f"{base_url}/{locale}/orders/{order.public_id}?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{base_url}/{locale}/cart",
                # Omitted for a guest so Stripe's own page asks for it.
                customer_email=(user.email or "") if user else "",
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
        # A guest order belongs to no history list, so there is no cached list to
        # drop - the confirmation page reads it uncached by public id.
        if user is not None:
            invalidate_orders(user.id, system.id)

        logger.info("Checkout session %s created for order %s", session.id, order.pk)
        return Response({"url": session.url, "order_id": str(order.public_id)}, status=status.HTTP_201_CREATED)

    def _finalize_offline(self, order, user, system, method, locale, contact, shipping):
        """Complete a pay-in-store / pay-on-delivery order without Stripe.

        An offline order has no session and no webhook, so the two things the
        webhook does for an online one - clearing the cart and drawing down stock
        - happen here, at placement, in one transaction. The order stays `placed`:
        real and recorded, waiting on the tenant to take payment and hand it over.
        Those two are tracked independently (`status` vs `fulfilled`), so nothing
        here marks it paid - the customer has not paid yet.
        """
        order.phone = (contact.get("phone") or "").strip()
        order.shipping_name = (contact.get("name") or "").strip()
        if method == Order.PAYMENT_ON_DELIVERY:
            order.shipping_line1 = (shipping.get("line1") or "").strip()
            order.shipping_line2 = (shipping.get("line2") or "").strip()
            order.shipping_city = (shipping.get("city") or "").strip()
            order.shipping_state = (shipping.get("state") or "").strip()
            order.shipping_postal_code = (shipping.get("postal_code") or "").strip()
            order.shipping_country = (shipping.get("country") or "").strip()

        with transaction.atomic():
            order.save()
            _decrement_order_stock(order)
            # The order is the record now; leaving the cart full would invite the
            # customer to order the same thing twice. A guest has no server-side
            # cart to clear.
            if user is not None:
                CartItem.objects.filter(user=user, system=system).delete()

        if user is not None:
            invalidate_cart(user.id, system.id)
            invalidate_orders(user.id, system.id)

        # After the order is committed, so a rollback never leaves a customer
        # holding a confirmation for an order that does not exist. Best-effort and
        # a no-op when no email was given (see send_order_email).
        send_order_email(order, kind=CONFIRMATION)

        logger.info("Offline order %s placed via %s", order.pk, method)
        return Response(
            {
                "order_id": str(order.public_id),
                # The browser is already on the tenant's domain, so a relative
                # path is enough - and it sidesteps deriving an origin that is
                # wrong in local dev (see `_site_base_url`).
                "redirect": f"/{locale}/orders/{order.public_id}",
            },
            status=status.HTTP_201_CREATED,
        )


def _open_order(system, user, items, *, order_status, payment_method, email):
    """Validate a priced basket and write it as an Order plus snapshotted lines.

    Returns ``(order, lines, None)``, or ``(None, None, Response)`` carrying the
    4xx that explains the refusal.

    Shared by the customer checkout and the POS, which is the point: every rule
    that decides what an order *is* - one currency, nothing sold that the tenant
    has marked unavailable, every price read off the catalog rather than the
    request - lives here once. Two copies would eventually disagree, and the
    first symptom would be a till total that does not match what the site would
    have charged for the same basket.

    `items` are `CartItem` instances, saved or not; only the pricing properties
    are read, so a guest's or a POS basket's unsaved rows work unchanged.
    """
    # A Stripe Checkout Session is single-currency and Buyable.currency is per
    # item, so a mixed basket has no correct total to charge. Refused rather than
    # converted: we have no rate, and inventing one would be charging a price
    # nobody agreed to. The POS inherits the rule even though it never opens a
    # Session - an order still carries exactly one currency.
    currencies = {item.target.currency for item in items}
    if len(currencies) > 1:
        return None, None, Response(
            {
                "detail": "Your cart has items in more than one currency.",
                "code": "MIXED_CURRENCY",
                "currencies": sorted(currencies),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    currency = currencies.pop()

    # Re-checked here rather than trusted from when the line was added: a cart
    # row sits for as long as the customer leaves it there, and the item may have
    # sold out meanwhile. This reads the tenant's availability *flag*, not the
    # unit count, so a stale `stock_count` never blocks a real sale at the till.
    out_of_stock = [item for item in items if not _in_stock(item)]
    if out_of_stock:
        return None, None, Response(
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
            user=user,
            status=order_status,
            payment_method=payment_method,
            currency=currency,
            email=email,
        )
        lines = [
            OrderLine.objects.create(
                order=order,
                kind=item.kind,
                product=item.product,
                service=item.service,
                menu_item=item.menu_item,
                name=item.target.name or "",
                sku=getattr(item.target, "sku", "") or "",
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
        # No tax or shipping is modelled yet, so the total is the subtotal. They
        # get their own columns when they exist rather than being folded in here,
        # where they would be indistinguishable after the fact.
        order.total = subtotal
        order.save(update_fields=["subtotal", "total"])

    return order, lines, None


def _decrement_order_stock(order):
    """Draw down `stock_count` for the products an order actually sold.

    An F() expression, not read-modify-write: two orders confirming at once would
    otherwise both read the same count and one decrement would vanish. A null
    `stock_count` means the tenant does not track units, so there is nothing to
    draw down - only the `in_stock` flag, which is theirs to set.

    Clamped at zero because `stock_count` is a PositiveIntegerField: an oversell
    would otherwise try to write a negative and raise. Shared by the Stripe
    webhook (on payment) and offline checkout (on placement), so stock is drawn
    down exactly once however the order was taken.
    """
    for line in order.lines.all():
        target = line.product
        if target is None or target.stock_count is None:
            continue
        type(target).objects.filter(pk=target.pk).update(
            stock_count=Greatest(F("stock_count") - line.quantity, Value(0)),
        )


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


def _may_read(request, order) -> bool:
    """Whether this caller may see this order.

    Two rules, and the first is the one that makes guest checkout work: an order
    with no `user` is readable by anyone holding its `public_id`, because that
    unguessable id in the URL is the only handle its customer will ever have.
    An order *with* a user is readable only by that user - signing in never
    grants a view of someone else's order, and being signed in never costs a
    guest the view of their own.
    """
    if order.user_id is None:
        return True
    return request.user.is_authenticated and order.user_id == request.user.id


class OrderDetailView(APIView):
    """GET/DELETE /api/orders/<public_id>/ - one order in full, or remove it.

    Addressed by the public UUID, never the pk: the sequential id stays inside
    the database. Uncached on purpose: the confirmation page polls this while
    the webhook is still in flight, and a cached `pending` would outlive the
    payment.
    """

    # AllowAny because a guest order has no owner to authenticate as. Its
    # authorization is the id itself: `public_id` is a random UUID4 that only
    # ever appears in the URL the customer was redirected to, and the GET below
    # still refuses any order that *does* have an owner unless the caller is
    # them. An owned order is therefore no more reachable than before.
    permission_classes = (AllowAny,)

    def get(self, request, public_id):
        order = (
            Order.objects
            .filter(public_id=public_id, system=request_system(request))
            .prefetch_related(
                "lines", "lines__product", "lines__service",
                # The serializer falls back to the item's gallery when it has no
                # own `image`; prefetch it so that fallback is not an N+1.
                "lines__product__images", "lines__service__images",
            )
            .first()
        )
        # Ownerless orders are readable by whoever holds the link; an owned one
        # only by its owner. 404 rather than 403 either way, so this endpoint
        # cannot be used to probe which order ids exist.
        if order is None or not _may_read(request, order):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrderSerializer(order, context={"request": request}).data)

    def delete(self, request, public_id):
        """Remove one of the caller's own orders from their history.

        Scoped to the user, unlike the GET: holding a guest order's link is
        enough to *read* it but never to destroy it, and an unowned order is not
        in anyone's history to tidy anyway. Another user's id is a 404, never a
        403, so this endpoint cannot be used to probe which order ids exist. A
        paid or refunded order is refused (403) - it is financial history, not
        clutter (see `DELETABLE_STATUSES`). The delete cascades to the lines.
        """
        if not request.user.is_authenticated:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

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


class AdminOrderListView(APIView):
    """GET /api/orders/admin/ - every order for the admin's tenant.

    The tenant-facing counterpart to `OrderListView` (which is scoped to one
    customer): this is scoped to the whole `System`, so it includes guest orders
    too - they have no `user` but they do have a `system`. Ordered newest-first by
    the model default, so the list opens on what just came in.

    Not cached, unlike the customer's history: a placed offline order changes
    state when the tenant acts on it here, and a stale list would show an order
    the tenant just fulfilled as still outstanding.
    """

    permission_classes = (IsSystemAdmin,)

    def get(self, request):
        system = user_system(request)
        if system is None:
            return Response([], status=status.HTTP_200_OK)
        orders = (
            Order.objects
            .filter(system=system)
            .prefetch_related("lines")
        )
        data = AdminOrderSummarySerializer(orders, many=True, context={"request": request}).data
        return Response(data)


class AdminOrderDetailView(APIView):
    """GET/POST /api/orders/admin/<public_id>/ - one order, and the actions on it.

    Scoped to the admin's own `System`: another tenant's order id is a 404, never
    a 403, so the endpoint cannot be used to probe which orders exist elsewhere.
    POST applies one management action (see `AdminOrderActionSerializer`).
    """

    permission_classes = (IsSystemAdmin,)

    def _get_order(self, request, public_id):
        system = user_system(request)
        if system is None:
            return None
        return (
            Order.objects
            .filter(public_id=public_id, system=system)
            .prefetch_related(
                "lines", "lines__product", "lines__service", "lines__menu_item",
                "lines__product__images", "lines__service__images", "lines__menu_item__images",
            )
            .first()
        )

    def get(self, request, public_id):
        order = self._get_order(request, public_id)
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminOrderSerializer(order, context={"request": request}).data)

    def post(self, request, public_id):
        order = self._get_order(request, public_id)
        if order is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminOrderActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]

        # Captured before the action so we can tell which axis moved: `status`
        # (a payment transition the customer is emailed about) versus `fulfilled`
        # (a separate axis - being handed over - emailed with its own wording).
        status_before = order.status
        fulfilled_before = order.fulfilled
        error = self._apply_action(order, action)
        if error is not None:
            return error

        invalidate_orders(order.user_id, order.system_id or 0)
        # One email per action at most. A status move wins (a `complete` moves
        # both axes at once, and its email should read as the payment update);
        # otherwise a fresh fulfillment - ready for pickup / on its way - is the
        # notification. Un-marking fulfilled is a correction, not news to the
        # customer, so only False -> True sends.
        if order.status != status_before:
            send_order_email(order, kind=STATUS)
        elif order.fulfilled and not fulfilled_before:
            send_order_email(order, kind=FULFILLED)
        return Response(AdminOrderSerializer(order, context={"request": request}).data)

    def _apply_action(self, order, action):
        """Run one action, or return a 4xx Response explaining why it cannot run.

        Payment and fulfillment are the two independent axes the tenant tracks:
        `mark_paid`/`cancel` move `status`, `mark_fulfilled`/`unmark_fulfilled`
        toggle the `fulfilled` flag, and neither touches the other. `complete` is
        the one action that moves both, and only for a counter sale - see below.
        """
        Action = AdminOrderActionSerializer

        if action == Action.COMPLETE:
            # A counter sale settles both axes at once: the customer paid and
            # walked out with the goods. Restricted to POS methods so this stays
            # a description of what happened at a till rather than a way to skip
            # fulfillment tracking on an order that still has to be shipped.
            if order.payment_method not in Order.POS_METHODS:
                return Response(
                    {"detail": "Only a counter sale can be completed in one step.",
                     "code": "NOT_POS_ORDER"},
                    status=status.HTTP_409_CONFLICT,
                )
            if order.status != Order.STATUS_PLACED:
                return Response(
                    {"detail": "Only a placed order can be completed.", "code": "BAD_TRANSITION"},
                    status=status.HTTP_409_CONFLICT,
                )
            now = timezone.now()
            order.status = Order.STATUS_PAID
            order.paid_at = now
            order.fulfilled = True
            order.fulfilled_at = now
            order.save(update_fields=[
                "status", "paid_at", "fulfilled", "fulfilled_at", "updated_at",
            ])

        elif action == Action.MARK_PAID:
            # Only an offline order is marked paid by hand. An online order's money
            # is Stripe's to confirm - the signed webhook is the single source of
            # truth there, and a manual flip would let the CMS assert a payment
            # that never cleared.
            if order.payment_method == Order.PAYMENT_ONLINE:
                return Response(
                    {"detail": "An online order is marked paid by Stripe, not by hand.",
                     "code": "ONLINE_ORDER"},
                    status=status.HTTP_409_CONFLICT,
                )
            if order.status not in {Order.STATUS_PLACED, Order.STATUS_PENDING}:
                return Response(
                    {"detail": "Only a placed order can be marked paid.", "code": "BAD_TRANSITION"},
                    status=status.HTTP_409_CONFLICT,
                )
            order.status = Order.STATUS_PAID
            order.paid_at = timezone.now()
            order.save(update_fields=["status", "paid_at", "updated_at"])

        elif action == Action.CANCEL:
            if order.status not in {Order.STATUS_PLACED, Order.STATUS_PENDING}:
                return Response(
                    {"detail": "Only an outstanding order can be canceled.", "code": "BAD_TRANSITION"},
                    status=status.HTTP_409_CONFLICT,
                )
            order.status = Order.STATUS_CANCELED
            order.save(update_fields=["status", "updated_at"])

        elif action == Action.MARK_FULFILLED:
            order.fulfilled = True
            order.fulfilled_at = timezone.now()
            order.save(update_fields=["fulfilled", "fulfilled_at", "updated_at"])

        elif action == Action.UNMARK_FULFILLED:
            order.fulfilled = False
            order.fulfilled_at = None
            order.save(update_fields=["fulfilled", "fulfilled_at", "updated_at"])

        return None


class PosCheckoutView(APIView):
    """POST /api/orders/admin/pos/ - ring up a counter sale on the POS screen.

    Separate from `CheckoutView` for one blunt reason: the caller here is a
    signed-in store associate, and `CheckoutView`'s authenticated branch reads
    *the caller's own cart*. Pointing the POS at it would have the associate
    selling themselves their own saved items. The basket instead arrives in the
    body as references and is priced by `resolve_guest_cart`, so the associate's
    browser is trusted with exactly as much as a customer's: which items, never
    what they cost.

    The order is created `placed`, not `paid`. It exists the moment the associate
    rings it up, before the customer has tapped anything - so a sale that is
    abandoned at the terminal still leaves a record instead of vanishing. The
    `complete` action is what settles it once payment is confirmed (by hand
    today; by a provider webhook once one is wired in).

    Stock is drawn down here, at placement, exactly as the offline branch does
    it - not at completion. The bread leaves the shelf when it is rung up.
    """

    permission_classes = (IsSystemAdmin,)

    def post(self, request):
        system = user_system(request)
        if system is None:
            return Response(
                {"detail": "No system for this user.", "code": "NO_SYSTEM"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PosCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        contact = data.get("contact") or {}

        items = resolve_guest_cart(system, data["cart"])
        if not items:
            # Every reference was dropped, which `resolve_guest_cart` does
            # silently for anything disabled or deleted. On the storefront that
            # is a stale localStorage cart; here it means the associate is
            # looking at a screen whose catalog has moved on, so say so rather
            # than writing an empty sale.
            return Response(
                {"detail": "None of these items are still on sale.", "code": "CART_EMPTY"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order, _lines, error = _open_order(
            system,
            # No `user`: the customer at the counter has no account here, and the
            # associate is the seller, not the buyer. Attributing the sale to the
            # associate would put every counter order in their order history.
            None,
            items,
            order_status=Order.STATUS_PLACED,
            payment_method=data["payment_method"],
            # Optional, and the only reason to take it: a receipt, and the handle
            # that later lets the customer claim the order by registering on the
            # same address (`orders/claims.py`).
            email=(contact.get("email") or "").strip(),
        )
        if error is not None:
            return error

        order.phone = (contact.get("phone") or "").strip()
        order.shipping_name = (contact.get("name") or "").strip()

        with transaction.atomic():
            order.save(update_fields=["phone", "shipping_name", "updated_at"])
            _decrement_order_stock(order)

        # A receipt to the counter customer, only when they gave an address for
        # one. Best-effort - a mail hiccup must not fail a sale at the till.
        send_order_email(order, kind=CONFIRMATION)

        logger.info(
            "POS order %s rung up on %s for system %s",
            order.pk, data["payment_method"], system.pk,
        )
        return Response(
            AdminOrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


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
            _decrement_order_stock(order)
            # The cart did its job the moment the order was written; leaving it
            # full would invite the customer to pay for the same thing twice.
            CartItem.objects.filter(user=order.user, system=order.system).delete()

        invalidate_cart(order.user_id, order.system_id or 0)
        invalidate_orders(order.user_id, order.system_id or 0)
        logger.info("Order %s paid (payment_intent %s)", order.pk, order.stripe_payment_intent_id)

        # The customer's first email about this order: an online order is
        # `pending` with no address until now (the webhook just copied what
        # Stripe collected), so payment is the earliest point we can confirm it.
        # Sent after commit and best-effort, so a mail failure can never make the
        # handler return non-2xx and have Stripe retry a payment already recorded.
        send_order_email(order, kind=CONFIRMATION)

    def _handle_expired(self, order, session):
        if order.status != Order.STATUS_PENDING:
            return
        order.status = Order.STATUS_CANCELED
        order.save(update_fields=["status", "updated_at"])
        invalidate_orders(order.user_id, order.system_id or 0)
        # A no-op for the usual abandoned checkout (no email was ever collected);
        # sends only if Stripe had already supplied an address.
        send_order_email(order, kind=STATUS)

    def _handle_failed(self, order, session):
        if order.status != Order.STATUS_PENDING:
            return
        order.status = Order.STATUS_FAILED
        order.save(update_fields=["status", "updated_at"])
        invalidate_orders(order.user_id, order.system_id or 0)
        send_order_email(order, kind=STATUS)

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

