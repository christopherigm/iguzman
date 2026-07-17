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
