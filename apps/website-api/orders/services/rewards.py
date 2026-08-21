"""Earning, holding and spending loyalty points.

**Every path that can move a customer's balance goes through this module** - the
signed-in checkout, the Stripe webhook, offline placement, a CMS cancellation
and the claim that runs when a guest finally registers. That is the same reason
`orders.services.coupons` exists as one module: two copies of "how many points is
this worth?" would eventually disagree, and the first symptom would be a cart
promising an award the confirmation email did not pay out.

Five things worth knowing before changing anything here:

* **The ledger is the balance.** `PointsTransaction` rows are append-only and
  signed; a balance is one `SUM`. Nothing anywhere increments a counter, because
  a tier is defined as points *earned inside a trailing window* - a question only
  timestamped rows can answer - and because a redemption has to be reversible
  exactly once, which a counter can only manage by trusting its caller.
* **Spending is taken optimistically at checkout, exactly like a coupon
  redemption and a booking's slot**, so two tabs cannot spend the same balance
  twice; an order that dies hands it back. Earning is the opposite: it is paid
  out only when the order becomes real, because an abandoned Stripe page must
  never have paid.
* **Spending is serialised by a row lock on the customer's own profile.** A
  balance is a `SUM` over rows, so "check then insert" is a read-modify-write
  with a window in it, and the window is exactly wide enough for two tabs to
  spend the same 1200 points. `UserProfile` is the lock because it is the one row
  per (user) that always exists.
* **Tiers are judged on points earned, never on the balance.** Spending must not
  demote anyone - a program that takes a customer's status away for using the
  reward it gave them is one they stop using.
* **Nothing here is ever trusted from a browser.** The cart sends "pay this line
  with points" and nothing else; every award rate, points price, multiplier and
  balance is re-read here.
"""

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from users.models import UserProfile

from ..models import Order, PointsTransaction, RewardTier

logger = logging.getLogger(__name__)


class RewardsError(Exception):
    """Points that cannot be spent, and the stable reason why.

    Shaped exactly like `coupons.CouponError`: `code` is what the frontend
    switches on to pick a translated message, and `detail` is a fallback for
    non-browser callers - never what the customer reads.
    """

    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def rewards_enabled(system) -> bool:
    """Whether this tenant runs a rewards program at all.

    The one gate. Every surface asks this rather than "does this item have points
    set", which is what lets a tenant switch the program off for a season without
    losing the numbers they entered - and what stops an item somebody forgot to
    price in points from being redeemable for nothing.
    """
    return bool(system is not None and system.rewards_enabled)


# ─────────────────────────────── What a purchase is worth ────────────────────


def points_award_for(target) -> int:
    """How many points buying one `target` earns, before any tier multiplier.

    The item's own `points_award` if it states one, else its category's, else
    zero - the inherit/override rule `MenuItem.effective_sizes` and
    `CatalogRecommendation` both follow.

    ⚠ **Zero and blank are different answers, and the difference is the whole
    point of the rule.** A blank item defers to its category; an item set to zero
    says "I earn nothing" and keeps saying it however generous the category is,
    which is how a loss-leader is excluded from a family that otherwise earns.
    """
    if target is None:
        return 0
    own = getattr(target, "points_award", None)
    if own is not None:
        return int(own)
    category = getattr(target, "category", None)
    inherited = getattr(category, "points_award", None) if category is not None else None
    return int(inherited or 0)


def points_price_for(target) -> int:
    """How many points buying one `target` costs, or 0 when it cannot be.

    Deliberately **not** inherited from a category, unlike the award: an award is
    a rate a tenant sets once for a family, while a points price has to be
    weighed against that one item's own money price. Zero is "not redeemable",
    which is what every row written before this feature landed is.
    """
    if target is None:
        return 0
    return int(getattr(target, "points_price", None) or 0)


def can_redeem(system, target) -> bool:
    """Whether `target` may be bought with points on this tenant right now."""
    return rewards_enabled(system) and points_price_for(target) > 0


# ───────────────────────────────── Reading a balance ─────────────────────────


