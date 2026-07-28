"""The API response cache: how a view reads it, and how a write clears it.

Two concerns live here, and both exist because of the same fact: **the Django
admin is this project's CMS**. Every edit an author makes arrives as a plain
``Model.save()``, not as a request to one of the API views - so anything that
depends on a view running to stay correct is, in practice, never run.

**Reading.** ``cached_get`` / ``cached_set`` are the only way a view should touch
the response cache. They are no-ops when ``settings.API_CACHE_ENABLED`` is false
- the development default - so a change made in the admin shows up on the next
page load instead of up to ``CACHE_TTL`` later.

Why a flag rather than pointing ``CACHES`` at ``DummyCache`` in development: the
cache holds more than response payloads. ``users/views.py`` parks a WebAuthn
challenge in it between the two halves of a passkey ceremony, and the Redis
branch of ``settings.py`` puts sessions there too. A dummy backend would silently
break passkey registration on a laptop. The flag switches off exactly the layer
that hides a write, and nothing else.

**Invalidating.** ``invalidate`` clears every key under one or more namespace
prefixes. Use it rather than a hand-written ``cache.delete`` - see its docstring
for the bare-key trap that makes the difference between "works in the tests" and
"works on the landing page".
"""

from django.conf import settings
from django.core.cache import cache

# How long a cached payload lives when nothing invalidates it first. Every write
# path clears its namespace, so this is a backstop against a missed receiver, not
# the mechanism.
CACHE_TTL = 300  # 5 minutes


def cache_enabled():
    """Whether the response cache is switched on for this process.

    Read from settings on every call rather than captured at import, so a test
    can flip it with ``override_settings`` (which ``core.tests`` does - the
    cache-invalidation regressions have to run against a *real* cache or they
    pass vacuously).
    """
    return getattr(settings, 'API_CACHE_ENABLED', True)


def cached_get(key):
    """The cached payload for ``key``, or None - always None when disabled."""
    if not cache_enabled():
        return None
    return cache.get(key)


def cached_set(key, value, ttl=CACHE_TTL):
    """Store a payload, unless the response cache is switched off."""
    if not cache_enabled():
        return
    cache.set(key, value, ttl)


def invalidate_pattern(pattern):
    """Delete every key matching a glob pattern.

    Redis (production, via django-redis) implements ``delete_pattern`` natively.
    LocMemCache - what the test suite runs on - does not, and silently skipping
    there would leave an edit invisible for the whole TTL, which reads as a lost
    write. The fallback clears this process's cache instead: blunt, but a LocMem
    cache is per-process and never shared, so the only cost is re-serializing the
    next few requests.
    """
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        cache.clear()


def invalidate(*prefixes):
    """Clear every cached payload under each namespace prefix.

    Two deletes per prefix, and **both** are needed:

    * ``prefix:*`` catches every parameterised variant
      (``catalog:categories:kind=animal``) and every detail key
      (``catalog:category:7``, ``catalog:category:slug:deer``).
    * ``prefix`` alone catches the bare key, which ``core.views.list_key``
      returns for a request that carried no query params at all -
      ``/api/catalog/categories/`` caches under exactly ``catalog:categories``,
      and the ``catalog:categories:*`` pattern does **not** match it.

    Missing that bare key is invisible in a test that always passes a filter, and
    immediately visible on the landing page, which asks for the unfiltered list.
    """
    for prefix in prefixes:
        cache.delete(prefix)
        invalidate_pattern(f'{prefix}:*')
