"""Cache invalidation for the catalog.

**These receivers are the primary invalidation path, not a safety net.** The
Django admin is this project's CMS (see ``CLAUDE.md``), so almost every real edit
arrives as a ``Model.save()`` from an admin form - never as a PATCH to one of the
API views. ``CachedViewMixin`` clears a namespace when a *view* writes; only a
``post_save``/``post_delete`` receiver also covers the admin (single **and** bulk
actions), a cascade, a management command and a shell session.

Two rules, in order:

1. **A receiver clears its own namespace first.** Skipping this because "the view
   already does it" is the bug this module was rewritten to fix: a category
   edited in the admin left ``catalog:categories`` - the exact key the landing
   page's unfiltered list is cached under - untouched for the full TTL, so a
   newly uploaded icon simply did not appear.
2. **Then it clears everything that embeds it**, because a cached payload is not
   only stale when its own row changes:

| Writing this         | Also stale                                                     |
| -------------------- | -------------------------------------------------------------- |
| ``Category``         | species (embed ``category_name``/``slug``/``kind``), the kinds  |
|                      | payload (``category_count``), sightings (same, flattened)       |
| ``Species``          | categories (``species_count``), the kinds payload, sightings    |
|                      | (embed ``species_name``/``species_image``)                      |
| ``SpeciesImage``     | that species (its payload embeds the gallery)                   |
| ``Season``           | sightings (embed ``season_name``/``slug``)                      |
| ``WeatherCondition`` | sightings (embed ``weather_name``/``slug``)                     |
| ``Location``         | sightings (embed ``location_name``/``slug`` **and** fall back   |
|                      | to its coordinates)                                             |

⚠ If you add a derived or flattened field to a serializer, add its receiver in
the same task - otherwise the value is up to ``CACHE_TTL`` stale, which looks
exactly like a lost write.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache import invalidate
from journal import cache_keys as journal_keys

from . import cache_keys as keys
from .models import Category, Location, Season, Species, SpeciesImage, WeatherCondition


def _invalidate_sightings():
    invalidate(journal_keys.SIGHTINGS, journal_keys.SIGHTING, journal_keys.STATS)


def _invalidate_species():
    invalidate(keys.SPECIES_LIST, keys.SPECIES)


def _invalidate_categories():
    invalidate(keys.CATEGORIES, keys.CATEGORY)


@receiver(post_save, sender=Category)
@receiver(post_delete, sender=Category)
def invalidate_on_category_change(sender, instance, **kwargs):
    _invalidate_categories()  # rule 1: its own payloads
    _invalidate_species()
    _invalidate_sightings()
    invalidate(keys.KINDS)


@receiver(post_save, sender=Species)
@receiver(post_delete, sender=Species)
def invalidate_on_species_change(sender, instance, **kwargs):
    _invalidate_species()
    # `species_count` on every category payload, and the same count on the kinds
    # nav - a new species, a disabled one, or one moved to another category all
    # change them, and none of that touches the Category row itself.
    _invalidate_categories()
    _invalidate_sightings()
    invalidate(keys.KINDS)


@receiver(post_save, sender=SpeciesImage)
@receiver(post_delete, sender=SpeciesImage)
def invalidate_on_species_image_change(sender, instance, **kwargs):
    _invalidate_species()


@receiver(post_save, sender=Season)
@receiver(post_delete, sender=Season)
def invalidate_on_season_change(sender, instance, **kwargs):
    invalidate(keys.SEASONS, keys.SEASON)
    _invalidate_sightings()


@receiver(post_save, sender=WeatherCondition)
@receiver(post_delete, sender=WeatherCondition)
def invalidate_on_weather_change(sender, instance, **kwargs):
    invalidate(keys.WEATHER_CONDITIONS, keys.WEATHER_CONDITION)
    _invalidate_sightings()


@receiver(post_save, sender=Location)
@receiver(post_delete, sender=Location)
def invalidate_on_location_change(sender, instance, **kwargs):
    invalidate(keys.LOCATIONS, keys.LOCATION)
    _invalidate_sightings()
