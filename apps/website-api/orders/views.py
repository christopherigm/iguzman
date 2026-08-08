import logging
from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal

from django.core.cache import cache
from django.db import transaction
from django.db.models import F, Value
from django.db.models.functions import Greatest
from django.utils import timezone
from django.utils import timezone as dj_timezone
from django.utils.dateparse import parse_date

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Service
from core.models import Branch, BookingResource, System
from core.permissions import IsSystemAdmin
from core.tenancy import host_system, request_system, user_system
from users.cache import invalidate_cart
from users.guest import resolve_guest_cart
from users.models import CartItem

from .cache import (
    AVAILABILITY_CACHE_TTL,
    ORDERS_CACHE_TTL,
    availability_key,
    invalidate_availability,
    invalidate_orders,
    orders_key,
)
from .models import Booking, Order, OrderLine
from .serializers import (
    AdminBookingActionSerializer,
    AdminBookingSerializer,
    AdminOrderActionSerializer,
    AdminOrderSerializer,
    AdminOrderSummarySerializer,
    BookingCheckoutSerializer,
    CheckoutSerializer,
    OrderSerializer,
    OrderSummarySerializer,
    PosCheckoutSerializer,
)
from .services.booking import (
    assign_for_slot,
    availability_range,
    booking_window,
    resolve_branch,
    selectable_resources,
    service_duration_minutes,
)
from .services.order_emails import (
    CONFIRMATION,
    FULFILLED,
    STATUS,
    send_order_email,
)
from .services.qr import attach_order_qr, site_base_url
from .services.stripe_gateway import (
    StripeGatewayError,
    StripeNotConfigured,
    create_checkout_session,
    expire_session,
    retrieve_session,
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

    The implementation moved to `services.qr` when the order QR code needed the
    same origin for the same reason (a value the browser must not steer, this
    time because it is printed on a receipt). Kept as an alias so the Stripe call
    sites still read in the vocabulary of the flow they belong to.
    """
    return site_base_url(system)


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


def _open_order(system, user, items, *, order_status, payment_method, email, defer_qr=False):
    """Validate a priced basket and write it as an Order plus snapshotted lines.

    Returns ``(order, lines, None)``, or ``(None, None, Response)`` carrying the
    4xx that explains the refusal.

    `defer_qr` hands the QR write back to the caller. Booking checkout calls this
    from *inside* a row lock it holds to serialise seat allocation, and the whole
    point of writing the PNG outside a transaction is lost if it happens under
    someone else's - so that caller takes the code on itself once the lock is
    released.

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

    # Outside the transaction: writing the PNG is a round-trip to object storage,
    # and holding a row lock open across it would put every checkout in a queue
    # behind the network. Best-effort by construction - a failure here logs and
    # leaves `qr_code` blank rather than costing the sale (see `services.qr`).
    if not defer_qr:
        attach_order_qr(order)

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


def _release_booking(order) -> bool:
    """Cancel the appointment on a dead order, freeing the slot it still holds.

    A `Booking` is written **before** the customer leaves for Stripe and is born
    `pending`, which is in `Booking.ACTIVE_STATUSES` - so it occupies its hour
    from the moment checkout starts, which is the point (two customers must not
    be sent to Stripe for the same slot).

    But occupancy is computed from `Booking.status` alone (see
    `orders.services.booking._occupancy`) and never looks at the order, so an
    order going `canceled`/`failed` releases nothing by itself. Without this, a
    customer who abandons the Stripe page leaves an appointment nobody is coming
    to blocking that time forever - and blocking it hardest for themselves, since
    the slot they wanted is the one slot they can no longer rebook. This is the
    same reasoning `BookingCheckoutView`'s `StripeGatewayError` branch records
    when it deletes the order outright rather than leave a booking behind.

    Canceled, not deleted: the order survives as a record of what was abandoned
    (the customer can read it, and delete it themselves), so its booking should
    survive with it. `post_save` on Booking drops the availability cache, which
    is why nothing here calls `invalidate_availability` - see `orders/signals.py`.

    Returns whether anything was released, so the caller can log it.
    """
    # A reverse OneToOne raises rather than returning None when absent; Django's
    # RelatedObjectDoesNotExist subclasses AttributeError precisely so this works.
    booking = getattr(order, "booking", None)
    if booking is None or booking.status not in Booking.ACTIVE_STATUSES:
        return False
    booking.status = Booking.STATUS_CANCELED
    booking.save(update_fields=["status", "updated_at"])
    return True


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
            # `booking` is nested in the payload and is null on most orders;
            # select_related keeps a history page of appointments from costing a
            # query per row.
            .select_related("booking", "booking__branch")
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

    Three rules. The first is the one that makes guest checkout work: an order
    with no `user` is readable by anyone holding its `public_id`, because that
    unguessable id in the URL is the only handle its customer will ever have.
    An order *with* a user is readable by that user - signing in never grants a
    view of someone else's order, and being signed in never costs a guest the
    view of their own.

    The third is what makes the order QR code useful at a counter: **an admin of
    the order's own tenant may read any of that tenant's orders.** They can
    already see every one of them in the CMS (`AdminOrderDetailView`), so this
    grants no new data - it only lets the *customer-facing* page answer for them,
    which is what a scanned QR lands on. Without it an admin scanning a
    customer's receipt gets a 404 on an order sitting in their own admin list.

    The tenant boundary is not enforced here but upstream: every caller filters
    on `request_system(request)` first, and a signed-in user's System always
    comes from their profile (`core.tenancy`), never from a header - so an admin
    of one tenant cannot reach another tenant's order to begin with.
    """
    if order.user_id is None:
        return True
    if not request.user.is_authenticated:
        return False
    if order.user_id == request.user.id:
        return True
    return IsSystemAdmin().has_permission(request, None)


def _may_pay(request, order) -> bool:
    """Whether this caller may reopen checkout on this order.

    `_may_read`'s first two rules and deliberately **not** its admin rule.
    Reopening checkout is a write: it expires the order's live Stripe session
    before opening another (see `OrderPayView`), so an admin who scanned a
    customer's QR while that customer was mid-payment on their phone would kill
    the session under them. Reading an order to validate it at the counter is the
    access this feature needed; paying for one on the customer's behalf is not.
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
            .select_related("booking", "booking__branch", "booking__service")
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


def _line_still_sellable(line) -> bool:
    """Whether an order line may still be paid for.

    The order-line counterpart of `_in_stock`, and deliberately more forgiving in
    one place: the catalog FKs are `SET_NULL` provenance, so a deleted item
    leaves `line.product` None. That is **not** treated as unavailable - the line
    is a snapshot of an agreement that was already made, and refusing payment
    because the tenant has since tidied the catalog would strand an order the
    customer is actively trying to settle. Only an item that still exists *and*
    says it is unavailable stops the payment.
    """
    if line.kind == "service":
        return True
    if line.kind == "menu_item":
        return line.menu_item is None or line.menu_item.is_available
    return line.product is None or line.product.in_stock


class OrderPayView(APIView):
    """POST /api/orders/<public_id>/pay/ - reopen checkout on an unpaid order.

    For the customer who reached Stripe and came back without paying - the back
    arrow, "return to store", a closed tab. The order and its snapshotted lines
    already exist, so this hands back a Checkout URL for *that* order rather than
    making them rebuild a cart, which for a booking would be worse than an
    inconvenience: the appointment is holding its own slot, so the hour they
    wanted is the one hour they could not rebook.

    **Only a `pending` order qualifies**, never a `canceled` or `failed` one,
    even though those are just as unpaid. `canceled` is also what the CMS writes
    when a *tenant* refuses an order, and what the webhook writes when Stripe
    expired the session; neither should be resurrectable from the browser. A
    customer past that window re-adds to the cart, which is the honest answer -
    prices and stock have to be read again anyway. `placed` is excluded for a
    different reason: it is an offline order that was never going to have a
    Stripe session at all.

    Nothing here decides an amount, and nothing here marks anything paid. It
    charges the order's own frozen lines, and the signed webhook remains the only
    thing that may move the money - so an abandoned second attempt costs nothing
    beyond another `pending` session on the same order.
    """

    # AllowAny for the same reason `OrderDetailView` is: a guest order has no
    # owner to authenticate as, and its unguessable `public_id` is the only
    # handle its customer will ever have. `_may_pay` still refuses an *owned*
    # order to anyone but its owner, so this opens up nothing the GET does not.
    permission_classes = (AllowAny,)

    def post(self, request, public_id):
        system = request_system(request)
        order = (
            Order.objects
            .filter(public_id=public_id, system=system)
            .select_related("booking", "booking__service", "booking__branch")
            .prefetch_related("lines", "lines__product", "lines__menu_item")
            .first()
        )
        if order is None or not _may_pay(request, order):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        refusal = self._refuse(order, system)
        if refusal is not None:
            return refusal

        # The old session has to be dealt with before a new one exists: an order
        # must never carry two payable sessions, or a customer with the first tab
        # still open can pay both, and `_handle_completed` - idempotent on an
        # order already `paid` - would acknowledge the second charge rather than
        # refuse it. Reusing a still-open session is the cheapest way to
        # guarantee that, and it is also the common case (the customer is back
        # within a minute of leaving).
        existing = self._existing_session(order, system)
        if existing is not None:
            if existing.get("status") == "complete":
                # Paid, with the webhook still in flight. Saying so lets the
                # confirmation page keep polling instead of opening a second
                # session for money that has already moved.
                return Response(
                    {"detail": "This order has already been paid.", "code": "ALREADY_PAID"},
                    status=status.HTTP_409_CONFLICT,
                )
            if existing.get("status") == "open" and existing.get("url"):
                logger.info("Reusing open Stripe session %s for order %s", existing["id"], order.pk)
                return Response({"url": existing["url"], "order_id": str(order.public_id)})

        base_url = _site_base_url(system)
        locale = (request.data or {}).get("locale") or "en"
        try:
            session = create_checkout_session(
                system=system,
                order=order,
                lines=list(order.lines.all()),
                success_url=f"{base_url}/{locale}/orders/{order.public_id}?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{base_url}/{locale}/orders/{order.public_id}",
                customer_email=order.email or "",
                # A booking is charged exactly as it was the first time, deposit
                # included - `amount_due_now` is the agreement, recorded when the
                # appointment was made, and re-deriving it here from today's
                # percentage could charge a different number than the customer
                # was quoted.
                charge_amount=self._booking_charge(order),
                charge_label=self._booking_label(order),
                collect_shipping_address=not hasattr(order, "booking"),
            )
        except StripeNotConfigured:
            return Response(
                {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except StripeGatewayError:
            # The order is left exactly as it was, unlike the first checkout
            # (which deletes it): it is a real order the customer can try again.
            return Response(
                {"detail": "Could not start checkout. Please try again.", "code": "STRIPE_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.stripe_session_id = session.id
        order.save(update_fields=["stripe_session_id", "updated_at"])
        if order.user_id:
            invalidate_orders(order.user_id, order.system_id or 0)

        logger.info("Checkout session %s reopened for order %s", session.id, order.pk)
        return Response({"url": session.url, "order_id": str(order.public_id)})

    def _refuse(self, order, system):
        """The 4xx/503 explaining why this order cannot be paid now, or None."""
        if order.status in {Order.STATUS_PAID, Order.STATUS_REFUNDED}:
            return Response(
                {"detail": "This order has already been paid.", "code": "ALREADY_PAID"},
                status=status.HTTP_409_CONFLICT,
            )
        if order.payment_method != Order.PAYMENT_ONLINE:
            return Response(
                {"detail": "This order is settled with the store.", "code": "NOT_ONLINE_ORDER"},
                status=status.HTTP_409_CONFLICT,
            )
        if order.status != Order.STATUS_PENDING:
            return Response(
                {"detail": "This order can no longer be paid.", "code": "ORDER_CLOSED"},
                status=status.HTTP_409_CONFLICT,
            )
        if not system.stripe_configured:
            return Response(
                {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Re-checked rather than assumed, exactly as `_open_order` checks it: the
        # order has been sitting unpaid, and the tenant may have marked something
        # sold out meanwhile. Charging for it anyway is how an oversell starts.
        if not all(_line_still_sellable(line) for line in order.lines.all()):
            return Response(
                {"detail": "Some items are no longer available.", "code": "OUT_OF_STOCK"},
                status=status.HTTP_409_CONFLICT,
            )

        return self._refuse_booking(order)

    def _refuse_booking(self, order):
        """The 409 for an appointment that is no longer bookable, or None.

        Re-derived through the single availability authority rather than trusted,
        for the reason booking checkout re-derives it: time has passed, and the
        slot may now be in the past or inside the branch's minimum notice - both
        of which make it un-bookable however free it looks.

        `exclude_booking_id` is what stops the booking from refusing itself: it
        is `pending`, so it is occupying the very seats it is asking to pay for.

        **The resource is re-derived too, and may move.** The party's original
        boat is offered back first (`preferred_id`); if the branch has been
        rearranged since, best fit seats them elsewhere and the assignment is
        updated. Only "no resource can take this party" is a refusal - flatly
        rejecting a payment because one particular guide is now busy would be a
        worse answer than quietly booking them with another.
        """
        booking = getattr(order, "booking", None)
        if booking is None:
            return None
        # With the service or branch deleted there is nothing to re-derive the
        # slot from. The appointment still stands on its own snapshot, so let the
        # payment through rather than block it on missing provenance.
        if booking.service is None:
            return None

        assignment = assign_for_slot(
            booking.service,
            booking.branch,
            booking.starts_at,
            party_size=booking.party_size,
            preferred_id=booking.resource_id,
            exclude_booking_id=booking.pk,
        )
        if not assignment.fits:
            return Response(
                {"detail": "That time is no longer available.", "code": "SLOT_UNAVAILABLE"},
                status=status.HTTP_409_CONFLICT,
            )

        new_resource_id = assignment.resource.pk if assignment.resource else None
        if new_resource_id != booking.resource_id:
            booking.resource = assignment.resource
            booking.resource_name = assignment.resource.name if assignment.resource else ""
            booking.save(update_fields=["resource", "resource_name", "updated_at"])
        return None

    def _existing_session(self, order, system):
        """This order's current Checkout Session, or None if there is none to use.

        A read failure returns None *after* trying to expire the session, so the
        fallback - opening a replacement - cannot leave a payable session behind
        that we could not see. Best effort by design: refusing the customer's
        payment because a tidy-up call failed would be the worse outcome.
        """
        if not order.stripe_session_id:
            return None
        try:
            return retrieve_session(system, order.stripe_session_id)
        except (StripeGatewayError, StripeNotConfigured):
            expire_session(system, order.stripe_session_id)
            return None

    def _booking_charge(self, order):
        """What Stripe is asked for: the deposit on a deposit booking, else None.

        None means "use the order's line items", which is right for a cart order
        and for a booking paid in full.
        """
        booking = getattr(order, "booking", None)
        if booking is None or booking.payment_option != Booking.PAYMENT_DEPOSIT:
            return None
        return booking.amount_due_now

    def _booking_label(self, order):
        booking = getattr(order, "booking", None)
        if booking is None or booking.payment_option != Booking.PAYMENT_DEPOSIT:
            return ""
        name = booking.service.name if booking.service else "Service"
        return f"{name} - {booking.deposit_percent}% deposit"


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
            with transaction.atomic():
                order.status = Order.STATUS_CANCELED
                order.save(update_fields=["status", "updated_at"])
                # The mirror of the booking CMS's own cancel, which already
                # cancels the order with the booking (`AdminBookingDetailView`).
                # Canceling from the orders list must free the appointment too,
                # or the tenant has called off a job whose hour stays blocked.
                _release_booking(order)

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
        with transaction.atomic():
            order.status = Order.STATUS_CANCELED
            order.save(update_fields=["status", "updated_at"])
            # The session is gone, so this order can never be paid - and if it
            # was a booking, the hour it is holding is now held for nobody.
            released = _release_booking(order)
        if released:
            logger.info("Booking on expired order %s canceled, slot released", order.pk)
        invalidate_orders(order.user_id, order.system_id or 0)
        # A no-op for the usual abandoned checkout (no email was ever collected);
        # sends only if Stripe had already supplied an address.
        send_order_email(order, kind=STATUS)

    def _handle_failed(self, order, session):
        if order.status != Order.STATUS_PENDING:
            return
        with transaction.atomic():
            order.status = Order.STATUS_FAILED
            order.save(update_fields=["status", "updated_at"])
            # A payment that failed outright is as dead as an expired one, and
            # holds its slot in exactly the same way.
            released = _release_booking(order)
        if released:
            logger.info("Booking on failed order %s canceled, slot released", order.pk)
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



# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

# How many days of calendar one availability request may ask for. The endpoint is
# public and unauthenticated, and each day walks a slot generator - so the range
# is bounded here rather than trusted from the query string.
MAX_AVAILABILITY_DAYS = 62

# The hard ceiling on a requested party size, whatever the service says. Same
# reasoning as `MAX_AVAILABILITY_DAYS`: the endpoint is public and unauthenticated,
# and party size feeds the seat arithmetic on every candidate slot, so an
# unbounded one is a cheap way to make the engine work hard (and to mint cache
# keys). The service's own `booking_party_max` is applied on top of this.
MAX_PARTY_SIZE = 100


def _party_param(request, service):
    """The party size a request is asking about, clamped to what is offered.

    Never trusted as given, and never allowed past the service's own maximum: the
    availability payload has to answer the same question checkout will, and a
    calendar painted for a party the service would refuse is a calendar full of
    slots that refuse themselves on submit.
    """
    low, high = service.booking_party_range
    try:
        party = int(request.query_params.get("party") or low)
    except (TypeError, ValueError):
        party = low
    return max(low, min(party, high, MAX_PARTY_SIZE))


def _bookable_service(system, service_id):
    """The service a booking request names, or None.

    Scoped to `system` and to `booking_enabled`, so a crafted id can neither
    reach another tenant's catalog nor book a service its owner never opened for
    booking. `enabled` is checked too: a service withdrawn from the storefront
    must stop taking appointments the moment it is withdrawn.
    """
    if system is None:
        return None
    return (
        Service.objects.filter(
            pk=service_id, system=system, enabled=True, booking_enabled=True,
        )
        .prefetch_related("booking_branches__hours", "booking_pools__resources")
        .first()
    )


def _request_system(request):
    """The tenant for a booking request: the profile's, else the host's.

    Same rule as checkout - a signed-in caller is always scoped by their own
    profile, because `X-Website-Host` is client-settable and must never be able
    to point a logged-in user at another tenant.
    """
    if request.user.is_authenticated:
        return user_system(request)
    return host_system(request)


class BookingAvailabilityView(APIView):
    """
    GET /api/bookings/availability/
        ?service=<id>&branch=<id>&start=<YYYY-MM-DD>&days=<n>&party=<n>&resource=<id>

    The calendar's data source: which local dates have free slots, what those
    slots are, and how many seats each still has. Public, because a visitor picks
    an appointment before they have any reason to sign in.

    Returns UTC instants plus the branch's `timezone`, never local strings. The
    browser formats them with that zone, so a customer abroad reads the hour they
    are expected to arrive rather than the hour on their own wall.

    `party` and `resource` both change the answer, so both are clamped/validated
    here and both are part of the cache key.
    """

    permission_classes = (AllowAny,)

    def get(self, request):
        system = _request_system(request)
        service = _bookable_service(system, request.query_params.get("service"))
        if service is None:
            return Response(
                {"detail": "This service cannot be booked.", "code": "NOT_BOOKABLE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        branch_id = request.query_params.get("branch")
        try:
            branch_id = int(branch_id) if branch_id not in (None, "") else None
        except (TypeError, ValueError):
            branch_id = None
        branch, error = resolve_branch(service, branch_id)
        if error is not None:
            return Response({"detail": error, "code": "BRANCH_REQUIRED"}, status=status.HTTP_400_BAD_REQUEST)

        settings_tz = branch.tzinfo if branch is not None else dj_timezone.get_default_timezone()
        today_local = dj_timezone.now().astimezone(settings_tz).date()

        start = parse_date(request.query_params.get("start") or "") or today_local
        # Never look backwards: a past date has no bookable slot by definition,
        # and honouring one would only produce an empty payload at full cost.
        start = max(start, today_local)
        try:
            days = int(request.query_params.get("days") or 30)
        except (TypeError, ValueError):
            days = 30
        days = max(1, min(days, MAX_AVAILABILITY_DAYS))

        party = _party_param(request, service)

        # The customer's own pick, honoured only when the pool offering it is
        # `customer_selectable` and reachable from the resolved branch - the same
        # rule checkout applies, because a resource the calendar filtered by and
        # a resource checkout would refuse must not be two different sets.
        pickable = selectable_resources(service, branch)
        resource_id = None
        raw_resource = request.query_params.get("resource")
        if raw_resource not in (None, "", "0"):
            try:
                wanted = int(raw_resource)
            except (TypeError, ValueError):
                wanted = None
            resource_id = next((r.pk for r, _ in pickable if r.pk == wanted), None)

        cache_key = availability_key(
            service.pk, branch.pk if branch else None, start, days, party, resource_id,
        )
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        by_day = availability_range(
            service, branch, start, days, party_size=party, resource_id=resource_id,
        )
        earliest, last_date = booking_window(branch, now=dj_timezone.now())
        party_min, party_max = service.booking_party_range
        payload = {
            "service": service.pk,
            "branch": branch.pk if branch else None,
            "timezone": branch.timezone if branch else str(settings_tz),
            "duration_minutes": service_duration_minutes(service),
            "start": start.isoformat(),
            "days": days,
            "last_bookable_date": last_date.isoformat(),
            # A flat map of local date -> the day's slots. The frontend keys its
            # calendar straight off it, so a date absent from the map is a date
            # that cannot be selected.
            #
            # `seats_left` is the largest free block on a *single* resource, not
            # the sum across them: it answers "can the six of us take the 10:00?",
            # which two boats with three free seats each answer no.
            "availability": {
                day.isoformat(): [
                    {"at": slot.at.isoformat(), "seats_left": slot.seats_left} for slot in slots
                ]
                for day, slots in sorted(by_day.items())
            },
            "party": party,
            "party_min": party_min,
            "party_max": party_max,
            "party_enabled": service.booking_party_enabled,
            # Only ever populated for a `customer_selectable` pool. An empty list
            # is the ordinary case and means the booking page shows no picker.
            "resource": resource_id,
            "resources": [
                {
                    "id": r.pk,
                    "name": r.name,
                    "en_name": r.en_name or "",
                    "capacity": r.capacity,
                    "unit_label": pool.unit_label or "",
                    "en_unit_label": pool.en_unit_label or "",
                }
                for r, pool in pickable
            ],
        }
        cache.set(cache_key, payload, AVAILABILITY_CACHE_TTL)
        return Response(payload)


class BookingCheckoutView(APIView):
    """
    POST /api/bookings/checkout/ - turn a chosen slot into an Order + Booking.

    The booking equivalent of `CheckoutView`, and deliberately its sibling rather
    than a branch inside it: a cart checkout reads a basket, this one reads a
    service, a place and a time. What they share is the part that matters -
    `_open_order` writes the order and its snapshotted line, so a booked service
    is priced by exactly the same code that prices it in a cart.

    `AllowAny`, like cart checkout: a visitor may book without an account, and
    the resulting order's only handle is its `public_id` (claimable later by
    email, through `orders/claims.py`).

    **The slot is re-derived here, never trusted.** The calendar the customer is
    looking at may be minutes old.
    """

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = BookingCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        system = _request_system(request)
        if system is None:
            return Response(
                {"detail": "No system for this request.", "code": "NO_SYSTEM"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = _bookable_service(system, data["service"])
        if service is None:
            return Response(
                {"detail": "This service cannot be booked.", "code": "NOT_BOOKABLE"},
                status=status.HTTP_404_NOT_FOUND,
            )

        fulfillment = data["fulfillment"]
        if fulfillment not in service.booking_fulfillment_options:
            return Response(
                {"detail": "This service is not offered that way.", "code": "FULFILLMENT_UNAVAILABLE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment_option = data["payment_option"]
        if payment_option not in service.booking_payment_options:
            return Response(
                {"detail": "That payment option is not available.", "code": "PAYMENT_OPTION_UNAVAILABLE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Paying anything up front means Stripe, and a tenant that has not
        # connected an account can only take bookings paid in person. Checked
        # before anything is written, so a misconfigured site refuses the booking
        # rather than recording one it cannot collect on.
        if payment_option != Booking.PAYMENT_IN_PERSON and not system.stripe_configured:
            return Response(
                {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # An on-premises booking still schedules against a branch's calendar -
        # the staff going out are the same staff who would be in the shop, so the
        # hours and the capacity that apply are the branch's.
        branch, error = resolve_branch(service, data.get("branch"))
        if error is not None:
            return Response({"detail": error, "code": "BRANCH_REQUIRED"}, status=status.HTTP_400_BAD_REQUEST)

        # Party size is never trusted: it multiplies the price and consumes that
        # many seats, so a body naming 40 people on a service that accepts 8 has
        # to be refused, not clamped - the customer would be charged for a party
        # they did not ask for. A service with party off is forced back to 1
        # whatever the body says.
        party_min, party_max = service.booking_party_range
        party_size = data.get("party_size") or 1
        if not service.booking_party_enabled:
            party_size = 1
        elif not (party_min <= party_size <= party_max):
            return Response(
                {
                    "detail": f"This service takes between {party_min} and {party_max} people.",
                    "code": "PARTY_SIZE_INVALID",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Same rule the availability endpoint applies: a pick is honoured only
        # when its pool is customer-selectable and belongs to the resolved branch.
        # Anything else is dropped rather than refused - it is a preference, and
        # the engine will seat them somewhere.
        wanted_resource = data.get("resource")
        preferred_id = next(
            (r.pk for r, _ in selectable_resources(service, branch) if r.pk == wanted_resource),
            None,
        )

        starts_at = data["starts_at"].astimezone(dt_timezone.utc)

        user = request.user if request.user.is_authenticated else None
        contact = data.get("contact") or {}
        email = (contact.get("email") or (user.email if user else "") or "").strip()
        # Someone has to be reachable: an appointment that has to move and a
        # customer nobody can tell is worse than no booking at all.
        if not email and not (contact.get("phone") or "").strip():
            return Response(
                {"detail": "An email or a phone number is required to book.", "code": "CONTACT_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        duration = service_duration_minutes(service)

        # ── The critical section ───────────────────────────────────────────────
        # Checking availability and writing the booking must be one atomic step.
        # Un-serialised, two checkouts can both see the last four seats free and
        # both take them - a window that was one row wide when capacity counted
        # bookings, and is a real over-sell now that a party of six can walk into
        # it with money attached.
        #
        # The lock is taken on the Branch (the System for a branchless tenant)
        # because that is the row every booking at one location contends for.
        # Coarse on purpose: contention at a single physical place is inherently
        # serial, and a finer lock per resource could not cover the best-fit
        # decision that reads all of them.
        #
        # ⚠ Stripe stays *outside* this block. A network round-trip holding a row
        # lock would serialise every checkout at the branch behind the slowest
        # call to a third party - the same mistake the QR write already avoids.
        with transaction.atomic():
            if branch is not None:
                Branch.objects.select_for_update().filter(pk=branch.pk).first()
            else:
                System.objects.select_for_update().filter(pk=system.pk).first()

            assignment = assign_for_slot(
                service, branch, starts_at, party_size=party_size, preferred_id=preferred_id,
            )
            if not assignment.fits:
                return Response(
                    {
                        "detail": "That time is no longer available. Please pick another.",
                        "code": "SLOT_UNAVAILABLE",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            # One unsaved cart line for the service, so `_open_order` prices and
            # snapshots it exactly as it would in a cart.
            #
            # ⚠ Quantity is the **party size**, and this is deliberately not the
            # "2 x haircut at 10:00 is two bookings" case it used to be. Both
            # readings are right, for different services: an appointment is one
            # person's turn in a chair, and booking two of them is two separate
            # slots that a single quantity cannot express. A *departure* - a boat,
            # a tour, a table - is one slot that several people share, priced per
            # head. `booking_party_enabled` is which of the two a service is, and
            # the quantity is only ever above 1 when the tenant said so.
            item = CartItem(system=system, service=service, quantity=party_size)
            order, lines, order_error = _open_order(
                system,
                user,
                [item],
                # `placed` for pay-in-person (nothing will ever confirm it but the
                # tenant), `pending` when a Stripe session is about to be opened -
                # the same split the cart checkout makes.
                order_status=(
                    Order.STATUS_PLACED
                    if payment_option == Booking.PAYMENT_IN_PERSON
                    else Order.STATUS_PENDING
                ),
                payment_method=(
                    Order.PAYMENT_IN_STORE
                    if payment_option == Booking.PAYMENT_IN_PERSON
                    else Order.PAYMENT_ONLINE
                ),
                email=email,
                # See `_open_order`: the QR is written after the lock is released.
                defer_qr=True,
            )
            if order_error is not None:
                return order_error

            # Works off `order.total` and so multiplies with the party for free -
            # a 30% deposit on four seats is 30% of four seats.
            amount_now, amount_later = _booking_amounts(order.total, service, payment_option)

            booking = Booking.objects.create(
                order=order,
                service=service,
                branch=branch,
                branch_name=(branch.name or "") if branch else "",
                fulfillment=fulfillment,
                address=(
                    (data.get("address") or "").strip()
                    if fulfillment == Booking.FULFILLMENT_ON_PREMISES
                    else ""
                ),
                starts_at=starts_at,
                ends_at=starts_at + timedelta(minutes=duration),
                timezone=(branch.timezone if branch else str(dj_timezone.get_default_timezone())),
                duration_minutes=duration,
                party_size=party_size,
                resource=assignment.resource,
                resource_name=(assignment.resource.name if assignment.resource else ""),
                payment_option=payment_option,
                deposit_percent=(
                    service.booking_deposit_percent if payment_option == Booking.PAYMENT_DEPOSIT else 0
                ),
                amount_due_now=amount_now,
                amount_due_later=amount_later,
                notes=(data.get("notes") or "").strip(),
            )

        # Both deferred out of the critical section above: a round-trip to object
        # storage under a row lock would queue every other checkout at this branch
        # behind the network.
        attach_order_qr(order)

        order.phone = (contact.get("phone") or "").strip()
        order.shipping_name = (contact.get("name") or "").strip()
        order.save(update_fields=["phone", "shipping_name", "updated_at"])

        invalidate_availability()
        if user is not None:
            invalidate_orders(user.id, system.id)

        locale = data.get("locale") or "en"

        if payment_option == Booking.PAYMENT_IN_PERSON:
            # No Stripe session and no webhook, so the confirmation email is sent
            # here - the same place the offline cart checkout sends it.
            send_order_email(order, kind=CONFIRMATION)
            logger.info("Booking %s placed (pay in person) for order %s", booking.pk, order.pk)
            return Response(
                {
                    "order_id": str(order.public_id),
                    "booking_id": booking.pk,
                    "redirect": f"/{locale}/orders/{order.public_id}",
                },
                status=status.HTTP_201_CREATED,
            )

        base_url = _site_base_url(system)
        try:
            session = create_checkout_session(
                system=system,
                order=order,
                lines=lines,
                success_url=(
                    f"{base_url}/{locale}/orders/{order.public_id}"
                    "?session_id={CHECKOUT_SESSION_ID}"
                ),
                cancel_url=f"{base_url}/{locale}/services/{service.slug}",
                customer_email=email or "",
                # A deposit charges a fraction of the order; a full payment
                # charges the order and passes None so the line items are used.
                charge_amount=(amount_now if payment_option == Booking.PAYMENT_DEPOSIT else None),
                charge_label=(
                    f"{service.name or 'Service'} - {service.booking_deposit_percent}% deposit"
                    if payment_option == Booking.PAYMENT_DEPOSIT
                    else ""
                ),
                # An appointment has a place already - the branch's address or
                # the customer's own on the booking. Stripe's shipping form would
                # ask a customer walking into a salon where to post the haircut.
                collect_shipping_address=False,
            )
        except StripeNotConfigured:
            order.delete()
            return Response(
                {"detail": "This site is not set up to take payments.", "code": "PAYMENTS_UNAVAILABLE"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except StripeGatewayError:
            # Deleting the order cascades the booking, which is what we want: a
            # booking with no way to be paid would otherwise hold a slot nobody
            # can take and nobody is coming to.
            order.delete()
            invalidate_availability()
            return Response(
                {"detail": "Could not start checkout. Please try again.", "code": "STRIPE_ERROR"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.stripe_session_id = session.id
        order.save(update_fields=["stripe_session_id", "updated_at"])
        logger.info("Booking %s created, Stripe session %s for order %s", booking.pk, session.id, order.pk)
        return Response(
            {"url": session.url, "order_id": str(order.public_id), "booking_id": booking.pk},
            status=status.HTTP_201_CREATED,
        )


def _booking_amounts(total, service, payment_option):
    """Split an order total into what is charged now and what is owed later.

    Rounded to the currency's own two decimals with `ROUND_HALF_UP` and the
    remainder taken as the difference, so the two halves always add back up to
    the total exactly - deriving both by percentage would leave a cent
    unaccounted for on plenty of prices.
    """
    if payment_option == Booking.PAYMENT_FULL:
        return total, Decimal("0.00")
    if payment_option == Booking.PAYMENT_DEPOSIT:
        percent = Decimal(service.booking_deposit_percent or 0)
        now = (total * percent / Decimal(100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return now, total - now
    return Decimal("0.00"), total


class AdminBookingListView(APIView):
    """GET /api/bookings/admin/ - the tenant's bookings, soonest first.

    Filterable by `status` and by `from`/`to` local dates, which is how the CMS
    shows "upcoming" without pulling a year of history into the browser.
    """

    permission_classes = (IsSystemAdmin,)

    def get(self, request):
        system = user_system(request)
        if system is None:
            return Response([], status=status.HTTP_200_OK)

        qs = (
            Booking.objects.filter(order__system=system)
            .select_related("order", "order__user", "service", "branch", "resource", "resource__pool")
            .prefetch_related("order__lines")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status__in=[s for s in status_filter.split(",") if s])

        start = parse_date(request.query_params.get("from") or "")
        if start:
            qs = qs.filter(starts_at__gte=datetime.combine(start, time.min, tzinfo=dt_timezone.utc))
        end = parse_date(request.query_params.get("to") or "")
        if end:
            qs = qs.filter(
                starts_at__lt=datetime.combine(end + timedelta(days=1), time.min, tzinfo=dt_timezone.utc)
            )

        # Not cached, deliberately: this is the screen a tenant refreshes while a
        # customer is on the phone, and a five-minute-old answer about who is
        # coming at 10am is worse than a query.
        return Response(
            AdminBookingSerializer(qs[:400], many=True, context={"request": request}).data
        )


class AdminBookingDetailView(APIView):
    """
    GET   /api/bookings/admin/<pk>/  - one booking in full.
    PATCH /api/bookings/admin/<pk>/  - confirm / complete / cancel it.
    """

    permission_classes = (IsSystemAdmin,)

    def _get_object(self, request, pk):
        system = user_system(request)
        if system is None:
            return None
        return (
            Booking.objects.filter(pk=pk, order__system=system)
            .select_related("order", "order__user", "service", "branch", "resource", "resource__pool")
            .first()
        )

    def get(self, request, pk):
        booking = self._get_object(request, pk)
        if booking is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminBookingSerializer(booking, context={"request": request}).data)

    def patch(self, request, pk):
        booking = self._get_object(request, pk)
        if booking is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AdminBookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]

        if action == AdminBookingActionSerializer.REASSIGN:
            return self._reassign(request, booking, serializer.validated_data)

        if action == AdminBookingActionSerializer.CONFIRM:
            booking.status = Booking.STATUS_CONFIRMED
        elif action == AdminBookingActionSerializer.COMPLETE:
            booking.status = Booking.STATUS_COMPLETED
            # Completing an appointment *is* fulfilling the order it hangs off -
            # unlike a shipped product, the two happen in the same moment. The
            # payment axis is untouched: the tenant may still be owed the money.
            if not booking.order.fulfilled:
                booking.order.fulfilled = True
                booking.order.fulfilled_at = timezone.now()
                booking.order.save(update_fields=["fulfilled", "fulfilled_at", "updated_at"])
        else:
            booking.status = Booking.STATUS_CANCELED
            # The order is canceled with it. A booking is the whole of its order,
            # so leaving the order live would put a phantom in the customer's
            # history for an appointment that is not happening.
            if booking.order.status in (Order.STATUS_PENDING, Order.STATUS_PLACED):
                booking.order.status = Order.STATUS_CANCELED
                booking.order.save(update_fields=["status", "updated_at"])

        booking.save(update_fields=["status", "updated_at"])
        # Cancelling hands the slot back, and confirming/completing changes what
        # the CMS shows - clear either way rather than reasoning about which
        # transitions free time.
        invalidate_availability()
        if booking.order.user_id:
            invalidate_orders(booking.order.user_id, booking.order.system_id)

        return Response(AdminBookingSerializer(booking, context={"request": request}).data)

    def _reassign(self, request, booking, data):
        """Move a party to another resource, re-validated through the engine.

        **Never an inline seat check.** The whole design rests on one authority
        deciding what fits, and a second opinion written here is exactly the drift
        `orders/services/booking.py` exists to prevent - the difference would show
        up as a boat the CMS says is free and checkout refuses.

        `force` is the deliberate override, and it is not a loophole: an operator
        sometimes knows what the seat count cannot (a toddler on a lap, a guide
        riding along), and denying them one would only make them cancel and
        re-enter the booking to route around us - losing its order, its payment
        and its history in the process.
        """
        if booking.status in (Booking.STATUS_COMPLETED, Booking.STATUS_CANCELED):
            return Response(
                {
                    "detail": "A completed or canceled booking cannot be reassigned.",
                    "code": "BOOKING_CLOSED",
                },
                status=status.HTTP_409_CONFLICT,
            )

        wanted_id = data.get("resource")
        resource = None
        if wanted_id is not None:
            # Scoped through the pool's branch to the caller's own System, so a
            # crafted id can neither reach another tenant's boats nor a pool at a
            # location this booking is not at.
            resource = BookingResource.objects.filter(
                pk=wanted_id,
                pool__branch=booking.branch,
                pool__branch__system=booking.order.system,
            ).select_related("pool").first()
            if resource is None:
                return Response(
                    {"detail": "That resource is not available here.", "code": "RESOURCE_INVALID"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not data.get("force") and booking.service is not None:
            assignment = assign_for_slot(
                booking.service,
                booking.branch,
                booking.starts_at,
                party_size=booking.party_size,
                preferred_id=wanted_id,
                exclude_booking_id=booking.pk,
            )
            # `fits` alone is not enough: best fit would happily seat them
            # somewhere *else*, and silently honouring a reassignment to a
            # different resource than the operator picked is worse than refusing.
            chosen_id = assignment.resource.pk if assignment.resource else None
            if not assignment.fits or chosen_id != wanted_id:
                return Response(
                    {
                        "detail": "That resource cannot take this party at this time.",
                        "code": "RESOURCE_FULL",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        booking.resource = resource
        booking.resource_name = resource.name if resource is not None else ""
        booking.save(update_fields=["resource", "resource_name", "updated_at"])
        invalidate_availability()

        return Response(AdminBookingSerializer(booking, context={"request": request}).data)
