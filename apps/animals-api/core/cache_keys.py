"""The cache-key namespace for the site-settings payload.

One module so a view (which caches *under* a prefix) and a signal receiver
(which *clears* it) can never drift apart on a string - see
``catalog/cache_keys.py`` for the same reasoning in the app that has many.

There is only one key here because ``System`` is a singleton: the payload takes
no query params and has no per-row variants. It still goes through
``core.cache.invalidate()`` rather than a bare ``cache.delete``, so the bare-key
trap documented there cannot bite if a parameterised variant is ever added.
"""

SYSTEM = 'core:system'
