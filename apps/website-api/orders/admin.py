from django.contrib import admin

from .models import Order, OrderLine


class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0
    # A line is a snapshot of a completed sale, so nothing here is editable:
    # changing a price or quantity after the fact would put the order out of step
    # with what Stripe actually charged, with no trace that it ever happened.
    fields = ("kind", "name", "variant_label", "sku", "unit_price", "quantity", "line_total", "currency")
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "system", "status", "total", "currency", "created_at", "paid_at")
    list_filter = ("status", "system", "currency")
    search_fields = ("id", "public_id", "user__email", "user__username", "email", "stripe_session_id", "stripe_payment_intent_id")
    raw_id_fields = ("user",)
    date_hierarchy = "created_at"
    inlines = [OrderLineInline]
    # Every money field and every Stripe id is written by the checkout view or the
    # webhook and is read-only here. `status` is the deliberate exception: it is
    # the one thing an operator legitimately changes by hand (marking a refund
    # they issued in the Stripe dashboard).
    readonly_fields = (
        "public_id",
        "system", "user", "currency", "subtotal", "total",
        "stripe_session_id", "stripe_payment_intent_id",
        "email", "shipping_name", "shipping_line1", "shipping_line2",
        "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
        "created_at", "updated_at", "paid_at",
    )

    fieldsets = (
        ("Order", {
            "fields": ("public_id", "system", "user", "status", "created_at", "updated_at", "paid_at"),
        }),
        ("Totals", {
            "fields": ("currency", "subtotal", "total"),
        }),
        ("Stripe", {
            "fields": ("stripe_session_id", "stripe_payment_intent_id"),
        }),
        ("Customer", {
            "fields": (
                "email", "shipping_name", "shipping_line1", "shipping_line2",
                "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
            ),
        }),
    )

    def has_add_permission(self, request):
        # An order only exists because a Checkout Session was created for it; one
        # typed in here would have no payment behind it and no session to reconcile.
        return False
