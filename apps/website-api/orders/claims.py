"""Turning a guest's orders into an account's history.

Its own module rather than a function in `views.py` because the callers are in
`users` (email verification and login), and reaching into another app's view
layer to run a query would drag the whole checkout/Stripe import graph along
with it.
"""

from .cache import invalidate_orders
from .models import Order


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

    if claimed:
        # The history list is cached per user+system, and it was cached before
        # these orders belonged to anyone.
        invalidate_orders(user.id, system.id if system else 0)

    return claimed
