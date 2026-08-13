from django.utils import timezone
from rest_framework import serializers

from users.serializers import CartItemWriteSerializer

from .models import Booking, Order, OrderLine


def resolve_line_image(obj, request=None):
    """The image URL for one order line, or None.

    Prefers the item's `image` field, then falls back to the first gallery
    picture (`images`, by `sort_order`) - the same order as
    `ProductSerializer.get_image` - so an item pictured only through the CMS
    gallery still shows. Read through the FK, so it goes null once the catalog
    item is deleted. Shared by the line serializer and the history-list preview.
    """
    target = obj.product or obj.service or obj.menu_item
    source = None
    if target is not None and target.image:
        source = target.image
    elif target is not None:
        gallery = sorted(target.images.all(), key=lambda i: i.sort_order)
        first = next((i for i in gallery if i.image), None)
        source = first.image if first else None
    if source is None:
        return None
    return request.build_absolute_uri(source.url) if request else source.url


def resolve_qr_code(order, request=None):
    """The absolute URL of an order's stored QR code, or None.

    Absolute for the same reason `resolve_line_image` is: on R2 the storage
    backend already hands back a CDN URL, while on a local filesystem it hands
    back a relative media path that a browser on another origin cannot resolve.
    Null on an order placed before the field existed - the pages that render it
    must cope with that rather than assume every order has one.
    """
    if not order.qr_code:
        return None
    url = order.qr_code.url
    return request.build_absolute_uri(url) if request else url


class OrderLineSerializer(serializers.ModelSerializer):
    """A purchased line, served from its own snapshot.

    Every field but `image` and `item_id` comes off the row itself, so a line
    renders correctly after its catalog item is re-priced, renamed, or deleted -
    which is the entire point of snapshotting it.

    `image` is the deliberate exception: it is looked up through the FK and is
    null once the item is gone. A picture is decoration, and a missing one costs
    the customer nothing; freezing a copy of the file per order would grow the
    media directory without bound for no gain.

    The lookup mirrors the catalog's own `ProductSerializer.get_image`: prefer
    the item's `image` field, then fall back to the first gallery image
    (`images`, by `sort_order`). Many items carry no `image` of their own and
    were only ever given pictures through the CMS gallery, so without this
    fallback the order line would show a blank placeholder for an item whose
    detail page clearly has a photo.
    """

    image = serializers.SerializerMethodField()
    item_id = serializers.SerializerMethodField()
    item_slug = serializers.SerializerMethodField()
    item_menu_kind = serializers.SerializerMethodField()
    item_booking_enabled = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = [
            "id", "kind", "name", "sku", "customization",
            "unit_price", "quantity", "line_total", "currency",
            "image", "item_id", "item_slug", "item_menu_kind",
            "item_booking_enabled",
        ]

    @property
    def _request(self):
        return self.context.get("request")

    def get_image(self, obj):
        return resolve_line_image(obj, self._request)

    def get_item_id(self, obj):
        """The catalog id, so the order page can link back - null once deleted."""
        target = obj.product or obj.service or obj.menu_item
        return target.pk if target else None

    def get_item_slug(self, obj):
        target = obj.product or obj.service or obj.menu_item
        return getattr(target, "slug", None) if target else None

    def get_item_menu_kind(self, obj):
        """A menu item's ``kind``, so the order page can link to the route that
        matches it (``/drink/<slug>`` rather than ``/food/<slug>``). Null for a
        product or a service, and null once the item is deleted - like `image`
        and `item_slug`, this is read live through the FK rather than snapshotted,
        because it only exists to address a page that still exists."""
        return obj.menu_item.kind if obj.menu_item else None

    def get_item_booking_enabled(self, obj):
        """Whether this line's service is *still* sold as an appointment.

        Read live through the FK, like `item_slug` - it decides which action the
        order page offers ("Book again" → `/booking/<slug>`, rather than a
        one-click re-add to the cart), and an action must address the site as it
        is now. A service whose tenant has since turned booking off is bought
        again from the cart; one that was never bookable never had a booking
        page to send anyone to.

        False rather than null for a product or a menu item, so the frontend has
        one boolean to branch on instead of a tri-state.
        """
        return bool(obj.service and obj.service.booking_enabled)


