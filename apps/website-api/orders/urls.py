from django.urls import path

from .views import CheckoutView, OrderDetailView, OrderListView, StripeWebhookView

urlpatterns = [
    path("orders/checkout/", CheckoutView.as_view(), name="order-checkout"),
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
