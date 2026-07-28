"""Cross-model cache invalidation for the journal.

The mirror of ``catalog/signals.py``, in the other direction: a sighting write
changes counts that are baked into payloads it does not own.

| Writing this       | Also stale                                                  |
| ------------------ | ----------------------------------------------------------- |
| ``Sighting``       | that species (``sighting_count``, ``last_seen``), and the   |
|                    | season / weather / location lists (each carries its own     |
|                    | ``sighting_count``), plus the landing-page stats            |
| ``SightingMedia``  | that sighting (its payload embeds the gallery, and its      |
|                    | cover image falls back to the first photo)                  |
"""

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache import invalidate_pattern

from .models import Sighting, SightingMedia


def _invalidate_sighting_payloads():
    invalidate_pattern('journal:sightings:*')
    invalidate_pattern('journal:sighting:*')
    cache.delete('journal:stats')


@receiver(post_save, sender=Sighting)
@receiver(post_delete, sender=Sighting)
def invalidate_on_sighting_change(sender, instance, **kwargs):
    _invalidate_sighting_payloads()

    # `sighting_count` / `last_seen` on the species payload.
    invalidate_pattern('catalog:species_list:*')
    invalidate_pattern('catalog:species:*')

    # `sighting_count` on each of the three reference lists. Cleared wholesale
    # rather than per-row: a sighting edit can move it *between* two seasons (or
    # locations), which makes both counts wrong, and the receiver cannot see the
    # previous value.
    for prefix in ('seasons', 'season', 'weather_conditions', 'weather_condition',
                   'locations', 'location'):
        invalidate_pattern(f'catalog:{prefix}:*')


@receiver(post_save, sender=SightingMedia)
@receiver(post_delete, sender=SightingMedia)
def invalidate_on_media_change(sender, instance, **kwargs):
    _invalidate_sighting_payloads()
