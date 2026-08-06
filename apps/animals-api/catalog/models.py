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
from core.models import (
    BasePicture,
    Common,
    RegularPlusPicture,
    picture,
    stamp_published,
    was_published_field,
)


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


class GalleryImage(RegularPlusPicture):
    """One photo in a record's gallery. The shared shape of every ``*Image`` table.

    A catalog record's photographs live in a table of their own rather than in a
    single ``image`` column, so an author can upload a whole outing's worth at
    once and arrange them. **The first row is the record's main image** - the
    read serializers resolve a record's ``image`` to position 1 here and nowhere
    else, which is why ``sort_order`` is a cover-picking edit rather than
    housekeeping. See ``core.serializers.gallery_image_url``.

    Inherits ``RegularPlusPicture``, so each row carries its own caption pair
    (``name``/``en_name``), ``description`` pair, ``fit`` and ``background_color``.
    The CMS deliberately edits none of those today - it uploads the photos and
    nothing else - but the Django admin's inlines still expose them, and the
    public gallery renders a caption when one is there.

    Abstract: the FK back to the parent is what each concrete table adds, and it
    has to be named for its parent so ``related_name='images'`` reads the same on
    all four.
    """

    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        abstract = True
        # `id` is the tiebreak, so a batch upload that lands with the same
        # sort_order still comes back in the order it was created - without it
        # the "first row is the cover" rule would pick an arbitrary photo.
        ordering = ['sort_order', 'id']


class Category(BasePicture):
    """A sub-category within one of the five branches: 'Deer', 'Squirrels', 'Oaks'.

    Inherits from BasePicture, which provides:
      - Common:      enabled, created, modified, version
      - BasePicture: name, description, short_description, href, fit, background_color

    ⚠ **`BasePicture`, not `RegularPlusPicture` - a record has no `image` column
    of its own.** Its cover is the first row of its gallery, full stop; see
    ``core.serializers.gallery_image_url`` and migration ``0013_drop_main_image``
    for why the column that used to sit here was retired. `fit` and
    `background_color` still apply - they are how that cover is *displayed*.
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


class CategoryImage(GalleryImage):
    """A photo of a category. The first is its cover - see ``GalleryImage``.

    These belong to the *group* ('Deer', 'Oaks'), not to any one species filed
    under it. The category page still also gathers its species' photographs into
    the same strip - these lead it.
    """

    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='images',
    )

    class Meta(GalleryImage.Meta):
        abstract = False
        verbose_name = 'Category Image'
        verbose_name_plural = 'Category Images'

    def __str__(self):
        return f'Image for {self.category} (#{self.sort_order})'


class Species(BasePicture):
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

    # ---- Contributions ------------------------------------------------------
    # A species is the *shared* reference record, so unlike a sighting it carries
    # no public credit line - there is nothing here that belongs to one observer.
    # These two fields are only about moderation: who proposed the entry, and
    # whether it is still waiting for an administrator. A contribution is created
    # with `enabled=False`, so it is invisible to every public read until then.
    created_by = models.ForeignKey(
        'auth.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contributed_species',
        help_text='The account that proposed this entry, for entries filed '
                  'through the public contribute flow. Never published.',
    )
    is_contribution = models.BooleanField(
        default=False,
        help_text='Proposed through the public contribute flow rather than the '
                  'CMS. Such an entry starts disabled and joins the catalog when '
                  'an administrator enables it.',
    )
    # What tells "waiting for its first review" apart from "was live, its
    # proposer edited it, and it is waiting again". See
    # `core.models.was_published_field`.
    was_published = was_published_field()

    class Meta:
        verbose_name = 'Species'
        verbose_name_plural = 'Species'
        ordering = ['sort_order', 'name']
        indexes = [
            models.Index(fields=['category', 'sort_order']),
            # The contributor's own list - their proposals, pending ones included.
            models.Index(fields=['created_by']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Latched here rather than in a serializer: a proposal is published by an
        # ordinary `enabled=True` PATCH from the CMS and can equally be published
        # from the Django admin, and neither goes through the contribute layer.
        stamp_published(self)
        super().save(*args, **kwargs)

    @property
    def kind(self):
        """The branch this entry lives in, read through its category.

        A read-only derivation on purpose: storing it here as well would create a
        second copy that a category edit could silently leave behind.
        """
        return self.category.kind if self.category_id else None


class SpeciesImage(GalleryImage):
    """A photo of a species - the first is its cover, the rest reference shots.

    These are the identification shots that belong to the *species* (a plumage
    variant, the underside of a leaf). Photos of one particular encounter belong
    to that ``journal.Sighting`` instead.
    """

    species = models.ForeignKey(
        Species,
        on_delete=models.CASCADE,
        related_name='images',
    )

    class Meta(GalleryImage.Meta):
        abstract = False
        verbose_name = 'Species Image'
        verbose_name_plural = 'Species Images'

    def __str__(self):
        return f'Image for {self.species} (#{self.sort_order})'


class Season(BasePicture):
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


class SeasonImage(GalleryImage):
    """A photo of a season. The first is the season's cover - see ``GalleryImage``."""

    season = models.ForeignKey(
        Season,
        on_delete=models.CASCADE,
        related_name='images',
    )

    class Meta(GalleryImage.Meta):
        abstract = False
        verbose_name = 'Season Image'
        verbose_name_plural = 'Season Images'

    def __str__(self):
        return f'Image for {self.season} (#{self.sort_order})'


