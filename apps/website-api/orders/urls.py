from django.urls import path

from .views import (
    AdminBookingDetailView,
    AdminBookingListView,
    AdminOrderDetailView,
    AdminOrderListView,
    AdminRewardTierDetailView,
    AdminRewardTierListView,
    BookingAvailabilityView,
    BookingCheckoutView,
    AdminCouponDetailView,
    AdminCouponListView,
    CheckoutView,
    CouponPublicDetailView,
    CouponValidateView,
    OrderDetailView,
    OrderListView,
    OrderPayView,
    OrderReorderView,
    PosCheckoutView,
    RewardsSummaryView,
    StripeWebhookView,
)

urlpatterns = [
    path("orders/checkout/", CheckoutView.as_view(), name="order-checkout"),
    # Bookings. Under their own prefix rather than `orders/bookings/` because a
    # booking is addressed by its own id in the CMS, while its *order* is still
    # addressed by `public_id` under `orders/` - nesting them would suggest one
    # id space where there are two.
    path("bookings/availability/", BookingAvailabilityView.as_view(), name="booking-availability"),
    path("bookings/checkout/", BookingCheckoutView.as_view(), name="booking-checkout"),
    path("bookings/admin/", AdminBookingListView.as_view(), name="admin-booking-list"),
    path("bookings/admin/<int:pk>/", AdminBookingDetailView.as_view(), name="admin-booking-detail"),
    # Coupons. Under their own top-level prefix rather than `orders/coupons/`
    # because a coupon exists before any order does - it is a campaign the tenant
    # runs, which some orders happen to reference.
    path("coupons/admin/", AdminCouponListView.as_view(), name="admin-coupon-list"),
    path("coupons/admin/<int:pk>/", AdminCouponDetailView.as_view(), name="admin-coupon-detail"),
    # Ahead of `<str:code>/`, which would otherwise swallow "validate" as a code.
    path("coupons/validate/", CouponValidateView.as_view(), name="coupon-validate"),
    # The address every coupon QR resolves to, via the storefront's own
    # `/coupon/<code>` page. `str` rather than `slug` so a code is matched exactly
    # as it was printed and an unknown one 404s here instead of failing to route.
    path("coupons/<str:code>/", CouponPublicDetailView.as_view(), name="coupon-detail"),
    # Rewards. Their own top-level prefix for the reason coupons have one: a
    # tier and a points balance exist independently of any order, and some orders
    # happen to move them.
    path("rewards/", RewardsSummaryView.as_view(), name="rewards-summary"),
    path("rewards/tiers/admin/", AdminRewardTierListView.as_view(), name="admin-reward-tier-list"),
    path(
        "rewards/tiers/admin/<int:pk>/",
        AdminRewardTierDetailView.as_view(),
        name="admin-reward-tier-detail",
    ),
    # Tenant order management. Ahead of the customer routes below, though the
    # `<uuid>` converter would not match "admin" anyway.
    path("orders/admin/", AdminOrderListView.as_view(), name="admin-order-list"),
    # Ahead of `admin/<uuid:public_id>/` - "pos" is not a UUID so the converter
    # would reject it anyway, but the ordering makes the intent explicit.
    path("orders/admin/pos/", PosCheckoutView.as_view(), name="pos-checkout"),
    path("orders/admin/<uuid:public_id>/", AdminOrderDetailView.as_view(), name="admin-order-detail"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<uuid:public_id>/", OrderDetailView.as_view(), name="order-detail"),
    # Reopening checkout on an order that already exists, for the customer who
    # came back from Stripe without paying. Under the order's own id rather than
    # a second `orders/checkout/` verb: it acts on *this* order and charges its
    # frozen lines, where checkout builds a new one out of a cart.
    path("orders/<uuid:public_id>/pay/", OrderPayView.as_view(), name="order-pay"),
    # Turning a past order back into cart lines. Under the order's own id for the
    # reason `pay/` is: it acts on *this* order's frozen lines, where the cart's
    # own POST adds one item the browser named.
    path("orders/<uuid:public_id>/reorder/", OrderReorderView.as_view(), name="order-reorder"),
    # Keyed per tenant because each tenant's Stripe account signs with its own
    # secret - each pastes this URL, with their own token, into their own
    # dashboard. The token rather than the pk so that handing a tenant its own
    # endpoint does not also hand it a working id for everyone else's.
    path(
        "orders/stripe/webhook/<uuid:token>/",
        StripeWebhookView.as_view(),
        name="stripe-webhook",
    ),
]
