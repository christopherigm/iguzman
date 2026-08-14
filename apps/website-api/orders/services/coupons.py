"""Validating, pricing and redeeming a discount coupon.

**Every path that can discount an order goes through this module** - the
signed-in cart checkout, the guest one, the POS till, and the "validate this
code" call the cart makes while the customer is still typing. That is the same
reason `_open_order` is shared by all of them: two copies of "is this coupon
still good?" would eventually disagree, and the first symptom would be a code
the cart said was valid being refused at the moment of payment.

Three things worth knowing before changing anything here:

* **A refusal is a code, not a sentence.** `validate_coupon` returns a
  `CouponError` carrying a stable machine-readable `code`; the frontend owns the
  wording in five languages. The `detail` string is a fallback for non-browser
  callers, never what the customer reads.
* **Validation is not a reservation.** A coupon that validates now can be
  exhausted by someone else a second later, which is why `redeem_coupon` re-checks
  under an atomic `UPDATE ... WHERE times_redeemed < max_redemptions` rather than
  trusting the check that already passed. Nothing here holds a redemption open
  between the two.
* **The discount is recomputed server-side at every step.** The browser sends a
  code and nothing else, exactly as it sends cart references and never prices.
"""

import logging
from decimal import ROUND_HALF_UP, Decimal

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import F
from django.db.models.functions import Upper
from django.utils import timezone

from ..models import Coupon
from .qr import render_qr_png, site_base_url

logger = logging.getLogger(__name__)


class CouponError(Exception):
    """A coupon that cannot be applied, and the stable reason why.

    `code` is what the frontend switches on to pick a translated message; every
    value here has a matching key in the website's `Cart` namespace.
    """

    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def coupon_landing_url(coupon) -> str:
    """The public page this coupon's QR code points at.

    Unprefixed by locale, exactly like `order_detail_url` and for the same
    reason: the storefront middleware redirects to the reader's own locale, and a
    coupon printed on a poster has no idea who will scan it.

    Built from the **code**, not the `public_id` - this URL is also the one a
    tenant pastes into a social caption, where "acme.com/coupon/SUMMER20" is the
    offer and a UUID is noise.
    """
    return f"{site_base_url(coupon.system)}/coupon/{coupon.code}"


def attach_coupon_qr(coupon, *, force: bool = False) -> bool:
    """Generate and store `coupon`'s QR code. Returns whether one was written.

    Unlike an order's QR - written once and then left alone forever, because it
    is printed on a receipt that must keep matching - a coupon's code is editable
    in the CMS, and the PNG encodes a URL built from it. So this is re-rendered
    with `force=True` whenever the code changes; the serializer decides when.

    Never raises. A coupon with no PNG is a working coupon that cannot be turned
    into a flyer yet, which is a nuisance - failing the save that created it,
    because object storage was briefly slow, is worse.
    """
    if coupon.qr_code and not force:
        return False

    try:
        png = render_qr_png(coupon_landing_url(coupon))
        # ⚠ Delete the old file first. Storage backends do not overwrite: a save
        # onto an existing name gets a random suffix
        # (`<public_id>_wTGsKbw.png`), so without this every edit of a coupon
        # leaves its previous PNG orphaned in the bucket - unreferenced, unread,
        # and never cleaned up, one per save for the life of the campaign.
        # `save=False` because the row is written a line later anyway.
        if coupon.qr_code:
            coupon.qr_code.delete(save=False)
        # `upload_to` renames the file after `public_id`, so the name passed here
        # only supplies the extension - see `coupon_qr_upload_path`.
        coupon.qr_code.save(f"{coupon.public_id}.png", ContentFile(png), save=True)
        return True
    except Exception:
        logger.exception("Failed to write QR code for coupon %s", coupon.pk)
        return False


def find_coupon(system, code):
    """The tenant's coupon for `code`, matched case-insensitively, or None.

    Case-insensitive because the customer is typing off a poster or a phone
    keyboard that auto-capitalises, and `SUMMER20`/`summer20` are obviously the
    same offer to everyone but a database. The model's unique constraint is on
    the upper-cased form, so this can never match two rows.
    """
    cleaned = (code or "").strip()
    if not cleaned or system is None:
        return None
    return (
        Coupon.objects.annotate(upper_code=Upper("code"))
        .filter(system=system, upper_code=cleaned.upper())
        .first()
    )


