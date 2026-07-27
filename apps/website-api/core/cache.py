"""Cache helpers shared by every views.py / admin.py in this project."""

from fnmatch import fnmatchcase

from django.core.cache import cache


def invalidate_pattern(pattern):
    """Delete every cache key matching a glob pattern.

    django-redis exposes delete_pattern(); the local-memory cache used in
    development does not, so there we scan the backend's own key store instead.
    Skipping invalidation on LocMemCache (as this used to) leaves list endpoints
    serving pre-write data until the TTL lapses - an admin toggling a record and
    reloading sees the old value and reads it as a lost write.
    """
    try:
        cache.delete_pattern(pattern)
        return
    except AttributeError:
        pass

    # LocMemCache keys its store by the *final* key, so match the pattern in the
    # same namespaced form rather than against the bare prefix we were passed.
    store = getattr(cache, "_cache", None)
    if store is None:
        return
    full_pattern = cache.make_key(pattern)
    for key in [k for k in list(store) if fnmatchcase(k, full_pattern)]:
        store.pop(key, None)
        getattr(cache, "_expire_info", {}).pop(key, None)


def invalidate_system_payload():
    """Drop every cached ``GET /api/system/`` response.

    That payload is not just the System row: it also carries derived counts of
    *other* models - ``product_count``, ``service_count``, ``menu_item_count``,
    ``menu_item_kind_counts`` and ``branch_count`` (see ``SystemSerializer``).
    Those are what the storefront navbar renders its links from, so a catalog or
    branch write makes the cached payload wrong even though the System row never
    changed.

    It matters more here than anywhere else because ``SYSTEM_CACHE_TTL`` is an
    hour, not the five minutes the list endpoints use: without this the navbar
    keeps its old links for up to an hour after an admin adds the tenant's first
    drink or flips an item's ``kind``. Both key shapes are cleared - ``host:`` is
    what the public site reads, ``pk:`` what the CMS does.
    """
    invalidate_pattern("system:host:*")
    invalidate_pattern("system:pk:*")
