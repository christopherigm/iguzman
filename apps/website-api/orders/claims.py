"""Turning a guest's orders into an account's history.

Its own module rather than a function in `views.py` because the callers are in
`users` (email verification and login), and reaching into another app's view
layer to run a query would drag the whole checkout/Stripe import graph along
with it.
"""

from django.contrib.auth.models import User

from .cache import invalidate_orders
from .models import Order
from .services.rewards import claim_points_for_email


def claim_guest_orders(user, system):
    """Attach this tenant's unowned orders on `user`'s email to their account.

    Called when an account proves it holds an address (email verification) and
    again at login, so someone who checked out as a guest and registered
    afterwards finds that purchase in their history. Returns how many were
    claimed.

    Only orders Stripe has told us the email for are claimable: `email` is blank
    on a guest order until the webhook copies across what the customer actually
    typed on Stripe's own page. An abandoned, never-paid guest order therefore
    has no address to match and can never be swept into an account by someone
    registering on a guessed one. `iexact` because mail addresses are not
    case-sensitive in practice and Stripe echoes back whatever was typed.

    Scoped to `system` like every other order query: an address that exists as a
    customer of two tenants must not pull one tenant's purchases into the other's
    account.
    """
    if not user.email:
        return 0

    claimed = Order.objects.filter(
        user__isnull=True, system=system, email__iexact=user.email,
    ).update(user=user)

    # The points those orders earned are held against the same address, waiting
    # for exactly this moment - see `PointsTransaction`. Run unconditionally
    # rather than inside the `if` above: an order claimed on an earlier login
    # leaves nothing for `claimed` to count, while a ledger row written since (a
    # tenant's manual goodwill adjustment on a guest's address) still has to
    # find its way home.
    claim_points_for_email(user, system, user.email)

    if claimed:
        # The history list is cached per user+system, and it was cached before
        # these orders belonged to anyone.
        invalidate_orders(user.id, system.id if system else 0)

    return claimed


def account_for_email(system, email):
    """This tenant's account holding `email`, or None.

    `is_active` is this codebase's "the address was verified" flag - a signup
    creates an inactive user and `VerifyEmailView` is what flips it - so an
    unverified account is deliberately not matched. Someone who typed a stranger's
    address at signup has proved nothing about it, and linking a real purchase to
    that account would hand them the buyer's name, phone and delivery address.

    Registration derives the username from the tenant and the address
    (`build_username`) and refuses a duplicate, so at most one account per System
    can hold one address and there is nothing here to disambiguate. `iexact`
    because mail addresses are not case-sensitive in practice and neither Stripe
    nor a checkout form normalises what was typed.
    """
    cleaned = (email or "").strip()
    if not cleaned or system is None:
        return None
    return User.objects.filter(
        profile__system=system, email__iexact=cleaned, is_active=True,
    ).order_by("id").first()


def link_order_to_account(order) -> bool:
    """Give a guest order to the account that already holds its email address.

    The immediate half of `claim_guest_orders`. That one runs when someone proves
    they hold an address (verification, login) and sweeps up whatever was bought
    as a guest beforehand; this runs at the moment of purchase, for the customer
    who *already* has an account here and simply did not sign in before checking
    out. The rule matching them is the same in both directions - the address -
    which is what keeps the two from ever disagreeing about whose order it is.

    Returns whether anything was linked.

    ⚠ **Call it before `award_points`, never after.** `award_points` writes the
    ledger row with `order.user`, so the order of these two calls is the whole
    difference between points landing in the customer's balance and points sitting
    unclaimed against their address until they next sign in.

    ⚠ **It links the order; it does not sign anyone in, and callers must not
    treat it as if it did.** A guest still cannot *spend* points at that checkout:
    every path that decides a redemption reads the authenticated user, which stays
    None. Nor may a caller clear the linked account's server-side cart - the
    customer checked out of their browser's own guest cart, and the account's cart
    is a separate basket nobody touched.
    """
    if order.user_id is not None:
        return False
    user = account_for_email(order.system, order.email)
    if user is None:
        return False

    order.user = user
    order.linked_by_email = True
    order.save(update_fields=["user", "linked_by_email", "updated_at"])
    # The customer's history list is cached per user+system, and it was cached
    # before this order belonged to anyone - exactly as in `claim_guest_orders`.
    invalidate_orders(user.id, order.system_id or 0)
    return True
