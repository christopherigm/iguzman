from rest_framework import serializers

from users.serializers import CartItemWriteSerializer

from .models import Order, OrderLine


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

    class Meta:
        model = OrderLine
        fields = [
            "id", "kind", "name", "sku", "customization",
            "unit_price", "quantity", "line_total", "currency",
            "image", "item_id", "item_slug",
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


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)

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
            "created_at", "paid_at", "item_count", "lines",
        ]


class OrderSummarySerializer(serializers.ModelSerializer):
    """The order-history list: enough for a row, without every line's payload.

    `line_images` is the one thing pulled off the lines: a compact preview of the
    purchased items for the history card. Only the resolved URLs, so a line whose
    catalog item is gone simply drops out of the strip rather than showing a gap.
    """

    item_count = serializers.IntegerField(read_only=True)
    line_images = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "public_id", "status", "payment_method", "fulfilled",
            "currency", "total",
            "created_at", "paid_at", "item_count", "line_images",
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

    class Meta:
        model = Order
        fields = [
            "public_id", "status", "payment_method", "fulfilled",
            "currency", "subtotal", "total",
            "email", "phone", "shipping_name", "shipping_line1", "shipping_line2",
            "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
            "created_at", "paid_at", "fulfilled_at", "item_count", "lines",
        ]


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

    action = serializers.ChoiceField(
        choices=[MARK_PAID, MARK_FULFILLED, UNMARK_FULFILLED, CANCEL],
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
