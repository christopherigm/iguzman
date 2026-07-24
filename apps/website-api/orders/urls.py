from django.urls import path

from .views import (
    AdminOrderDetailView,
    AdminOrderListView,
    CheckoutView,
    OrderDetailView,
    OrderListView,
    PosCheckoutView,
    StripeWebhookView,
)

urlpatterns = [
    path("orders/checkout/", CheckoutView.as_view(), name="order-checkout"),
    # Tenant order management. Ahead of the customer routes below, though the
    # `<uuid>` converter would not match "admin" anyway.
    path("orders/admin/", AdminOrderListView.as_view(), name="admin-order-list"),
    # Ahead of `admin/<uuid:public_id>/` - "pos" is not a UUID so the converter
    # would reject it anyway, but the ordering makes the intent explicit.
    path("orders/admin/pos/", PosCheckoutView.as_view(), name="pos-checkout"),
    path("orders/admin/<uuid:public_id>/", AdminOrderDetailView.as_view(), name="admin-order-detail"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<uuid:public_id>/", OrderDetailView.as_view(), name="order-detail"),
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
