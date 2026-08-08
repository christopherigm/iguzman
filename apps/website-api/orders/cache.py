"""Cache keys for order data, shared by orders/views.py and orders/admin.py.

Same split as users/cache.py, and for the same reason: admin.py must be able to
invalidate without importing the view layer.

Note what is *not* cached: an individual order. The confirmation page polls it
while the webhook is still in flight, so serving it from a cache would show the
customer "pending" for the whole TTL after their payment had already landed.
"""

from django.core.cache import cache

ORDERS_CACHE_TTL = 300  # 5 minutes


def orders_key(user_id, system_id):
    return f"orders:list:{user_id}:{system_id}"


def invalidate_orders(user_id, system_id):
    cache.delete(orders_key(user_id, system_id))


# Availability is the most volatile payload in this app - every booking taken
# invalidates it - so it is cached for a minute rather than the usual five, and
# any write to a Booking clears the namespace outright (see orders/signals.py).
# The short TTL is a floor under bursts, not a correctness mechanism: checkout
# re-derives the slot before writing, so the worst a stale calendar can do is
# offer a slot that is then honestly refused.
AVAILABILITY_CACHE_TTL = 60


def availability_key(service_id, branch_id, start_date, days, party_size=1, resource_id=None):
    """The cache key for one availability payload.

    ⚠ **Every input the payload varies on must appear here.** Party size and the
    chosen resource both change which slots come back, so leaving either out
    would serve a party of six the calendar computed for a solo customer - and
    they would only find out at checkout, which honestly refuses the slot.

    Cardinality grows by party x resource, which is why `party` is clamped at the
    view before it reaches this. At a 60-second TTL that is still a trivial number
    of keys; do not "optimise" them back out of the key.
    """
    return (
        f"orders:availability:{service_id}:{branch_id or 0}:{start_date}:{days}"
        f":{party_size}:{resource_id or 0}"
    )


def invalidate_availability():
    try:
        cache.delete_pattern("orders:availability:*")
    except AttributeError:
        # LocMemCache in development and tests has no pattern delete; the
        # one-minute TTL covers it there.
        pass