class WeatherCondition(BasePicture):
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


class WeatherConditionImage(GalleryImage):
    """A photo of a weather condition. The first is its cover - see ``GalleryImage``."""

    weather_condition = models.ForeignKey(
        WeatherCondition,
        on_delete=models.CASCADE,
        related_name='images',
    )

    class Meta(GalleryImage.Meta):
        abstract = False
        verbose_name = 'Weather Condition Image'
        verbose_name_plural = 'Weather Condition Images'

    def __str__(self):
        return f'Image for {self.weather_condition} (#{self.sort_order})'


class Country(Common):
    """The country a state belongs to. The top of the geography chain.

    The same kind of row as ``State`` and ``County`` - a name pair, a slug, an
    order - and it exists for the same reason: so that "México" is typed once
    and then *chosen*. What it adds over the two below it is ``code``, the ISO
    3166-1 alpha-2 identifier, which is the one thing a country has that a slug
    does not express: a stable key an external data set (iNaturalist, GBIF) is
    already indexed by.

    Neither ``County`` nor ``Location`` points at this table. A place reaches its
    country the same way it reaches its state - by walking up
    (``location.county.state.country``) - so the three can never disagree. See
    ``County`` and ``Location.country``.
    """

    name = models.CharField(max_length=255)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    slug = models.SlugField(max_length=255, unique=True)

    # Nullable *and* unique, which Postgres and SQLite both read as "at most one
    # row per code, and any number with none" - a country whose code nobody has
    # filled in must not block the next one. Normalised to upper case in
    # `clean()`, and an empty string is stored as NULL rather than as a second
    # row colliding with every other blank.
    code = models.CharField(
        max_length=2, null=True, blank=True, unique=True,
        help_text='ISO 3166-1 alpha-2 code (US, MX). Optional, but unique when set.',
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Country'
        verbose_name_plural = 'Countries'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        # '' would be a value that violates `unique` on the second blank row, so
        # it is normalised away here rather than defended against at each caller.
        self.code = (self.code or '').strip().upper() or None


class State(Common):
    """A state (or province) a place sits in. A lookup table, not a content record.

    Deliberately one of the lightest models in this app: a name pair, a slug, an
    order and the country it belongs to. It exists for exactly one reason - so
    "Jalisco" is typed once and then *chosen*, instead of being re-typed as free
    text on every location and drifting into "jalisco", "Jalisco " and "Edo. de
    Jalisco". It has no description, no photographs and no page of its own; if it
    ever needs those it should become a picture model like the other four, not
    grow them here.

    ``Location`` does **not** point at this table. A place reaches its state
    through its county (``location.county.state``), which is what keeps the two
    from ever disagreeing - see ``County``.
    """

    name = models.CharField(max_length=255)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    slug = models.SlugField(max_length=255, unique=True)
    # Required and PROTECT, for the same reason `County.state` is: a state with
    # no country is the ambiguity this chain exists to remove (there is a Sonora
    # in Mexico and a Sonoma in California, a Durango in both countries), and
    # deleting a country still in use is refused rather than silently orphaning
    # every state under it. The API turns that ProtectedError into a 409.
    country = models.ForeignKey(
        Country,
        on_delete=models.PROTECT,
        related_name='states',
        help_text='The country this state belongs to. A location reaches its '
                  'country through here, two tables further up.',
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'State'
        verbose_name_plural = 'States'
        # Grouped under its country first, exactly as County is grouped under its
        # state - so a picker reads as the tree it is rather than one long list
        # mixing two countries' states together.
        ordering = ['country__sort_order', 'country__name', 'sort_order', 'name']

    def __str__(self):
        return f'{self.name}, {self.country.name}'


class County(Common):
    """A county (or municipality) within a ``State``. The unit a place is filed under.

    The FK is **required and PROTECT**: a county with no state would be the
    ambiguity this table exists to remove (there is a Los Angeles County in
    California and a León in both Guanajuato and Nicaragua), and deleting a
    state still used by one is refused rather than silently orphaning it - the
    API turns that ``ProtectedError`` into a readable 409, exactly as it does
    for a category that still has species.

    This is the only geography column ``Location`` stores. The state is read
    back through ``county.state`` - and the country through ``county.state
    .country`` - and both are flattened onto the payload, so the three cannot
    drift the way independent FKs would; the cost is that a place whose county is
    unknown carries neither a state nor a country.
    """

    name = models.CharField(max_length=255)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    slug = models.SlugField(max_length=255, unique=True)
    state = models.ForeignKey(
        State,
        on_delete=models.PROTECT,
        related_name='counties',
        help_text='The state this county belongs to. A location reaches its '
                  'state through here.',
    )
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'County'
        verbose_name_plural = 'Counties'
        ordering = [
            'state__country__sort_order', 'state__country__name',
            'state__sort_order', 'state__name', 'sort_order', 'name',
        ]

    def __str__(self):
        return f'{self.name}, {self.state.name}'

    @property
    def country(self):
        """The country this county is in, read through its state. Read-only.

        Same derivation as ``Location.state`` and ``Location.country``, and here
        for the same two callers: the Django admin's column, and the flattened
        ``country_*`` fields on ``CountySerializer``.
        """
        return self.state.country if self.state_id else None


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

    Not a picture model - its photographs live in ``LocationImage``, and the
    first of them is its cover, exactly as on the other four records. It carries
    the place's *default* coordinates; a sighting may override them with the
    exact spot (see ``journal.Sighting.coordinates``).
    """

    # Location is the one content model that is not a picture model, so it
    # repeats BasePicture's Spanish/English pairs rather than inheriting them.
    # See core.models.TRANSLATED_FIELDS for how the pair is read.
    name = models.CharField(max_length=255)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(null=True, blank=True)
    en_description = models.TextField(null=True, blank=True)
    short_description = models.TextField(null=True, blank=True)
    en_short_description = models.TextField(null=True, blank=True)

    # The map pin / filter chip glyph, exactly as on the other four records. The
    # photographs are LocationImage rows; this is the mark, and it has to stay
    # legible at 24 px.
    icon = icon_field()

    # No `image` column, deliberately - a place's cover is the first row of its
    # gallery, like every other record here (see
    # ``core.serializers.gallery_image_url``). It had one briefly, added in
    # `0010_location_image` for a "Main Image" picker that no longer exists and
    # dropped again in `0013_drop_main_image`; don't add it back without reading
    # that migration.

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

    # Where the place is administratively, as a *choice* rather than free text.
    # This replaced a pair of `region`/`country` CharFields: the same three
    # states were being re-typed on every location and no two spellings matched,
    # which made `?region=` filtering and the admin's own list filter useless.
    #
    # There is no `state` column beside it on purpose - the state is read
    # through `county.state`, so the two can never disagree. SET_NULL like
    # `parent`: merging a county away must not take the places filed under it.
    county = models.ForeignKey(
        County,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='locations',
        help_text='The county this place is in. Its state is read from here.',
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

    # ---- Contributions ------------------------------------------------------
    # Same two moderation fields Species carries, and for the same reason: a
    # place is a *shared* reference record with no observer to credit, so these
    # only record who proposed it and whether it is still waiting. A place is the
    # third thing the public flow can create - a contributor filing a sighting at
    # a pond nobody has catalogued has to be able to add the pond, or the entry
    # cannot be filed at all.
    created_by = models.ForeignKey(
        'auth.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contributed_locations',
        help_text='The account that proposed this place, for places filed '
                  'through the public contribute flow. Never published.',
    )
    is_contribution = models.BooleanField(
        default=False,
        help_text='Proposed through the public contribute flow rather than the '
                  'CMS. Such a place starts disabled and joins the catalog when '
                  'an administrator enables it.',
    )
    # See `core.models.was_published_field`.
    was_published = was_published_field()

    class Meta:
        verbose_name = 'Location'
        verbose_name_plural = 'Locations'
        ordering = ['sort_order', 'name']
        indexes = [
            # The contributor's own list - their places, pending ones included.
            models.Index(fields=['created_by']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # See Species.save - published from the CMS or the Django admin, neither
        # of which goes through the contribute layer.
        stamp_published(self)
        super().save(*args, **kwargs)

    @property
    def state(self):
        """The state this place is in, read through its county. Read-only.

        A derivation for the same reason ``Species.kind`` is one: a stored copy
        would be a second source of truth that editing the county could silently
        leave behind.
        """
        return self.county.state if self.county_id else None

    @property
    def country(self):
        """The country this place is in, read two tables up. Read-only.

        Same argument as ``state``, one link further: a place stores its county
        and nothing else, so moving that county to another state moves the place's
        state *and* its country with it and there is no third copy to correct.
        """
        state = self.state
        return state.country if state else None


class LocationImage(GalleryImage):
    """A photo of a place. The first is its cover - see ``GalleryImage``.

    Location used to be the one record with no ``image`` column to fall back
    from, which made the first row the only cover there was. It has one now, so
    this behaves like every other gallery here: first row unless a main image
    was chosen.
    """

    location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        related_name='images',
    )

    class Meta(GalleryImage.Meta):
        abstract = False
        verbose_name = 'Location Image'
        verbose_name_plural = 'Location Images'

    def __str__(self):
        return f'Image for {self.location} (#{self.sort_order})'
