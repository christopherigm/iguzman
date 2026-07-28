"""Test-support cache backend. Not a test module - imported by settings overrides.

``PatternLocMemCache`` is LocMemCache plus a real ``delete_pattern``, and the
whole cache-invalidation suite depends on it.

**Why it has to exist.** ``core.cache.invalidate_pattern`` calls
``cache.delete_pattern`` and falls back to ``cache.clear()`` when the backend has
none. Plain LocMemCache has none - so on the test backend *every* invalidation,
however wrong or incomplete, wipes the entire cache and the next read is correct
by accident. A receiver that forgets a namespace passes; the same code on Redis,
where ``delete_pattern`` deletes only what it was asked to, serves a stale
payload for the full TTL.

That is not hypothetical: it is exactly how a ``Category`` write shipped without
clearing ``catalog:categories``, which is what made an icon uploaded in the admin
fail to appear on the landing page. Every test in this project asserting that a
write is visible afterwards is meaningless without this backend.

The glob semantics match django-redis: ``prefix:*`` matches keys under that
namespace and nothing else - in particular **not** the bare ``prefix`` key.
"""

from fnmatch import fnmatch

from django.core.cache.backends.locmem import LocMemCache


class PatternLocMemCache(LocMemCache):
    def delete_pattern(self, pattern, version=None):
        # Match against the *prefixed, versioned* key, since that is what is
        # actually stored (`:1:catalog:categories:kind=animal`); `make_key`
        # applies the same transformation to the pattern so the glob lines up.
        match = self.make_key(pattern, version=version)
        with self._lock:
            for key in [key for key in self._cache if fnmatch(key, match)]:
                self._delete(key)