class BookingSerializer(serializers.ModelSerializer):
    """The appointment behind an order, as the customer's own pages read it.

    `starts_at`/`ends_at` go out as UTC instants **and** `timezone` goes with
    them, because the two are only meaningful together: an appointment happens at
    the branch's local time, and a customer reading their order from another
    country must be shown the hour they are expected to turn up, not the hour it
    is where they are standing. The frontend formats with the `timeZone` option
    rather than the browser default for exactly that reason.
    """

    branch_name = serializers.SerializerMethodField()
    service_slug = serializers.CharField(source="service.slug", read_only=True, default=None)
    resource_name = serializers.SerializerMethodField()
    # The singular noun for whatever was assigned - "boat", "guide", "table" - so
    # the order page can say "Boat: Panga Marlin" in the tenant's own vocabulary
    # instead of a generic label the customer never saw while booking.
    resource_unit_label = serializers.SerializerMethodField()
    branch_location = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "status", "fulfillment", "branch", "branch_name",
            "starts_at", "ends_at", "timezone", "duration_minutes",
            "address", "notes", "payment_option", "deposit_percent",
            "amount_due_now", "amount_due_later", "service_slug",
            "party_size", "resource_name", "resource_unit_label",
            "branch_location",
        ]

    def get_branch_name(self, obj):
        """The live branch name when it still exists, else the snapshot.

        Preferring the live one keeps a renamed location reading correctly on
        upcoming bookings; falling back to the snapshot is what makes a deleted
        one still render at all.
        """
        if obj.branch is not None and obj.branch.name:
            return obj.branch.name
        return obj.branch_name or None

    def get_resource_name(self, obj):
        """Same live-then-snapshot rule as the branch, and for the same reason:
        a renamed boat should read correctly on an upcoming trip, and a retired
        one should still render on the record of a past trip."""
        if obj.resource is not None and obj.resource.name:
            return obj.resource.name
        return obj.resource_name or None

    def get_resource_unit_label(self, obj):
        # Only available while the resource still exists - the label lives on the
        # pool, and there is deliberately no third snapshot column for a word that
        # is decoration on a name we already kept.
        if obj.resource is not None:
            return obj.resource.pool.unit_label or None
        return None

    def get_branch_location(self, obj):
        """Where the customer is expected to turn up, or None.

        Read **live** through the FK and null once the branch is deleted, like
        `OrderLine.image` and for the same reason: a map is decoration on a
        record whose readable content (the time, the branch's name) is already
        snapshotted, and freezing a copy of the picture per order would grow the
        bucket without bound.

        ⚠ **Null for an `on_premises` booking, even though it has a branch.**
        Such a booking is still *scheduled* against a branch's calendar - the
        staff going out are the staff who would be in the shop - but the venue
        is the customer's own address, and a map of the shop on the very record
        that carries the address they gave points at the wrong place.

        Null too when nobody pinned the location: `map_image` is optional (an
        operator can save a branch without ever opening the picker), so a
        consumer must handle a location that has coordinates but no picture.
        """
        if obj.fulfillment == Booking.FULFILLMENT_ON_PREMISES:
            return None
        branch = obj.branch
        if branch is None or branch.latitude is None or branch.longitude is None:
            return None
        request = self.context.get("request")
        image = None
        if branch.map_image:
            image = branch.map_image.url
            if request is not None:
                image = request.build_absolute_uri(image)
        return {
            "latitude": str(branch.latitude),
            "longitude": str(branch.longitude),
            "address": branch.address or None,
            # The "once you are there" half - read live off the branch for the
            # same reason the address is: a correction to how the entrance is
            # described should reach the customer who is about to use it.
            "location_details": branch.location_details or None,
            "map_image": image,
        }


