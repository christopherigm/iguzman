"""The cache-key namespaces for the journal's payloads.

See ``catalog.cache_keys`` for why these are constants rather than literals at
each call site.
"""

SIGHTINGS = 'journal:sightings'
SIGHTING = 'journal:sighting'

# The landing page's headline numbers (`/api/journal/stats/`). A single key.
STATS = 'journal:stats'