def balance_for(user, system) -> int:
    """The customer's spendable points on this tenant.

    A `SUM` over the ledger, and it is per **System**: the catalog is per-tenant,
    so points earned on one customer's site can no more be spent on another's
    than a coupon can cross between them.

    ⚠ Unclaimed guest rows (`user` NULL) are invisible here by construction -
    they belong to an address, not yet to an account. That is what makes
    `claim_points_for_email` the single moment a guest's earnings become real.
    """
    if user is None or not getattr(user, "is_authenticated", False) or system is None:
        return 0
    total = PointsTransaction.objects.filter(user=user, system=system).aggregate(
        total=Sum("points"),
    )["total"]
    # Floored at zero so a balance can never read negative to a customer. A
    # negative sum would mean a bug elsewhere (a double release, a bad manual
    # adjustment) and showing it as "-40 points" helps nobody; the ledger still
    # holds the truth for whoever has to unpick it.
    return max(0, int(total or 0))


def earned_since(user, system, since) -> int:
    """Points *earned* on this tenant since `since` - what a tier is judged on.

    Earnings only: `KIND_EARN` rows, minus any `KIND_REVOKE` that took one back
    (a canceled order must not leave a customer holding the status it bought).
    Spending is deliberately absent - see the module docstring.
    """
    if user is None or not getattr(user, "is_authenticated", False) or system is None:
        return 0
    total = PointsTransaction.objects.filter(
        user=user,
        system=system,
        kind__in=(PointsTransaction.KIND_EARN, PointsTransaction.KIND_REVOKE),
        created_at__gte=since,
    ).aggregate(total=Sum("points"))["total"]
    return max(0, int(total or 0))


def tier_for(user, system):
    """The highest `RewardTier` this customer currently qualifies for, or None.

    Walked from the top down, because a customer sits on the best rung whose
    threshold they meet - and each rung is checked against **its own**
    `period_months`, since a tenant may qualify an entry tier over a year and the
    top one over six months.

    Returns None when the tenant has no tiers, when the program is off, or when
    the customer meets nobody's threshold (which only happens if every tier has a
    non-zero threshold - a tenant who wants everyone to start somewhere gives the
    lowest rung a threshold of 0).
    """
    if not rewards_enabled(system) or user is None:
        return None
    if not getattr(user, "is_authenticated", False):
        return None

    tiers = list(RewardTier.objects.filter(system=system, enabled=True))
    if not tiers:
        return None

    now = timezone.now()
    # One query per distinct window rather than one per tier: most tenants use a
    # single period across every rung, so this is normally one query however many
    # tiers there are.
    windows = {}
    for tier in tiers:
        months = tier.period_months or 12
        if months not in windows:
            # Months as 30-day blocks. Deliberately approximate: a qualifying
            # window is a marketing promise ("earn 500 points in six months"),
            # not an accounting period, and a customer who misses their tier by
            # the two days February is short would be right to be annoyed.
            windows[months] = earned_since(user, system, now - timedelta(days=30 * months))

    for tier in sorted(tiers, key=lambda t: (t.threshold, t.id), reverse=True):
        if windows[tier.period_months or 12] >= tier.threshold:
            return tier
    return None


def earn_multiplier_for(user, system) -> int:
    """The whole-percent multiplier this customer's tier applies to an award.

    100 (no change) for a customer on no tier, which is also what every customer
    gets on a tenant that has not defined any.
    """
    tier = tier_for(user, system)
    return int(tier.earn_multiplier) if tier is not None else 100


def next_tier_for(user, system):
    """The rung above the customer's current one, or None if they are at the top.

    Returned so the account page can say "320 more points for Gold" without
    re-walking the ladder itself and reaching a different answer than
    `tier_for` did.
    """
    if not rewards_enabled(system) or user is None:
        return None
    current = tier_for(user, system)
    floor = current.threshold if current is not None else -1
    return (
        RewardTier.objects.filter(system=system, enabled=True, threshold__gt=floor)
        .order_by("threshold", "id")
        .first()
    )


# ─────────────────────────────────── Spending ────────────────────────────────