class BookingSummarySerializer(serializers.ModelSerializer):
    """A booking as a history-list row needs it: when, where, and what state.

    Separate from `BookingSerializer` for the same reason `OrderSummarySerializer`
    is separate from `OrderSerializer` - the list renders many of these and has no
    use for the notes, the address or the payment split.
    """

    branch_name = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["status", "fulfillment", "branch_name", "starts_at", "timezone", "party_size"]

    def get_branch_name(self, obj):
        if obj.branch is not None and obj.branch.name:
            return obj.branch.name
        return obj.branch_name or None


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    # Null on every ordinary order. Present, it is what turns the order page into
    # an appointment record - which is the whole reason a booking rides on an
    # Order rather than living in a parallel model.
    booking = BookingSerializer(read_only=True)
    # The order's own QR code, so the detail page can show the customer the same
    # symbol their email carries - and so an admin has something to scan back at
    # the counter. Null on an order that predates the field.
    qr_code = serializers.SerializerMethodField()

    class Meta:
        model = Order
        # `public_id`, not the integer pk: the browser only ever addresses an
        # order by its public handle, and the sequential id stays server-side.
        # No Stripe ids either: the browser has no use for them and they are the
        # tenant's payment-account internals. `status` is what the confirmation
        # page reads.
        fields = [
            "public_id", "status", "payment_method", "fulfilled",
            "currency", "subtotal", "total",
            "email", "phone", "shipping_name", "shipping_line1", "shipping_line2",
            "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
            "created_at", "paid_at", "item_count", "lines", "booking", "qr_code",
        ]

    def get_qr_code(self, obj):
        return resolve_qr_code(obj, self.context.get("request"))


class OrderSummarySerializer(serializers.ModelSerializer):
    """The order-history list: enough for a row, without every line's payload.

    `line_images` is the one thing pulled off the lines: a compact preview of the
    purchased items for the history card. Only the resolved URLs, so a line whose
    catalog item is gone simply drops out of the strip rather than showing a gap.
    """

    item_count = serializers.IntegerField(read_only=True)
    line_images = serializers.SerializerMethodField()
    # Just enough for the history card to say "Tue 12 Aug, 10:00 - Downtown"
    # instead of pretending an appointment is an ordinary purchase. The full
    # record stays on the detail page.
    booking = BookingSummarySerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            "public_id", "status", "payment_method", "fulfilled",
            "currency", "total",
            "created_at", "paid_at", "item_count", "line_images", "booking",
        ]

    def get_line_images(self, obj):
        request = self.context.get("request")
        images = [resolve_line_image(line, request) for line in obj.lines.all()]
        return [url for url in images if url]


class AdminOrderSummarySerializer(serializers.ModelSerializer):
    """One row in the tenant's order-management list.

    A superset of the customer's history row: it also carries how the customer is
    paying, whether the order has been fulfilled, and who placed it - the columns
    a tenant sorts and acts on. Still no Stripe ids (the tenant's payment-account
    internals have no place in the CMS).
    """

    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = [
            "public_id", "status", "payment_method", "fulfilled",
            "currency", "total", "email", "phone", "shipping_name",
            "created_at", "paid_at", "fulfilled_at", "item_count",
        ]


class AdminOrderSerializer(serializers.ModelSerializer):
    """One order in full for the tenant's management detail view.

    Unlike the customer's `OrderSerializer` this exposes the fulfillment axis
    (`fulfilled`/`fulfilled_at`), the payment method, and the phone the offline
    form collected - everything the tenant needs to fulfil the order - but still
    never the Stripe ids.
    """

    lines = OrderLineSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    # Carried here too so the CMS detail view can reprint the code an operator
    # needs to stick on a package or hand back over the counter, without going
    # through the customer-facing endpoint for it.
    qr_code = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "public_id", "status", "payment_method", "fulfilled",
            "currency", "subtotal", "total",
            "email", "phone", "shipping_name", "shipping_line1", "shipping_line2",
            "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
            "created_at", "paid_at", "fulfilled_at", "item_count", "lines", "qr_code",
        ]

    def get_qr_code(self, obj):
        return resolve_qr_code(obj, self.context.get("request"))


