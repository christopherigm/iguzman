"""Cache invalidation for the journal.

The mirror of ``catalog/signals.py`` - read that module's header first; the two
rules (clear your own namespace, then everything that embeds you) and the reason
receivers rather than views own this are the same here.

| Writing this       | Also stale                                                  |
| ------------------ | ----------------------------------------------------------- |
| ``Sighting``       | that species (``sighting_count``, ``last_seen``), and the   |
|                    | season / weather / location lists (each carries its own     |
|                    | ``sighting_count``), plus the landing-page stats            |
| ``SightingMedia``  | that sighting (its payload embeds the gallery, and its      |
|                    | cover image falls back to the first photo)                  |
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from catalog import cache_keys as catalog_keys
from core.cache import invalidate

from . import cache_keys as keys
from .models import Sighting, SightingMedia


def _invalidate_sighting_payloads():
    invalidate(keys.SIGHTINGS, keys.SIGHTING, keys.STATS)


@receiver(post_save, sender=Sighting)
@receiver(post_delete, sender=Sighting)
def invalidate_on_sighting_change(sender, instance, **kwargs):
    _invalidate_sighting_payloads()

    # `sighting_count` / `last_seen` on the species payload.
    invalidate(catalog_keys.SPECIES_LIST, catalog_keys.SPECIES)

    # `sighting_count` on each of the three reference lists. Cleared wholesale
    # rather than per-row: a sighting edit can move it *between* two seasons (or
    # locations), which makes both counts wrong, and the receiver cannot see the
    # previous value.
    invalidate(
        catalog_keys.SEASONS,
        catalog_keys.SEASON,
        catalog_keys.WEATHER_CONDITIONS,
        catalog_keys.WEATHER_CONDITION,
        catalog_keys.LOCATIONS,
        catalog_keys.LOCATION,
    )


@receiver(post_save, sender=SightingMedia)
@receiver(post_delete, sender=SightingMedia)
def invalidate_on_media_change(sender, instance, **kwargs):
    _invalidate_sighting_payloads()
