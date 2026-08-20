from django.contrib import admin
from django.utils import timezone

from .models import Booking, Coupon, Order, OrderLine


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = (
        "code", "system", "kind", "value", "currency", "scope_kind", "times_redeemed",
        "max_redemptions", "starts_at", "expires_at", "enabled",
    )
    list_filter = ("kind", "scope_kind", "enabled", "system", "currency")
    search_fields = ("code", "name", "description", "public_id")
    date_hierarchy = "created_at"
    # `times_redeemed` is moved only by `redeem_coupon`'s F() expression, which is
    # what keeps two simultaneous checkouts from both taking the last redemption.
    # Typing over it here would race with exactly that, so it is a readout - use
    # `max_redemptions` to widen or close a campaign.
    readonly_fields = ("public_id", "qr_code", "times_redeemed", "created_at", "updated_at")
    # ⚠ `scope_id` is a bare integer here with no widget to pick a row, and
    # nothing in the admin checks that it names one of this coupon's own
    # tenant's records - the CMS serializer is what does that
    # (`CouponSerializer._validate_scope`). A scope typed in here can therefore
    # point at another tenant's id and discount whichever of *this* tenant's
    # items happens to share the number. Set a coupon's target from the CMS.


class OrderLineInline(admin.TabularInline):
    model = OrderLine
    extra = 0
    # A line is a snapshot of a completed sale, so nothing here is editable:
    # changing a price or quantity after the fact would put the order out of step
    # with what Stripe actually charged, with no trace that it ever happened.
    fields = ("kind", "name", "sku", "unit_price", "quantity", "line_total", "currency")
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "id", "user", "system", "status", "payment_method", "fulfilled",
        "total", "currency", "created_at", "paid_at",
    )
    list_filter = ("status", "payment_method", "fulfilled", "system", "currency")
    search_fields = ("id", "public_id", "user__email", "user__username", "email", "phone", "stripe_session_id", "stripe_payment_intent_id")
    raw_id_fields = ("user",)
    date_hierarchy = "created_at"
    inlines = [OrderLineInline]
    actions = ("mark_paid", "mark_fulfilled", "unmark_fulfilled")
    # Every money field and every Stripe id is written by the checkout view or the
    # webhook and is read-only here. `status`, `fulfilled`/`fulfilled_at` are the
    # deliberate exceptions: they are what an operator legitimately changes by hand
    # (marking a refund issued in the Stripe dashboard, or an offline order paid /
    # handed over).
    readonly_fields = (
        "public_id", "qr_code",
        "system", "user", "payment_method", "currency", "subtotal", "total",
        "stripe_session_id", "stripe_payment_intent_id",
        "email", "phone", "shipping_name", "shipping_line1", "shipping_line2",
        "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
        "created_at", "updated_at", "paid_at",
    )

    fieldsets = (
        ("Order", {
            "fields": (
                "public_id", "qr_code", "system", "user", "status", "payment_method",
                "fulfilled", "fulfilled_at", "created_at", "updated_at", "paid_at",
            ),
        }),
        ("Totals", {
            "fields": ("currency", "subtotal", "total"),
        }),
        ("Stripe", {
            "fields": ("stripe_session_id", "stripe_payment_intent_id"),
        }),
        ("Customer", {
            "fields": (
                "email", "phone", "shipping_name", "shipping_line1", "shipping_line2",
                "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country",
            ),
        }),
    )

    def has_add_permission(self, request):
        # An order only exists because checkout created it; one typed in here would
        # have no payment behind it and no session to reconcile.
        return False

    @admin.action(description="Mark selected offline orders as paid")
    def mark_paid(self, request, queryset):
        # Offline only: an online order's payment is Stripe's to confirm.
        updated = (
            queryset
            .exclude(payment_method=Order.PAYMENT_ONLINE)
            .filter(status__in=[Order.STATUS_PLACED, Order.STATUS_PENDING])
            .update(status=Order.STATUS_PAID, paid_at=timezone.now())
        )
        self.message_user(request, f"{updated} order(s) marked paid.")

    @admin.action(description="Mark selected orders as fulfilled")
    def mark_fulfilled(self, request, queryset):
        updated = queryset.update(fulfilled=True, fulfilled_at=timezone.now())
        self.message_user(request, f"{updated} order(s) marked fulfilled.")

    @admin.action(description="Mark selected orders as not fulfilled")
    def unmark_fulfilled(self, request, queryset):
        updated = queryset.update(fulfilled=False, fulfilled_at=None)
        self.message_user(request, f"{updated} order(s) marked not fulfilled.")


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "id", "starts_at", "status", "fulfillment", "branch_name",
        "payment_option", "amount_due_now", "amount_due_later", "order",
    )
    list_filter = ("status", "fulfillment", "payment_option", "branch")
    search_fields = ("order__public_id", "order__email", "branch_name", "notes", "address")
    raw_id_fields = ("order", "service", "branch")
    date_hierarchy = "starts_at"
    # Everything the checkout derived is read-only: the amounts are the agreement
    # struck with the customer, and the snapshots (timezone, duration,
    # branch_name) are what make a past booking still read back correctly. The
    # exceptions are the ones an operator legitimately changes by hand - the
    # status, and rescheduling the appointment itself.
    readonly_fields = (
        "order", "service", "branch", "branch_name", "fulfillment",
        "timezone", "duration_minutes", "payment_option", "deposit_percent",
        "amount_due_now", "amount_due_later", "created_at", "updated_at",
    )
    fieldsets = (
        ("Appointment", {
            "fields": (
                "order", "service", "status", "fulfillment",
                "branch", "branch_name", "address",
                "starts_at", "ends_at", "timezone", "duration_minutes",
            ),
        }),
        ("Payment", {
            "fields": ("payment_option", "deposit_percent", "amount_due_now", "amount_due_later"),
        }),
        ("Customer", {
            "fields": ("notes", "created_at", "updated_at"),
        }),
    )

    def has_add_permission(self, request):
        # A booking only exists because a checkout created it - and one typed in
        # here would have no order behind it, which is where its price, its
        # customer and its payment all live.
        return False
