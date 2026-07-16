"""Cache keys for user-scoped data, shared by users/views.py and users/admin.py.

These live here rather than in views.py so admin.py can invalidate without
importing the view layer (admin loads at app-ready time; reaching into views
from there drags catalog.models into the import graph before it is needed).
"""

from django.core.cache import cache

FAVORITES_CACHE_TTL = 300  # 5 minutes


def favorites_key(user_id, system_id):
    return f"users:favorites:{user_id}:{system_id}"


def favorites_ids_key(user_id, system_id):
    return f"users:favorites-ids:{user_id}:{system_id}"


def invalidate_favorites(user_id, system_id):
    cache.delete(favorites_key(user_id, system_id))
    cache.delete(favorites_ids_key(user_id, system_id))
