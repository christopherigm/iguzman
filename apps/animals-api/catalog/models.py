"""
The reference catalog: *what* can be observed, and *where*.

This app owns the stable, reusable records - a category, a species, a season, a
weather condition, a place. The `journal` app owns the entries that reference
them (each individual sighting, with its date, coordinates and photos).

The shape follows website-api's `catalog`, with one deliberate difference: the
five top-level branches are a **choices enum on Category** (``KIND_CHOICES``),
not a second table and not a self-referential parent. See ``Category``.
"""

from django.core.exceptions import ValidationError
from django.db import models

from core.fields import ResizedImageField
from core.image_sizes import ICON
from core.models import Common, RegularPicture, picture


# The five top-level branches of the site. Deliberately a flat enum rather than
# a `MajorCategory` table or a `parent` self-FK on Category:
#
#   * They are structural. The frontend has a page per branch and code branches
#     on them; a table would let an operator rename 'animal' to something no
#     route serves, and a parent FK would let a 4-level tree grow with nothing
#     in the schema to stop it.
#   * They are stable. Adding a sixth branch is a migration plus a frontend
#     route either way - the table buys nothing at that point.
#
# Read the pairing as: Category is the *sub*-category an operator files things
# under ('Deer', 'Squirrels', 'Oaks'), and its `kind` says which branch that
# sub-category belongs to. A Species therefore learns its branch through its
# category (``species.category.kind``), which is the single path - never store
# `kind` on Species too, or the two will disagree.
KIND_CHOICES = [
    ('animal', 'Animals'),
    ('plant', 'Plants'),
    ('fungus', 'Fungi'),
    ('season', 'Seasons'),
    ('weather', 'Weather'),
]

KIND_VALUES = [value for value, _label in KIND_CHOICES]


def icon_field():
    """A small square glyph shown beside a label (nav rows, filter chips, map pins).

    Separate from the record's `image`: the image is a photograph, the icon is a
    mark that has to stay legible at 24 px. PNG uploads keep their alpha channel
    (see ``PRESERVED_FORMATS``), which is what a transparent glyph needs.
    """
    return ResizedImageField(
        null=True,
        blank=True,
        max_size=[ICON, None],
        quality=90,
        upload_to=picture,
    )