class AdminOrderActionSerializer(serializers.Serializer):
    """A single management action a tenant takes on one order.

    Deliberately an action verb rather than a free `status` write: the legal
    transitions are few and each one has side effects (stamping `paid_at`,
    toggling `fulfilled` on its own axis), so naming the intent keeps an
    accidental jump to an impossible state - or clobbering the fulfillment flag
    while setting payment - off the table.
    """

    MARK_PAID = "mark_paid"
    MARK_FULFILLED = "mark_fulfilled"
    UNMARK_FULFILLED = "unmark_fulfilled"
    CANCEL = "cancel"
    # Paid *and* handed over, in one transition. The two axes stay separate
    # everywhere else because they genuinely come apart - an online order ships
    # long after it is paid, a pay-in-store order may be picked up before the
    # money is recorded. At a counter they do not: the customer pays and walks
    # out with the bread in the same movement, and making the associate tap
    # twice would only produce half-completed sales when the queue is moving.
    # Restricted to `Order.POS_METHODS` so it cannot be used to shortcut the
    # fulfillment tracking on a delivery order.
    COMPLETE = "complete"

    action = serializers.ChoiceField(
        choices=[MARK_PAID, MARK_FULFILLED, UNMARK_FULFILLED, CANCEL, COMPLETE],
    )


class CheckoutContactSerializer(serializers.Serializer):
    """The customer's contact details for an **offline** order.

    Only used by pay-in-store / pay-on-delivery: an online order gets its contact
    from Stripe's hosted page instead, so this is never read on that branch. A
    name and at least one way to reach the customer are required (enforced in
    `CheckoutSerializer.validate`), so the tenant can actually confirm a pickup or
    a delivery.
    """

    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class CheckoutShippingSerializer(serializers.Serializer):
    """The delivery address for a **pay-on-delivery** order.

    Required only for that method (see `CheckoutSerializer.validate`); pay-in-store
    and online orders never send it. Mirrors the address columns on `Order`.
    """

    line1 = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    line2 = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    city = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    state = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    postal_code = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    country = serializers.CharField(max_length=2, required=False, allow_blank=True, default="")


class PosContactSerializer(serializers.Serializer):
    """Optional contact details for a counter sale.

    Every field is optional, unlike `CheckoutContactSerializer`. At a counter
    there is nobody to reach: the customer is standing there and leaves with the
    goods, so demanding a name and an email for a loaf of bread would buy us
    nothing and cost the associate the queue. An email, when the customer does
    want a receipt, is worth taking - it is also what later lets them claim the
    order by registering (`orders/claims.py`), exactly as a guest order is
    claimed.
    """

    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")


class PosCheckoutSerializer(serializers.Serializer):
    """A counter sale rung up by a store associate on the POS screen.

    The basket arrives as **references** in exactly the shape a guest cart uses
    (`CartItemWriteSerializer`), and is priced by `resolve_guest_cart` against
    the tenant's own catalog. That is not incidental reuse: the associate's
    browser is as untrusted as a customer's about money, and routing both
    through one pricing path is what stops a POS total from ever disagreeing
    with what the site would have charged for the same basket.

    Note there is no `locale` and no `shipping`. Nothing redirects - the POS
    stays on its own screen - and a counter sale is handed over across the
    counter, so there is no address to collect.
    """

    TERMINAL = "terminal"
    CASH = "cash"

    # Required, unlike `CheckoutSerializer.cart`: the POS never reads a stored
    # cart. The associate is signed in, but their *own* cart is their own - it
    # has nothing to do with the customer in front of them, which is exactly why
    # this cannot reuse `CheckoutView`.
    cart = CartItemWriteSerializer(many=True)
    payment_method = serializers.ChoiceField(choices=[TERMINAL, CASH])
    contact = PosContactSerializer(required=False)

    def validate_cart(self, value):
        if not value:
            raise serializers.ValidationError("A sale needs at least one item.")
        return value