def validate_coupon(system, code, *, subtotal, currency):
    """The coupon for `code`, or raise `CouponError` explaining the refusal.

    `subtotal` and `currency` are the basket's, already priced server-side by
    `resolve_guest_cart` or read off the customer's own cart rows - never sent by
    the browser.

    The order of the checks is deliberate: the ones about the coupon itself come
    before the ones about this particular basket, so a customer with an expired
    code is told it expired rather than that their cart is too small.
    """
    coupon = find_coupon(system, code)
    if coupon is None:
        raise CouponError("COUPON_NOT_FOUND", "That coupon code is not valid.")

    if not coupon.enabled:
        raise CouponError("COUPON_INACTIVE", "That coupon is no longer active.")

    now = timezone.now()
    if coupon.starts_at and now < coupon.starts_at:
        raise CouponError("COUPON_NOT_STARTED", "That coupon is not active yet.")
    if coupon.expires_at and now > coupon.expires_at:
        raise CouponError("COUPON_EXPIRED", "That coupon has expired.")
    if coupon.is_exhausted:
        raise CouponError("COUPON_EXHAUSTED", "That coupon has been fully redeemed.")

    # A fixed-amount coupon is denominated in one currency, so applying it to a
    # basket in another would mean inventing an exchange rate - the same thing
    # checkout refuses to do for a mixed-currency cart. A percentage carries no
    # currency and applies to any basket.
    if coupon.kind == Coupon.KIND_FIXED and coupon.currency != currency:
        raise CouponError(
            "COUPON_WRONG_CURRENCY",
            f"That coupon can only be used on orders in {coupon.currency}.",
        )

    if coupon.min_order_amount and subtotal < coupon.min_order_amount:
        raise CouponError(
            "COUPON_MIN_ORDER",
            f"That coupon needs a subtotal of at least {coupon.min_order_amount} {coupon.currency}.",
        )

    return coupon


def discount_for(coupon, subtotal):
    """What `coupon` takes off `subtotal`, in the basket's currency.

    **Clamped to the subtotal**, so a 500-off coupon on a 300 basket discounts
    300 and not a cent more: a negative total is not a refund, it is a Stripe
    session that cannot be created and an order nobody can reconcile.

    Rounded half-up to two places, matching how every other money value in this
    app is stored. A percentage is the only thing here that can produce more
    decimals than the column holds.
    """
    if coupon.kind == Coupon.KIND_PERCENT:
        raw = subtotal * (coupon.value / Decimal("100"))
    else:
        raw = coupon.value
    discount = raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return min(max(discount, Decimal("0.00")), subtotal)


def redeem_coupon(coupon) -> bool:
    """Take one redemption off `coupon`. Returns whether one was actually taken.

    ⚠ **This is the only place `times_redeemed` moves, and it must stay a single
    conditional UPDATE.** Two customers checking out at the same instant both pass
    `validate_coupon`; a read-modify-write here would let both take the 50th of 50
    redemptions and store 50 either way. The `filter(...)` on the queryset is what
    makes the check and the increment one statement the database resolves
    serially - `.update()` returning 0 means someone else got there first.

    An unlimited coupon (`max_redemptions == 0`) still counts up: the number is
    what the CMS reports as "used 128 times", which a tenant wants whether or not
    there was ever a ceiling on it.
    """
    queryset = Coupon.objects.filter(pk=coupon.pk, enabled=True)
    if coupon.max_redemptions:
        queryset = queryset.filter(times_redeemed__lt=coupon.max_redemptions)

    updated = queryset.update(times_redeemed=F("times_redeemed") + 1)
    if not updated:
        logger.info(
            "Coupon %s could not be redeemed - exhausted or disabled since validation",
            coupon.pk,
        )
    return bool(updated)


def release_coupon(coupon) -> bool:
    """Give a redemption back, for an order that never completed.

    Used when an online checkout's Stripe session expires or its payment fails:
    the redemption was taken when the order was opened, and leaving it taken
    would let an abandoned cart burn a redemption the tenant meant to sell with.

    Floored at zero with the same conditional-UPDATE shape `redeem_coupon` uses,
    so a double-fire (an expired webhook arriving after a failed one) cannot
    drive the count negative - `PositiveIntegerField` would raise on the write in
    Postgres, failing a webhook that has nothing else wrong with it.
    """
    updated = (
        Coupon.objects.filter(pk=coupon.pk, times_redeemed__gt=0)
        .update(times_redeemed=F("times_redeemed") - 1)
    )
    return bool(updated)


@transaction.atomic
def apply_coupon_to_order(order, coupon, *, subtotal):
    """Record `coupon`'s discount on `order` and take the redemption.

    Returns the discount applied, or raises `CouponError("COUPON_EXHAUSTED")` when
    the redemption could not be taken - the coupon ran out between the caller's
    `validate_coupon` and here, which is the race that check cannot close.

    ⚠ **Raising is the deliberate choice, and the alternative is worse than it
    looks.** Writing the order at full price instead would charge a customer who
    was quoted 160 the full 200 - on the storefront that is a surprise on the
    Stripe page, and at a POS counter it is an associate reading one number off
    the till while the receipt prints another. A refusal the caller can explain
    ("that coupon just ran out") lets them check out again a second later; a
    silent full-price charge is a dispute. Callers discard the half-built order
    and return the code.
    """
    if not redeem_coupon(coupon):
        raise CouponError("COUPON_EXHAUSTED", "That coupon has been fully redeemed.")

    discount = discount_for(coupon, subtotal)
    order.coupon = coupon
    order.coupon_code = coupon.code
    order.discount_amount = discount
    order.total = subtotal - discount
    order.save(update_fields=["coupon", "coupon_code", "discount_amount", "total", "updated_at"])
    return discount
