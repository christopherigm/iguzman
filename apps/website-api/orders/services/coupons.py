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
* **A scoped coupon is priced off part of the basket, and every caller must pass
  the lines.** `eligible_subtotal` is what turns `Coupon.scope_kind` into money;
  `validate_coupon` and `discount_for` both take a `lines` argument and both
  **raise** rather than guess when a scoped coupon is handed none. Falling back
  to the whole subtotal there would discount a 40-item basket because it
  contained one targeted dish, which is the one failure mode this whole feature
  exists to prevent.
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


def line_matches_scope(coupon, kind, target, category_id=None):
    """Whether one basket line falls inside `coupon`'s scope.

    `kind` is the line's family (`"product"` / `"service"` / `"menu_item"`),
    `target` the buyable it points at, and `category_id` its category when the
    caller already knows it - an `OrderLine` snapshot may point at a deleted
    buyable, so the caller is allowed to say "I cannot resolve a category" by
    leaving it None rather than this reaching through a null FK.

    An order-wide coupon matches everything, which is what lets every caller run
    the same loop instead of branching on `is_scoped` first.
    """
    if not coupon.is_scoped:
        return True
    if kind != coupon.scope_family:
        return False

    if coupon.scopes_a_category:
        if category_id is None:
            category_id = getattr(target, "category_id", None)
        return category_id is not None and category_id == coupon.scope_id

    return target is not None and target.pk == coupon.scope_id


def eligible_subtotal(coupon, lines):
    """How much of `lines` this coupon is allowed to discount.

    `lines` is any iterable of objects carrying `kind`, `target` and
    `line_total` - which both `CartItem` and `OrderLine` already do, so a cart, a
    guest's resolved references and a written order all price identically
    through one function. That is the point: three copies of "which lines does
    this coupon touch?" would eventually disagree, and the symptom would be a
    cart quoting one discount and the receipt printing another.

    Returns the whole subtotal for an order-wide coupon and `0.00` when a scoped
    one matches nothing - which is a refusal upstream, never a zero discount
    silently applied.

    ⚠ **Lines paid with points are skipped entirely**, whatever the scope. They
    are not money, so there is nothing there to discount - and the `subtotal`
    every caller passes alongside excludes them for the same reason. A scoped
    coupon whose only matching line was redeemed is therefore refused
    (`COUPON_NOT_APPLICABLE`), which is the honest answer: the customer is not
    paying for the thing the coupon is for.
    """
    total = Decimal("0.00")
    for line in lines:
        # ⚠ A line the customer redeemed with points is not money and must not be
        # discounted. Its `line_total` still carries the money price - that is
        # what the line was worth and what the receipt reads back (see
        # `OrderLine.paid_with_points`) - so a loop that trusted `line_total`
        # alone would take 20% off a pizza nobody is paying for, and hand the
        # discount to the rest of the basket.
        if getattr(line, "paid_with_points", False):
            continue
        if line_matches_scope(coupon, line.kind, line.target):
            total += line.line_total
    return total


def _scope_base(coupon, subtotal, lines):
    """The amount `coupon`'s discount is computed off, or raise if it cannot be.

    ⚠ **The raise is deliberate.** A scoped coupon handed no lines has no way to
    know how much of the basket it may touch, and the tempting fallback - use the
    whole subtotal - is exactly the overcharge-in-reverse this feature exists to
    stop. Every caller here has the lines available; a new one that does not is a
    bug to fix at the call site, not a case to paper over.
    """
    if not coupon.is_scoped:
        return subtotal
    if lines is None:
        raise ValueError(
            f"Coupon {coupon.pk} is scoped to {coupon.scope_kind}, so its discount "
            "cannot be computed without the basket's lines."
        )
    return eligible_subtotal(coupon, lines)


def validate_coupon(system, code, *, subtotal, currency, lines=None):
    """The coupon for `code`, or raise `CouponError` explaining the refusal.

    `subtotal` and `currency` are the basket's, already priced server-side by
    `resolve_guest_cart` or read off the customer's own cart rows - never sent by
    the browser. `lines` is that same basket's lines, and it is **required for a
    scoped coupon**: without them there is no way to know whether the basket
    contains the thing the coupon is for.

    The order of the checks is deliberate: the ones about the coupon itself come
    before the ones about this particular basket, so a customer with an expired
    code is told it expired rather than that their cart is too small. The scope
    check is last of all, because "your cart has none of these" is only worth
    saying about a coupon that is otherwise good.
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

    # ⚠ Judged against the **whole** basket, not the eligible part of it, even
    # for a scoped coupon. `min_order_amount` is a floor on the order a tenant is
    # willing to discount at all ("spend 500 and the pizzas are 20% off"), which
    # is how the CMS labels it and how an operator reads it. Measuring it against
    # the eligible lines instead would silently turn every scoped coupon's
    # minimum into a second, stricter rule about the target.
    if coupon.min_order_amount and subtotal < coupon.min_order_amount:
        raise CouponError(
            "COUPON_MIN_ORDER",
            f"That coupon needs a subtotal of at least {coupon.min_order_amount} {coupon.currency}.",
        )

    # Last, and only for a scoped coupon: does this basket contain any of what
    # the coupon is actually for? A zero eligible subtotal would otherwise be a
    # silent zero discount - the customer applies a code, the cart says nothing
    # changed, and there is nothing on screen to say why.
    if coupon.is_scoped and _scope_base(coupon, subtotal, lines) <= 0:
        raise CouponError(
            "COUPON_NOT_APPLICABLE",
            "That coupon does not apply to anything in your cart.",
        )

    return coupon


def discount_for(coupon, subtotal, lines=None):
    """What `coupon` takes off `subtotal`, in the basket's currency.

    **Priced off the part of the basket the coupon is allowed to touch.** For an
    order-wide coupon that is the whole `subtotal`; for a scoped one it is the
    matching lines only - so "20% off pizzas" on a basket of one pizza and a
    jacket discounts a fifth of the pizza, not a fifth of both. `lines` is
    required whenever the coupon is scoped; see `_scope_base`.

    **Clamped to the eligible base**, so a 500-off coupon on 300 of eligible
    goods discounts 300 and not a cent more: a negative total is not a refund, it
    is a Stripe session that cannot be created and an order nobody can reconcile.
    ⚠ Clamping to the *eligible* base rather than the whole subtotal is what
    stops a fixed-amount coupon aimed at one 80-peso dish taking 500 off a large
    basket that happens to contain it.

    Rounded half-up to two places, matching how every other money value in this
    app is stored. A percentage is the only thing here that can produce more
    decimals than the column holds.
    """
    base = _scope_base(coupon, subtotal, lines)
    if coupon.kind == Coupon.KIND_PERCENT:
        raw = base * (coupon.value / Decimal("100"))
    else:
        raw = coupon.value
    discount = raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return min(max(discount, Decimal("0.00")), base)


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
def apply_coupon_to_order(order, coupon, *, subtotal, lines=None):
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

    # A scoped coupon is priced off the order's own written lines - the same
    # objects `_open_order` just created, so what is charged is computed from
    # what is stored rather than from anything that travelled with the request.
    # Defaulted rather than required so an order-wide caller need not pass them.
    if lines is None and coupon.is_scoped:
        lines = list(order.lines.all())
    discount = discount_for(coupon, subtotal, lines)
    order.coupon = coupon
    order.coupon_code = coupon.code
    order.discount_amount = discount
    order.total = subtotal - discount
    order.save(update_fields=["coupon", "coupon_code", "discount_amount", "total", "updated_at"])
    return discount