class CheckoutSerializer(serializers.Serializer):
    """What the browser may say about a checkout: where to come back to, how the
    customer is paying, and - for a guest, or any offline order - the details we
    cannot read off a Stripe page.

    Deliberately still no amount and no currency. A signed-in online checkout
    ignores `cart` entirely and reads the rows; a guest's `cart` names *which*
    catalog items were chosen and nothing more, and every one of them is re-priced
    server-side from the tenant's catalog before an order is created. A client
    that could name a price could name its own - offline included: `contact` and
    `shipping` decide who and where, never how much.
    """

    ONLINE = "online"
    IN_STORE = "in_store"
    ON_DELIVERY = "on_delivery"
    OFFLINE_METHODS = frozenset({IN_STORE, ON_DELIVERY})

    locale = serializers.CharField(max_length=8, required=False, default="en")
    # Guest checkout only: the anonymous visitor's localStorage cart, in the same
    # per-line shape `POST /api/auth/cart/` takes.
    cart = CartItemWriteSerializer(many=True, required=False, default=list)
    payment_method = serializers.ChoiceField(
        choices=[ONLINE, IN_STORE, ON_DELIVERY], required=False, default=ONLINE,
    )
    contact = CheckoutContactSerializer(required=False)
    shipping = CheckoutShippingSerializer(required=False)

    def validate(self, attrs):
        method = attrs.get("payment_method", self.ONLINE)
        if method not in self.OFFLINE_METHODS:
            return attrs

        # No Stripe page collects these for an offline order, so our own form is
        # the only place they can come from. A name plus one contact channel is
        # the floor for the tenant to confirm the order.
        contact = attrs.get("contact") or {}
        if not (contact.get("name") or "").strip():
            raise serializers.ValidationError(
                {"contact": {"name": "A name is required to place this order."}}
            )
        if not (contact.get("email") or "").strip() and not (contact.get("phone") or "").strip():
            raise serializers.ValidationError(
                {"contact": "An email or a phone number is required to place this order."}
            )

        if method == self.ON_DELIVERY:
            shipping = attrs.get("shipping") or {}
            if not (shipping.get("line1") or "").strip() or not (shipping.get("city") or "").strip():
                raise serializers.ValidationError(
                    {"shipping": "A delivery address is required for pay on delivery."}
                )
        return attrs


class BookingCheckoutSerializer(serializers.Serializer):
    """What the browser may say when it books an appointment.

    The same rule as `CheckoutSerializer`, applied to a different shape: this
    names **which** service, **where** and **when**, and never how much. The
    price comes off the catalog row, the deposit percentage off the service, and
    the slot is re-validated against the branch's live availability - so a body
    that named a price, a discount or a slot the branch never offered buys
    nothing.

    `starts_at` is an absolute instant (ISO 8601 with an offset), not a local
    "2026-08-12 10:00" plus a separate date. A wall-clock string would have to be
    interpreted against *some* zone, and the browser's is the one zone that is
    certainly wrong for a branch in another country.
    """

    service = serializers.IntegerField()
    branch = serializers.IntegerField(required=False, allow_null=True)
    fulfillment = serializers.ChoiceField(
        choices=[Booking.FULFILLMENT_BRANCH, Booking.FULFILLMENT_ON_PREMISES],
        required=False,
        default=Booking.FULFILLMENT_BRANCH,
    )
    starts_at = serializers.DateTimeField()
    payment_option = serializers.ChoiceField(
        choices=[Booking.PAYMENT_FULL, Booking.PAYMENT_DEPOSIT, Booking.PAYMENT_IN_PERSON],
        required=False,
        default=Booking.PAYMENT_IN_PERSON,
    )
    # Where the customer wants an on-premises service delivered. Required for
    # that fulfillment and ignored otherwise - a branch booking's address is the
    # branch's own, and taking a second copy of it would only let the two drift.
    address = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    locale = serializers.CharField(max_length=8, required=False, default="en")
    # How many people. Bounded loosely here and *properly* in the view, against
    # the service's own `booking_party_range` - the serializer has no service to
    # check against, and a body naming a party the service does not accept must
    # be refused rather than clamped, so the customer is never charged for a
    # different number of people than they asked for.
    party_size = serializers.IntegerField(min_value=1, max_value=1000, required=False, default=1)
    # The customer's pick of boat/guide/room. A hint, not an instruction: the
    # view honours it only when its pool is `customer_selectable` and reachable
    # from the resolved branch, and falls back to best fit when it has filled up
    # since the calendar was painted.
    resource = serializers.IntegerField(required=False, allow_null=True)
    # Reused verbatim from cart checkout: a booking always needs a way to reach
    # the customer, guest or not, because someone has to be told if the
    # appointment has to move.
    contact = CheckoutContactSerializer(required=False)

    def validate_starts_at(self, value):
        if value is None:
            raise serializers.ValidationError("A start time is required.")
        # DRF returns an aware datetime whenever USE_TZ is on, but a naive one
        # would silently be compared against aware instants further down and
        # raise deep inside the availability engine instead of here.
        if timezone.is_naive(value):
            raise serializers.ValidationError("The start time must include a timezone offset.")
        return value

    def validate(self, attrs):
        if attrs.get("fulfillment") == Booking.FULFILLMENT_ON_PREMISES:
            if not (attrs.get("address") or "").strip():
                raise serializers.ValidationError(
                    {"address": "An address is required when the service comes to you."}
                )
        return attrs


