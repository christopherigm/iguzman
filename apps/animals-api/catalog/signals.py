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
| ``CategoryImage``    | that category (gallery + cover). Nothing else - no other        |
|                      | payload carries a category's photo                             |
| ``SpeciesImage``     | that species (payload embeds the gallery **and** takes its      |
|                      | cover from the first row), sightings (``species_image``)        |
| ``Season``           | sightings (embed ``season_name``/``slug``)                      |
| ``SeasonImage``      | that season (gallery + cover)                                   |
| ``WeatherCondition`` | sightings (embed ``weather_name``/``slug``)                     |
| ``WeatherConditionImage`` | that weather condition (gallery + cover)                   |
| ``Location``         | sightings (embed ``location_name``/``slug`` **and** fall back   |
|                      | to its coordinates)                                             |
| ``LocationImage``    | that location (gallery + cover)                                 |
| ``State``            | counties (embed ``state_name``/``slug``) **and** locations,     |
|                      | which flatten the state read *through* the county               |
| ``County``           | locations (embed ``county_name``/``slug`` and the state behind  |
|                      | it), and states (``county_count``/``location_count``)           |

⚠ A ``*Image`` receiver is **not** only about the gallery list. Since the read
serializers resolve a record's ``image`` to its first photo
(``core.serializers.gallery_image_url``), adding, deleting or re-ordering one row
can change the record's *cover* - so every card of it anywhere is stale too.

⚠ If you add a derived or flattened field to a serializer, add its receiver in
the same task - otherwise the value is up to ``CACHE_TTL`` stale, which looks
exactly like a lost write.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache import invalidate
from journal import cache_keys as journal_keys

from . import cache_keys as keys
from .models import (
    Category,
    CategoryImage,
    County,
    Location,
    LocationImage,
    Season,
    SeasonImage,
    Species,
    SpeciesImage,
    State,
    WeatherCondition,
    WeatherConditionImage,
)


def _invalidate_sightings():
    # `MAP` alongside the feed: a pin carries the species' *icon* and its
    # category's, so an author uploading a glyph changes what every marker of
    # that branch is drawn as without touching a single Sighting row. The feed
    # and detail payloads carry the same two glyphs (an entry's own page pins
    # itself), which is why they are cleared here too rather than only by `MAP`.
    invalidate(
        journal_keys.SIGHTINGS, journal_keys.SIGHTING, journal_keys.STATS, journal_keys.MAP
    )


def _invalidate_species():
    invalidate(keys.SPECIES_LIST, keys.SPECIES)


def _invalidate_categories():
    invalidate(keys.CATEGORIES, keys.CATEGORY)


def _invalidate_locations():
    invalidate(keys.LOCATIONS, keys.LOCATION)


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


@receiver(post_save, sender=CategoryImage)
@receiver(post_delete, sender=CategoryImage)
def invalidate_on_category_image_change(sender, instance, **kwargs):
    # Only the category namespaces: no other payload carries a category's image
    # (species and sightings flatten its name, slug and kind, but not its photo).
    _invalidate_categories()


@receiver(post_save, sender=SpeciesImage)
@receiver(post_delete, sender=SpeciesImage)
def invalidate_on_species_image_change(sender, instance, **kwargs):
    _invalidate_species()
    # A gallery write can change the species' *cover* (the first row), and every
    # sighting payload carries `species_image`.
    _invalidate_sightings()


@receiver(post_save, sender=SeasonImage)
@receiver(post_delete, sender=SeasonImage)
def invalidate_on_season_image_change(sender, instance, **kwargs):
    invalidate(keys.SEASONS, keys.SEASON)


@receiver(post_save, sender=WeatherConditionImage)
@receiver(post_delete, sender=WeatherConditionImage)
def invalidate_on_weather_image_change(sender, instance, **kwargs):
    invalidate(keys.WEATHER_CONDITIONS, keys.WEATHER_CONDITION)


@receiver(post_save, sender=LocationImage)
@receiver(post_delete, sender=LocationImage)
def invalidate_on_location_image_change(sender, instance, **kwargs):
    invalidate(keys.LOCATIONS, keys.LOCATION)


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
    _invalidate_locations()
    _invalidate_sightings()
    # Both geography payloads carry a `location_count`, and a place moving
    # between counties changes it on two rows without touching either.
    invalidate(keys.COUNTIES, keys.COUNTY, keys.STATES, keys.STATE)


@receiver(post_save, sender=State)
@receiver(post_delete, sender=State)
def invalidate_on_state_change(sender, instance, **kwargs):
    invalidate(keys.STATES, keys.STATE)
    # Every county payload flattens `state_name`/`state_slug`...
    invalidate(keys.COUNTIES, keys.COUNTY)
    # ...and every *location* payload flattens the state read through its
    # county, so renaming a state goes stale two tables away from itself.
    _invalidate_locations()


@receiver(post_save, sender=County)
@receiver(post_delete, sender=County)
def invalidate_on_county_change(sender, instance, **kwargs):
    invalidate(keys.COUNTIES, keys.COUNTY)
    # `county_count` and `location_count` on every state payload change when a
    # county is added, disabled or moved - none of which touches the State row.
    invalidate(keys.STATES, keys.STATE)
    _invalidate_locations()