def order_points_cost(order) -> int:
    """What `order`'s points-paid lines cost in points, off the written lines."""
    return sum(
        line.points_price * line.quantity
        for line in order.lines.all()
        if line.paid_with_points
    )


@transaction.atomic
def spend_points(order, user, system, points, *, note="") -> None:
    """Take `points` off the customer's balance for `order`, or raise.

    ⚠ **The `select_for_update` is what makes this safe, and it must stay.** A
    balance is a `SUM` over rows, so checking it and then inserting a spend is a
    read-modify-write - and the gap between the two is exactly wide enough for a
    customer with two tabs open to spend the same 1200 points on two orders. The
    lock is taken on the customer's own `UserProfile`, the one row that always
    exists per account, so two checkouts by the same customer serialise while two
    different customers never wait on each other.

    Raises `RewardsError("INSUFFICIENT_POINTS")` when the balance does not cover
    it. Callers discard the half-built order and say so, exactly as they do for
    an exhausted coupon: a customer quoted one total and charged another is a
    dispute, and silently re-pricing the line in money would charge them for
    something they asked to redeem.
    """
    if points <= 0:
        return
    if user is None or not getattr(user, "is_authenticated", False):
        # Guests cannot spend: there is no account to hold a balance. Reached
        # only if a caller skipped its own check, so it is a refusal rather than
        # a silent no-op.
        raise RewardsError("POINTS_REQUIRE_ACCOUNT", "Points can only be used with an account.")

    UserProfile.objects.select_for_update().filter(user=user).first()
    if balance_for(user, system) < points:
        raise RewardsError("INSUFFICIENT_POINTS", "You do not have enough points for that.")

    PointsTransaction.objects.create(
        system=system,
        user=user,
        email=(user.email or "").strip().lower(),
        order=order,
        kind=PointsTransaction.KIND_SPEND,
        points=-points,
        note=note or f"Order #{str(order.public_id)[:8].upper()}",
    )
    order.points_spent = points
    order.save(update_fields=["points_spent", "updated_at"])


def release_points(order) -> bool:
    """Give back the points a dead order took. Returns whether anything moved.

    The mirror of `coupons.release_coupon`, called from the same places for the
    same reason: the spend was taken optimistically when checkout opened, and an
    expired Stripe session, a failed payment or a CMS cancellation all leave a
    customer short of points they never spent.

    ⚠ **Idempotent by way of `order.points_spent`, which is zeroed here.** A
    double-delivered webhook (an expired event arriving after a failed one) would
    otherwise refund twice and hand the customer free points - the same trap
    `_release_order_coupon` closes with its `coupon_id` check.
    """
    if not order.points_spent:
        return False
    PointsTransaction.objects.create(
        system=order.system,
        user=order.user,
        email=(order.email or "").strip().lower(),
        order=order,
        kind=PointsTransaction.KIND_RELEASE,
        points=order.points_spent,
        note=f"Returned from order #{str(order.public_id)[:8].upper()}",
    )
    order.points_spent = 0
    order.save(update_fields=["points_spent", "updated_at"])
    return True


# ─────────────────────────────────── Earning ─────────────────────────────────


def award_points(order) -> int:
    """Pay out what `order` earned, and return it. Idempotent.

    Called when the order becomes **real** - the webhook for an online order,
    placement for an offline one - never at checkout, so an abandoned Stripe page
    pays nothing.

    Three rules decide the figure, and all three are here rather than at the call
    sites:

    * **Points-paid lines earn nothing.** Earning on a line bought with points is
      a loop that mints points out of itself.
    * **The tier multiplier is applied to the whole order's award, once**, rather
      than per line - rounding each line separately would let the total drift
      from the number the cart quoted.
    * **A guest earns too**, into a row with no `user` and their `email` set.
      It is unspendable until someone verifies an account on that address, which
      is what the confirmation email invites them to do.

    Idempotent through `order.points_earned`: Stripe re-delivers on any non-2xx,
    and a second delivery must not pay twice.
    """
    if order.points_earned:
        return 0
    if not rewards_enabled(order.system):
        return 0

    base = sum(
        line.points_award * line.quantity
        for line in order.lines.all()
        if not line.paid_with_points
    )
    if base <= 0:
        return 0

    multiplier = earn_multiplier_for(order.user, order.system)
    earned = int(base * multiplier / 100)
    if earned <= 0:
        return 0

    email = (order.email or "").strip().lower()
    if order.user_id is None and not email:
        # Nothing to attribute it to and no address to hold it against - an
        # online guest order whose webhook has not yet copied an email, which
        # cannot happen today but would silently create an unownable row if it
        # did. Skipped rather than raised: it must never cost the webhook a 2xx.
        logger.info("Order %s earned %s points with no owner; skipped", order.pk, earned)
        return 0

    PointsTransaction.objects.create(
        system=order.system,
        user=order.user,
        email=email,
        order=order,
        kind=PointsTransaction.KIND_EARN,
        points=earned,
        note=f"Order #{str(order.public_id)[:8].upper()}",
    )
    order.points_earned = earned
    order.save(update_fields=["points_earned", "updated_at"])
    return earned


