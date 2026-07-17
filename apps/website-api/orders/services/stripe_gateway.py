"""
Per-System Stripe access: build a client from a System's stored credentials,
open a Checkout Session for an order, and verify the signature on that System's
webhooks.

This is the website's counterpart to ``cinelog-api/users/s3.py`` - the same
shape, for the same reason. Credentials belong to a tenant, not to the process,
so nothing here reads a key from settings: every entry point takes the System
and decrypts what it needs (see ``core.crypto``). A module-level
``stripe.api_key`` would be exactly the bug this design exists to prevent - it
is global mutable state, so under concurrent requests one tenant's checkout
could be created against another tenant's Stripe account. We pass ``api_key``
per call instead.
"""

import logging
import time
from decimal import Decimal

import stripe
from django.conf import settings
from stripe import StripeError

logger = logging.getLogger(__name__)


class StripeNotConfigured(Exception):
    """This System cannot take payments (switched off, or missing credentials)."""


class StripeGatewayError(Exception):
    """A Stripe call failed. The message is for logs, never for the browser."""


# Currencies Stripe bills in whole units - they have no minor unit, so an amount
# must NOT be multiplied by 100. Every currency in core.CURRENCY_CHOICES that is
# absent from this set is a normal two-decimal currency.
_ZERO_DECIMAL_CURRENCIES = {
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
}


def to_minor_units(amount: Decimal, currency: str) -> int:
    """Convert a decimal price to the integer amount Stripe expects.

    Stripe takes amounts in a currency's smallest unit, which for most
    currencies means cents - but not for the zero-decimal ones, where sending
    ``amount * 100`` would silently overcharge by 100x. CLP is in
    ``CURRENCY_CHOICES``, so this project can actually hit that case.
    """
    if currency.upper() in _ZERO_DECIMAL_CURRENCIES:
        return int(amount.to_integral_value())
    return int((amount * 100).to_integral_value())


def _api_key(system) -> str:
    """The System's decrypted Stripe secret key, or raise StripeNotConfigured."""
    if not system or not system.stripe_configured:
        raise StripeNotConfigured("This site is not set up to take payments.")
    key = system.stripe_secret_key
    if not key:
        raise StripeNotConfigured("This site is not set up to take payments.")
    return key


def create_checkout_session(system, order, lines, success_url, cancel_url, customer_email=""):
    """Open a Stripe Checkout Session for ``order`` on ``system``'s Stripe account.

    ``lines`` are the order's own OrderLine snapshots rather than cart rows, so
    what Stripe charges is exactly what we recorded and showed - there is no
    second read of the catalog that could disagree with the order.

    Only the order id travels in ``metadata``: the webhook re-reads the order
    from our database rather than trusting amounts echoed back through Stripe.
    """
    api_key = _api_key(system)
    currency = order.currency.lower()

    try:
        return stripe.checkout.Session.create(
            api_key=api_key,
            mode="payment",
            line_items=[
                {
                    "quantity": line.quantity,
                    "price_data": {
                        "currency": currency,
                        "unit_amount": to_minor_units(line.unit_price, order.currency),
                        "product_data": {
                            "name": line.name if not line.variant_label else f"{line.name} ({line.variant_label})",
                        },
                    },
                }
                for line in lines
            ],
            # Stripe collects and validates the address, then hands it back on the
            # webhook - so there is no address form of ours to keep in step with it.
            shipping_address_collection={"allowed_countries": _allowed_countries(order.currency)},
            customer_email=customer_email or None,
            # The order id is the whole payload: everything else the webhook needs
            # is already in our DB, and metadata is round-tripped through the
            # client, so treating it as authoritative would mean trusting the
            # browser about money.
            metadata={"order_id": str(order.pk), "system_id": str(system.pk)},
            # Mirrored onto the PaymentIntent so the tenant's Stripe dashboard can
            # be searched by order id, not just by session.
            payment_intent_data={"metadata": {"order_id": str(order.pk)}},
            expires_at=_expires_at(),
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except StripeError as exc:
        # The upstream message can name the account or the key; log it, and let
        # the caller answer the browser generically.
        logger.error("Stripe checkout session failed for order %s: %s", order.pk, exc)
        raise StripeGatewayError(str(exc)) from exc


def _expires_at():
    return int(time.time()) + settings.STRIPE_CHECKOUT_SESSION_TTL


def _allowed_countries(currency: str):
    """Where Checkout will let the customer ship.

    Stripe requires an explicit allowlist, and there is no "anywhere" value. The
    catalog is regional (the currency choices are the Americas plus EU/UK), so
    this is scoped to the countries these sites actually sell to rather than
    enumerating all ~230 - a tenant selling further afield should have this
    widened rather than discovering it at checkout.
    """
    return [
        "US", "CA", "MX", "GB", "ES", "FR", "DE", "IT", "PT", "NL", "BE", "IE",
        "AR", "BR", "CL", "CO", "PE", "UY",
    ]


def verify_webhook(system, payload: bytes, signature: str):
    """Parse and authenticate a webhook delivered for ``system``.

    The signing secret is this System's own, which is why the endpoint is keyed
    by system id: with one shared URL we would have to try every tenant's secret
    against every event and could not tell a forgery from a mis-routed delivery.

    Raises ``StripeNotConfigured`` if the System has no secret, or ``ValueError``
    if the payload is unparseable or the signature does not verify.
    """
    if not system or not system.stripe_webhook_secret_encrypted:
        raise StripeNotConfigured("No webhook secret for this system.")

    return stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=system.stripe_webhook_secret,
    )


def retrieve_session(system, session_id: str):
    """Fetch a Checkout Session in full (the webhook payload may omit metadata)."""
    try:
        return stripe.checkout.Session.retrieve(session_id, api_key=_api_key(system))
    except StripeError as exc:
        logger.error("Stripe session retrieve failed for %s: %s", session_id, exc)
        raise StripeGatewayError(str(exc)) from exc
