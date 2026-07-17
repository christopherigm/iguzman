from rest_framework import serializers

from .models import Order, OrderLine


class OrderLineSerializer(serializers.ModelSerializer):
    """A purchased line, served from its own snapshot.

    Every field but `image` and `item_id` comes off the row itself, so a line
    renders correctly after its catalog item is re-priced, renamed, or deleted -
    which is the entire point of snapshotting it.

    `image` is the deliberate exception: it is looked up through the FK and is
    null once the item is gone. A picture is decoration, and a missing one costs
    the customer nothing; freezing a copy of the file per order would grow the
    media directory without bound for no gain.
    """

    image = serializers.SerializerMethodField()
    item_id = serializers.SerializerMethodField()
    item_slug = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = [
            "id", "kind", "name", "variant_label", "sku",
            "unit_price", "quantity", "line_total", "currency",
            "image", "item_id", "item_slug",
        ]

    @property
    def _request(self):
        return self.context.get("request")

    def get_image(self, obj):
        target = obj.product or obj.service
        variant = obj.product_variant or obj.service_variant
        source = None
        if variant is not None and variant.image:
            source = variant.image
        elif target is not None and target.image:
            source = target.image
        if source is None:
            return None
        request = self._request
        return request.build_absolute_uri(source.url) if request else source.url

    def get_item_id(self, obj):
        """The catalog id, so the order page can link back - null once deleted."""
        target = obj.product or obj.service
        return target.pk if target else None

    def get_item_slug(self, obj):
        target = obj.product or obj.service
        return getattr(target, "slug", None) if target else None


class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        # No Stripe ids: the browser has no use for them and they are the tenant's
        # payment-account internals. `status` is what the confirmation page reads.
        fields = [
            "id", "status", "currency", "subtotal", "total",
            "email", "shipping_name", "shipping_line1", "shipping_line2",
            "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
            "created_at", "paid_at", "item_count", "lines",
        ]


class OrderSummarySerializer(serializers.ModelSerializer):
    """The order-history list: enough for a row, without every line's payload."""

    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = ["id", "status", "currency", "total", "created_at", "paid_at", "item_count"]


class CheckoutSerializer(serializers.Serializer):
    """What the browser may say about a checkout: only where to come back to.

    Deliberately no amount, no items and no currency - those are read from the
    user's cart server-side. A client that could name a price could name its own.
    """

    locale = serializers.CharField(max_length=8, required=False, default="en")
