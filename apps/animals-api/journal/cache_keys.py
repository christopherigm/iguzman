"""The cache-key namespaces for the journal's payloads.

See ``catalog.cache_keys`` for why these are constants rather than literals at
each call site.
"""

SIGHTINGS = 'journal:sightings'
SIGHTING = 'journal:sighting'

# The map-pin payload (`/api/journal/sightings/map/`). Its own namespace rather
# than a key under SIGHTINGS: it is a different shape (no gallery, no prose) and
# a much smaller row, so replaying it must not depend on which feed queries
# happen to be warm.
MAP = 'journal:map'

# The landing page's headline numbers (`/api/journal/stats/`). A single key.
STATS = 'journal:stats'
