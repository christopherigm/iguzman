from django.core.cache import cache


def invalidate_pattern(pattern):
    """Delete every key matching a glob pattern.

    Redis (production, via django-redis) implements ``delete_pattern`` natively.
    LocMemCache - what development and the test suite run on - does not, and
    silently skipping there leaves an edit invisible for the whole 5-minute TTL
    on a laptop, which reads as a lost write. The fallback clears this process's
    cache instead: blunt, but a LocMem cache is per-process and never shared, so
    the only cost is re-serializing the next few requests.
    """
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        cache.clear()