class AdminBookingSerializer(serializers.ModelSerializer):
    """One row in the tenant's bookings screen.

    Carries the customer's name and contact off the **order**, not off a copy
    here: an appointment is useless to a tenant that cannot reach the person, and
    duplicating those fields onto Booking would give two answers to one question
    the first time a customer corrected their phone number.
    """

    order_public_id = serializers.CharField(source="order.public_id", read_only=True)
    order_status = serializers.CharField(source="order.status", read_only=True)
    order_total = serializers.DecimalField(
        source="order.total", max_digits=12, decimal_places=2, read_only=True,
    )
    currency = serializers.CharField(source="order.currency", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.CharField(source="order.email", read_only=True)
    customer_phone = serializers.CharField(source="order.phone", read_only=True)
    service_name = serializers.SerializerMethodField()
    branch_name = serializers.SerializerMethodField()
    resource_name = serializers.SerializerMethodField()
    resource_unit_label = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "status", "fulfillment", "branch", "branch_name",
            "starts_at", "ends_at", "timezone", "duration_minutes",
            "address", "notes", "payment_option", "deposit_percent",
            "amount_due_now", "amount_due_later",
            "order_public_id", "order_status", "order_total", "currency",
            "customer_name", "customer_email", "customer_phone",
            "service", "service_name", "created_at",
            "party_size", "resource", "resource_name", "resource_unit_label",
        ]

    def get_customer_name(self, obj):
        # `shipping_name` is what our own checkout form collected; the account's
        # own name is the fallback for a signed-in customer who never typed one.
        order = obj.order
        if order.shipping_name:
            return order.shipping_name
        if order.user_id and order.user.get_full_name():
            return order.user.get_full_name()
        return order.email or ""

    def get_service_name(self, obj):
        """The service's name, from the order line's snapshot when the catalog
        row is gone - the line is the record, exactly as on an ordinary order."""
        if obj.service is not None and obj.service.name:
            return obj.service.name
        line = obj.order.lines.first()
        return line.name if line else ""

    def get_branch_name(self, obj):
        if obj.branch is not None and obj.branch.name:
            return obj.branch.name
        return obj.branch_name or None

    def get_resource_name(self, obj):
        if obj.resource is not None and obj.resource.name:
            return obj.resource.name
        return obj.resource_name or None

    def get_resource_unit_label(self, obj):
        if obj.resource is not None:
            return obj.resource.pool.unit_label or None
        return None


class AdminBookingActionSerializer(serializers.Serializer):
    """A management action on one booking.

    An action verb rather than a free `status` write, for the same reason
    `AdminOrderActionSerializer` is one: the transitions are few, and a couple of
    them (cancelling, which hands the slot back to the calendar) have
    consequences beyond the field.

    Note that none of these touch the money. `Order.status` is the payment axis
    and stays where it is - a tenant confirming an appointment is not recording a
    payment, and completing one is not collecting for it.

    `reassign` is the one that carries a payload: which resource to move the
    party to, and whether to do it even if the seats do not fit.
    """

    CONFIRM = "confirm"
    COMPLETE = "complete"
    CANCEL = "cancel"
    REASSIGN = "reassign"

    action = serializers.ChoiceField(choices=[CONFIRM, COMPLETE, CANCEL, REASSIGN])
    # Null is meaningful: "take them off any specific resource", which is what a
    # branch with no pools looks like. `required=False` distinguishes an absent
    # key from an explicit null.
    resource = serializers.IntegerField(required=False, allow_null=True)
    # Deliberate overbooking, behind an explicit confirmation in the CMS. An
    # operator sometimes knows something the seat count does not - a toddler on a
    # lap, a guide riding along - and without an override they would simply cancel
    # and re-enter the booking to route around us, losing its history in the
    # process.
    force = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs.get("action") == self.REASSIGN and "resource" not in attrs:
            raise serializers.ValidationError(
                {"resource": "Reassigning needs a resource (or an explicit null)."}
            )
        return attrs
