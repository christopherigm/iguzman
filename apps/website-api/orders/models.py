import uuid
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models

from core.models import CURRENCY_CHOICES


class Order(models.Model):
    """A cart turned into a purchase, and the Stripe payment behind it.

    Created `pending` when checkout starts and moved to `paid` by the webhook -
    never by the browser coming back to the success URL, which is only a
    redirect the user can forge, replay, or never follow. The webhook is the
    single source of truth about money.

    `system` is the tenant, and it is what decides *which Stripe account* this
    order belongs to: each System connects its own, so an order can only ever be
    reconciled against the credentials of the System that created it.

    Unlike `CartItem`, everything price-shaped here is a **snapshot** (see
    `OrderLine`). A cart deliberately reflects today's catalog; an order must
    reflect what was actually charged, forever, even after the item is re-priced,
    renamed, or deleted.
    """

    STATUS_PENDING = "pending"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"
    STATUS_CANCELED = "canceled"
    STATUS_REFUNDED = "refunded"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELED, "Canceled"),
        (STATUS_REFUNDED, "Refunded"),
    ]

    # The order's public handle: what the confirmation URL, the order-history
    # links and the detail API path all address it by. The integer pk stays the
    # internal key (every OrderLine FK and the admin hang off it), but it never
    # leaves the database - a sequential id in a URL would leak how many orders
    # the tenant has taken and let anyone walk the neighbours' order numbers.
    # Generated the moment the row is created, so it exists for a `pending`
    # order too, unlike any Stripe id, which is only set once payment moves.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )
    # PROTECT, unlike Favorite/CartItem's CASCADE: deleting a user must not
    # silently erase the record of money they paid. Orders are financial history
    # and outlive the account.
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)

    # One currency per order by construction: a Stripe Checkout Session is
    # single-currency, and Buyable.currency is per item, so checkout refuses a
    # mixed-currency cart rather than inventing a conversion.
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="USD")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Stripe's ids. `stripe_session_id` is unique so a replayed webhook cannot
    # produce a second paid order, and it is how the confirmation page proves the
    # session it was redirected with belongs to this order.
    stripe_session_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, default="")

    # Captured by Stripe Checkout and copied here by the webhook - our own
    # record, so it stays correct if the customer later edits their profile.
    email = models.EmailField(blank=True, default="")
    shipping_name = models.CharField(max_length=255, blank=True, default="")
    shipping_line1 = models.CharField(max_length=255, blank=True, default="")
    shipping_line2 = models.CharField(max_length=255, blank=True, default="")
    shipping_city = models.CharField(max_length=128, blank=True, default="")
    shipping_state = models.CharField(max_length=128, blank=True, default="")
    shipping_postal_code = models.CharField(max_length=32, blank=True, default="")
    shipping_country = models.CharField(max_length=2, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["system", "status"]),
        ]

    def __str__(self):
        return f"Order #{self.pk} ({self.status}) for {self.user.email}"

    @property
    def item_count(self):
        """Total quantity, matching how the cart counts - not the number of lines."""
        return sum(line.quantity for line in self.lines.all())


class OrderLine(models.Model):
    """One purchased item, frozen at the moment of checkout.

    Every displayable fact is copied here rather than read through the FKs:
    `name`, `unit_price` and `variant_label` are what the customer saw and agreed
    to pay, and re-deriving them from the catalog later would rewrite history the
    first time a price changes. The FKs are kept only as provenance - which is
    why they are SET_NULL: deleting a product must not delete the record that it
    was once sold, and the line still renders in full without it.
    """

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")

    product = models.ForeignKey(
        "catalog.Product", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    service = models.ForeignKey(
        "catalog.Service", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    menu_item = models.ForeignKey(
        "catalog.MenuItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    product_variant = models.ForeignKey(
        "catalog.ProductVariant", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    service_variant = models.ForeignKey(
        "catalog.ServiceVariant", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )

    # `kind` is stored rather than derived from which FK is set, because all may
    # be NULL once the catalog item is gone - and a line that can no longer say
    # whether it sold a product, a service, or a menu item is not much of a record.
    kind = models.CharField(
        max_length=9,
        choices=[("product", "Product"), ("service", "Service"), ("menu_item", "Menu Item")],
    )
    name = models.CharField(max_length=255)
    variant_label = models.CharField(max_length=255, blank=True, default="")
    sku = models.CharField(max_length=128, blank=True, default="")
    # A menu line's chosen customisation, snapshotted as a human-readable list of
    # {"name", "quantity", "unit_price", "line_upcharge", "removed"} at checkout,
    # so the order still reads back in full after the ingredient rows are gone.
    # Empty for products, services, and uncustomised menu items.
    customization = models.JSONField(default=list, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="USD")

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="order_line_quantity_positive",
            ),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.name} (order #{self.order_id})"
