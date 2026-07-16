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
