"""The cache-key namespaces for the catalog's payloads.

One module so that a view (which caches *under* a prefix) and a signal receiver
(which *clears* it) can never drift apart on a string. A typo in either place is
silent: the payload is still served, just from a key nothing invalidates.

Each resource has two - the list namespace and the detail namespace - plus the
two standalone aggregate keys at the bottom.
"""

CATEGORIES = 'catalog:categories'
CATEGORY = 'catalog:category'

SPECIES_LIST = 'catalog:species_list'
SPECIES = 'catalog:species'

SEASONS = 'catalog:seasons'
SEASON = 'catalog:season'

WEATHER_CONDITIONS = 'catalog:weather_conditions'
WEATHER_CONDITION = 'catalog:weather_condition'

LOCATIONS = 'catalog:locations'
LOCATION = 'catalog:location'

# Geography lookups. A location's payload flattens its county *and* the state
# read through it, so a write to either is what makes a location payload stale -
# see the table in signals.py.
STATES = 'catalog:states'
STATE = 'catalog:state'

COUNTIES = 'catalog:counties'
COUNTY = 'catalog:county'

# The five-branch nav (`/api/catalog/kinds/`). A single key, not a namespace -
# it takes no query params - but it goes through `invalidate()` like the rest so
# no caller has to remember which is which.
KINDS = 'catalog:kinds'