class Category(RegularPicture):
    """A sub-category within one of the five branches: 'Deer', 'Squirrels', 'Oaks'.

    Inherits from RegularPicture, which provides:
      - Common:      enabled, created, modified, version
      - BasePicture: name, description, short_description, href, fit, background_color
      - RegularPicture: image (max 1200px)
    """

    # `name` is required here, overriding BasePicture's nullable one.
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    kind = models.CharField(
        max_length=16,
        choices=KIND_CHOICES,
        help_text='Which of the five top-level branches this category belongs to. '
                  'Everything filed under it inherits this branch.',
    )
    icon = icon_field()

    scientific_name = models.CharField(
        max_length=255, null=True, blank=True,
        help_text='Taxonomic group this category corresponds to, if any '
                  '(e.g. "Cervidae" for Deer). Free text - not validated.',
    )

    is_featured = models.BooleanField(
        default=False, help_text='Surface this category on the landing page.'
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Category'
        verbose_name_plural = 'Categories'
        ordering = ['kind', 'sort_order', 'name']
        indexes = [models.Index(fields=['kind', 'sort_order'])]

    def __str__(self):
        return f'{self.name} ({self.get_kind_display()})'


class Species(RegularPicture):
    """One catalogued subject: a White-tailed Deer, a Coast Live Oak, a Fly Agaric.

    Named for the common case even though a few entries are not species in the
    biological sense - a Season or a Weather record photographed as a subject in
    its own right is filed here too, under a category of that `kind`.

    A Species is the *stable* record. Every time it was actually seen is a
    ``journal.Sighting`` pointing back here.
    """

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='species',
        help_text='The sub-category this belongs to. Its `kind` is what places '
                  'this entry in one of the five branches.',
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    icon = icon_field()

    # Taxonomy (all optional - a season or a cloud formation has none).
    scientific_name = models.CharField(max_length=255, null=True, blank=True)
    family = models.CharField(max_length=255, null=True, blank=True)

    video_link = models.URLField(
        max_length=500, null=True, blank=True,
        help_text='YouTube, Vimeo or direct video URL rendered as a hero above '
                  'the detail page.',
    )

    is_featured = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Species'
        verbose_name_plural = 'Species'
        ordering = ['sort_order', 'name']
        indexes = [models.Index(fields=['category', 'sort_order'])]

    def __str__(self):
        return self.name

    @property
    def kind(self):
        """The branch this entry lives in, read through its category.

        A read-only derivation on purpose: storing it here as well would create a
        second copy that a category edit could silently leave behind.
        """
        return self.category.kind if self.category_id else None


class SpeciesImage(RegularPicture):
    """An additional reference photo of a species, beyond its main `image`.

    These are the identification shots that belong to the *species* (a plumage
    variant, the underside of a leaf). Photos of one particular encounter belong
    to that ``journal.Sighting`` instead.
    """

    species = models.ForeignKey(
        Species,
        on_delete=models.CASCADE,
        related_name='images',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Species Image'
        verbose_name_plural = 'Species Images'
        ordering = ['sort_order']

    def __str__(self):
        return f'Image for {self.species} (#{self.sort_order})'


class Season(RegularPicture):
    """One of the year's seasons - both a browsable section and a Sighting field.

    ``months`` is what lets a sighting date resolve to a season with no hard-coded
    calendar (see ``for_date``), and what makes the southern hemisphere a data
    change rather than a code change.
    """

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    icon = icon_field()

    months = models.JSONField(
        default=list, blank=True,
        help_text='Month numbers this season covers, 1-12 (e.g. [9, 10, 11] for '
                  'a northern-hemisphere autumn). Used to fill a sighting\'s '
                  'season from its date.',
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Season'
        verbose_name_plural = 'Seasons'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        months = self.months or []
        if not isinstance(months, list):
            raise ValidationError({'months': 'Must be a list of month numbers.'})
        for month in months:
            if not isinstance(month, int) or not 1 <= month <= 12:
                raise ValidationError({'months': 'Each month must be an integer from 1 to 12.'})

    @classmethod
    def for_date(cls, value):
        """The season whose ``months`` contain ``value``'s month, or None.

        Matched in Python rather than with a ``months__contains`` lookup: that
        lookup is unsupported on SQLite, which is what development and the test
        suite run on. There are four rows, so the scan is free.
        """
        if value is None:
            return None
        month = value.month
        for season in cls.objects.filter(enabled=True):
            if month in (season.months or []):
                return season
        return None


class WeatherCondition(RegularPicture):
    """The weather during a sighting - fog, overcast, snow - and its own section."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    icon = icon_field()
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Weather Condition'
        verbose_name_plural = 'Weather Conditions'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


PLACE_TYPE_CHOICES = [
    ('park', 'Park'),
    ('reserve', 'Nature Reserve'),
    ('forest', 'Forest'),
    ('trail', 'Trail'),
    ('garden', 'Garden'),
    ('lake', 'Lake'),
    ('river', 'River'),
    ('beach', 'Beach'),
    ('wetland', 'Wetland'),
    ('mountain', 'Mountain'),
    ('desert', 'Desert'),
    ('urban', 'Urban'),
    ('backyard', 'Backyard'),
    ('other', 'Other'),
]


class Location(Common):
    """A place things were seen: a park, a trail inside it, a backyard.

    Not a picture model - a location's own photo is whichever sighting best
    shows it, and duplicating one here would just go stale. It carries the
    place's *default* coordinates; a sighting may override them with the exact
    spot (see ``journal.Sighting.coordinates``).
    """

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(null=True, blank=True)
    short_description = models.TextField(null=True, blank=True)

    # A trail inside a park, a pond inside a reserve. One level is the intent;
    # nothing enforces a depth limit, so keep it shallow.
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    place_type = models.CharField(
        max_length=16, choices=PLACE_TYPE_CHOICES, default='other', null=True, blank=True
    )

    # Six decimal places is ~11 cm at the equator - far past what a phone GPS
    # resolves, and the standard precision for a decimal lat/lng pair.
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    region = models.CharField(
        max_length=255, null=True, blank=True, help_text='State, province or region.'
    )
    country = models.CharField(max_length=255, null=True, blank=True)
    map_link = models.URLField(
        max_length=500, null=True, blank=True,
        help_text='Google Maps / OpenStreetMap link to the place.',
    )

    # Whether the exact coordinates may be published. A nesting site or a rare
    # orchid is exactly the thing that gets disturbed once its location is on the
    # internet, so this defaults to open but exists to be turned off - the API
    # then rounds both this place's and its sightings' coordinates. See
    # `journal.serializers`.
    hide_precise_location = models.BooleanField(
        default=False,
        help_text='Round published coordinates to ~1 km for this place and every '
                  'sighting at it. Use for nesting sites and sensitive species.',
    )

    is_featured = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Location'
        verbose_name_plural = 'Locations'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name