def revoke_points(order) -> bool:
    """Take back what a completed order earned, when it is later canceled.

    Separate from `release_points` - which returns points the customer *spent* -
    because these move in opposite directions and an order being canceled can owe
    both at once. Idempotent through `order.points_earned` for `award_points`'
    reason.
    """
    if not order.points_earned:
        return False
    PointsTransaction.objects.create(
        system=order.system,
        user=order.user,
        email=(order.email or "").strip().lower(),
        order=order,
        kind=PointsTransaction.KIND_REVOKE,
        points=-order.points_earned,
        note=f"Canceled order #{str(order.public_id)[:8].upper()}",
    )
    order.points_earned = 0
    order.save(update_fields=["points_earned", "updated_at"])
    return True


# ──────────────────────────────── Claiming a guest's ─────────────────────────


def claim_points_for_email(user, system, email) -> int:
    """Hand a newly-verified account every point earned as a guest on its address.

    Runs beside `orders.claims.claim_guest_orders`, at the same two moments and
    on the same handle - the address is the only thing linking a guest's purchase
    to the person who made it.

    ⚠ **Scoped to `system` as well as the address.** A shared address on two
    tenants' sites is two customers as far as the catalog is concerned, and
    sweeping both would move one tenant's liability onto the other's books.

    Returns how many points were claimed, so the caller can log it.
    """
    cleaned = (email or "").strip().lower()
    if not cleaned or user is None or system is None:
        return 0
    rows = PointsTransaction.objects.filter(
        system=system, user__isnull=True, email=cleaned,
    )
    claimed = rows.aggregate(total=Sum("points"))["total"] or 0
    updated = rows.update(user=user)
    if updated:
        logger.info("Claimed %s points (%s rows) for %s", claimed, updated, user.pk)
    return int(claimed)


def cart_points_summary(items, user, system):
    """What the cart page needs to draw its points UI, computed in one place.

    Returns a dict of the balance, what the points-paid lines cost, what money
    they displace, and whether the selection is affordable - so the cart payload,
    the checkout preflight and the confirmation copy cannot each derive a
    different answer from the same basket.

    ⚠ **`affordable` is advisory.** The balance moves while the page is open, so
    checkout re-checks it under a lock; this only decides what the customer is
    shown.
    """
    balance = balance_for(user, system)
    if not rewards_enabled(system):
        return {
            "enabled": False,
            "balance": 0,
            "points_used": 0,
            "points_value": "0.00",
            "affordable": True,
        }

    points_used = 0
    value = 0
    for item in items:
        if item.pay_with_points and points_price_for(item.target) > 0:
            points_used += points_price_for(item.target) * item.quantity
            value += item.line_total

    return {
        "enabled": True,
        "balance": balance,
        "points_used": points_used,
        # The money those lines would otherwise have cost - the "equivalent in
        # money" the summary prints. It is the sum of the displaced line totals
        # and never a conversion rate: points are priced per item, so there is no
        # single rate to convert at, and inventing one would put a number on the
        # summary that no operator ever typed.
        "points_value": f"{value:.2f}",
        "affordable": points_used <= balance,
    }
