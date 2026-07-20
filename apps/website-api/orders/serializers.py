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
            "public_id", "status", "currency", "subtotal", "total",
            "email", "shipping_name", "shipping_line1", "shipping_line2",
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
            "public_id", "status", "currency", "total",
            "created_at", "paid_at", "item_count", "line_images",
        ]

    def get_line_images(self, obj):
        request = self.context.get("request")
        images = [resolve_line_image(line, request) for line in obj.lines.all()]
        return [url for url in images if url]


class CheckoutSerializer(serializers.Serializer):
    """What the browser may say about a checkout: where to come back to, and -
    for a guest only - which items.

    Deliberately still no amount and no currency. A signed-in checkout ignores
    `cart` entirely and reads the rows; a guest's `cart` names *which* catalog
    items were chosen and nothing more, and every one of them is re-priced
    server-side from the tenant's catalog before a session is created. A client
    that could name a price could name its own.
    """

    locale = serializers.CharField(max_length=8, required=False, default="en")
    # Guest checkout only: the anonymous visitor's localStorage cart, in the same
    # per-line shape `POST /api/auth/cart/` takes.
    cart = CartItemWriteSerializer(many=True, required=False, default=list)
