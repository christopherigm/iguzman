from django.urls import path

from .views import (
    AdminBookingDetailView,
    AdminBookingListView,
    AdminOrderDetailView,
    AdminOrderListView,
    BookingAvailabilityView,
    BookingCheckoutView,
    CheckoutView,
    OrderDetailView,
    OrderListView,
    OrderPayView,
    PosCheckoutView,
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
