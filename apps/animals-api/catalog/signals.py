"""Cross-model cache invalidation for the catalog.

The rule these implement (website-api's CLAUDE.md, "Cross-model invalidation"):
a view only knows how to clear *its own* namespace, which is not enough when a
cached payload embeds another model's data. Those cases live here as
``post_save``/``post_delete`` receivers, so one receiver covers the API views,
the Django admin (single *and* bulk delete), any cascade, and a shell script
alike.

What embeds what:

| Writing this      | Also stale                                                    |
| ----------------- | ------------------------------------------------------------- |
| ``Category``      | species (embed ``category_name``/``slug``/``kind``), the kinds |
|                   | payload (``category_count``), sightings (same, flattened)      |
| ``Species``       | categories (``species_count``), the kinds payload, sightings   |
|                   | (embed ``species_name``/``species_image``)                     |
| ``SpeciesImage``  | that species (its payload embeds the gallery)                  |
| ``Season``        | sightings (embed ``season_name``/``slug``)                     |
| ``WeatherCondition`` | sightings (embed ``weather_name``/``slug``)                 |
| ``Location``      | sightings (embed ``location_name``/``slug`` **and** fall back  |
|                   | to its coordinates)                                            |

⚠ If you add a derived or flattened field to a serializer, add its receiver in
the same task - otherwise the value is up to ``CACHE_TTL`` stale and looks
exactly like a lost write.
"""

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache import invalidate_pattern

from .models import Category, Location, Season, Species, SpeciesImage, WeatherCondition


def _invalidate_sightings():
    invalidate_pattern('journal:sightings:*')
    invalidate_pattern('journal:sighting:*')
    cache.delete('journal:stats')


def _invalidate_species():
    invalidate_pattern('catalog:species_list:*')
    invalidate_pattern('catalog:species:*')


def _invalidate_categories():
    invalidate_pattern('catalog:categories:*')
    invalidate_pattern('catalog:category:*')
    cache.delete('catalog:categories')


@receiver(post_save, sender=Category)
@receiver(post_delete, sender=Category)
def invalidate_on_category_change(sender, instance, **kwargs):
    _invalidate_species()
    _invalidate_sightings()
    cache.delete('catalog:kinds')


@receiver(post_save, sender=Species)
@receiver(post_delete, sender=Species)
def invalidate_on_species_change(sender, instance, **kwargs):
    # `species_count` on every category payload, and the same count on the kinds
    # nav - a new species, a disabled one, or one moved to another category all
    # change them, and none of that touches the Category row itself.
    _invalidate_categories()
    _invalidate_sightings()
    cache.delete('catalog:kinds')


@receiver(post_save, sender=SpeciesImage)
@receiver(post_delete, sender=SpeciesImage)
def invalidate_on_species_image_change(sender, instance, **kwargs):
    _invalidate_species()


@receiver(post_save, sender=Season)
@receiver(post_delete, sender=Season)
@receiver(post_save, sender=WeatherCondition)
@receiver(post_delete, sender=WeatherCondition)
@receiver(post_save, sender=Location)
@receiver(post_delete, sender=Location)
def invalidate_sightings_on_reference_change(sender, instance, **kwargs):
    _invalidate_sightings()
