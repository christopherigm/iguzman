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


def create_discount_coupon(system, order):
    """A one-off Stripe coupon for the discount already recorded on ``order``.

    Returns a coupon id to hand to ``create_checkout_session(discount_coupon=...)``,
    or None when the order carries no discount.

    **Created as a fixed `amount_off`, never a `percent_off`**, even when our own
    coupon is a percentage. `Order.discount_amount` is the number that was
    computed, shown to the customer and stored, and asking Stripe to re-derive a
    percentage of its own line-item subtotal invites the two to disagree by a cent
    on rounding - at which point the charge no longer matches the order and
    nothing reconciles.

    **One coupon per session, `duration: once`, not reused.** A Stripe coupon is
    an object on the tenant's account, and a shared one would be a second place
    the campaign's rules live - redeemable independently of ours, with its own
    `max_redemptions` that our `times_redeemed` knows nothing about. This one
    exists to express a single amount on a single session; ours stays the
    authority on who may have it.

    `name` is what the customer reads on Stripe's page, so it carries the code
    they typed rather than an internal id.
    """
    if not order.discount_amount or order.discount_amount <= 0:
        return None

    try:
        coupon = stripe.Coupon.create(
            api_key=_api_key(system),
            amount_off=to_minor_units(order.discount_amount, order.currency),
            currency=order.currency.lower(),
            duration="once",
            name=order.coupon_code or "Discount",
            # Stripe keeps a created coupon on the account forever otherwise, and
            # a tenant's dashboard would fill with one row per discounted sale.
            # An hour outlives any checkout session (`STRIPE_CHECKOUT_SESSION_TTL`)
            # while keeping the list readable.
            redeem_by=int(time.time()) + 3600,
            metadata={"order_id": str(order.pk), "coupon_code": order.coupon_code},
        )
        return coupon.id
    except StripeError as exc:
        # Logged and swallowed: the caller is mid-checkout, and the alternative is
        # refusing a sale the customer is trying to make over the mechanics of a
        # discount. The caller drops the discount and re-prices the order at full
        # value rather than charging less than it collects - see `_apply_discount`.
        logger.error("Stripe coupon creation failed for order %s: %s", order.pk, exc)
        return None


def create_checkout_session(
    system,
    order,
    lines,
    success_url,
    cancel_url,
    customer_email="",
    charge_amount=None,
    charge_label="",
    collect_shipping_address=True,
    discount_coupon=None,
):
    """Open a Stripe Checkout Session for ``order`` on ``system``'s Stripe account.

    ``lines`` are the order's own OrderLine snapshots rather than cart rows, so
    what Stripe charges is exactly what we recorded and showed - there is no
    second read of the catalog that could disagree with the order.

    Only the order id travels in ``metadata``: the webhook re-reads the order
    from our database rather than trusting amounts echoed back through Stripe.

    ``charge_amount`` collapses the whole basket into a **single** line for that
    amount, which is what a booking deposit needs: the order still records the
    service at its full price (that is the agreement), while Stripe is asked for
    the percentage due now. It is not a discount and must never be used as one -
    the remainder is recorded on the booking as `amount_due_later` and collected
    by the tenant, so an order whose Stripe session was created this way is not
    "paid in full" when the webhook lands.

    ``collect_shipping_address`` is off for a booking: an appointment has a
    branch or the customer's own address on the booking record, and Stripe's
    shipping form would ask a customer walking into a salon where to post it.

    ``discount_coupon`` is an id from `create_discount_coupon`, applied at the
    **session** level so Stripe shows the customer the same three lines the cart
    did - subtotal, the named discount, total - and the line items stay at the
    prices the order recorded. Deliberately not folded into the line amounts:
    prorating a discount across lines invents per-line rounding that no longer
    sums to `Order.discount_amount`.

    ⚠ **It is ignored alongside ``charge_amount``.** That path already collapses
    the basket into a single amount for a booking *deposit*, and a discount on top
    of a partial charge would take the discount off the deposit rather than off
    the order - discounting the same money twice once the remainder is collected.
    Bookings do not take coupons today, and this is what makes that explicit
    rather than silently wrong.
    """
    api_key = _api_key(system)
    currency = order.currency.lower()

    if charge_amount is not None:
        line_items = [
            {
                "quantity": 1,
                "price_data": {
                    "currency": currency,
                    "unit_amount": to_minor_units(charge_amount, order.currency),
                    "product_data": {
                        "name": charge_label or (lines[0].name if lines else "Payment"),
                    },
                },
            }
        ]
    else:
        line_items = [
            {
                "quantity": line.quantity,
                "price_data": {
                    "currency": currency,
                    "unit_amount": to_minor_units(line.unit_price, order.currency),
                    "product_data": {
                        "name": line.name,
                    },
                },
            }
            for line in lines
        ]

    try:
        return stripe.checkout.Session.create(
            api_key=api_key,
            mode="payment",
            line_items=line_items,
            **(
                {"discounts": [{"coupon": discount_coupon}]}
                if discount_coupon and charge_amount is None
                else {}
            ),
            # Stripe collects and validates the address, then hands it back on the
            # webhook - so there is no address form of ours to keep in step with it.
            **(
                {"shipping_address_collection": {"allowed_countries": _allowed_countries(order.currency)}}
                if collect_shipping_address
                else {}
            ),
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


def expire_session(system, session_id: str) -> bool:
    """Close a Checkout Session so it can no longer be paid. True if it worked.

    Used when an order is about to be handed a *replacement* session: an order
    must never have two payable sessions at once, or a customer with the old tab
    still open can pay one while paying the other, and our webhook - idempotent
    on `status == paid` - would quietly acknowledge the second charge instead of
    refusing it. Expiring the old one first is what makes "pay again" safe.

    Failure is returned rather than raised because every caller is already
    committed to opening the new session; the alternative is refusing a payment
    the customer is asking to make because of a call that only tidies up. Stripe
    also rejects expiring a session that is already expired or complete, which is
    not a problem worth an exception either.
    """
    try:
        stripe.checkout.Session.expire(session_id, api_key=_api_key(system))
        return True
    except (StripeError, StripeNotConfigured) as exc:
        logger.warning("Could not expire Stripe session %s: %s", session_id, exc)
        return False
