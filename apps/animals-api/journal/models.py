"""
The journal: every individual encounter, and its photos and videos.

A ``Sighting`` is one entry in the field journal - this species, on this date, at
this place - and it is what the public site renders as a post. The stable records
it points at (species, location, season, weather) live in the `catalog` app.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from core.fields import ResizedImageField
from core.image_sizes import MEDIUM
from core.models import RegularPicture, picture, video


class Sighting(RegularPicture):
    """One recorded encounter with a catalogued subject.

    Inherits from RegularPicture, which provides:
      - Common:      enabled, created, modified, version
      - BasePicture: name, description, short_description, href, fit, background_color
      - RegularPicture: image (max 1200px) - the entry's cover photo

    ``name`` is the entry's optional title ("First fawn of the spring"); when it
    is blank the frontend falls back to the species name. ``description`` is the
    story, ``short_description`` the excerpt for the feed.
    """

    species = models.ForeignKey(
        'catalog.Species',
        on_delete=models.PROTECT,
        related_name='sightings',
        help_text='What was seen. PROTECT: a species with recorded sightings '
                  'cannot be deleted out from under them.',
    )
    slug = models.SlugField(max_length=255, unique=True)

    date = models.DateField(help_text='The day of the encounter.')
    time = models.TimeField(
        null=True, blank=True, help_text='Time of day, if it was noted.'
    )

    location = models.ForeignKey(
        'catalog.Location',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sightings',
    )
    # The exact spot, which is usually *not* the location's own centre point.
    # Left blank, the API falls back to the location's coordinates.
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    season = models.ForeignKey(
        'catalog.Season',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sightings',
        help_text='Filled from `date` on save when left blank - see save().',
    )
    weather = models.ForeignKey(
        'catalog.WeatherCondition',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sightings',
    )
    temperature_c = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
        help_text='Temperature in degrees Celsius.',
    )
    individuals = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text='How many were seen, if counted.'
    )

    is_featured = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Sighting'
        verbose_name_plural = 'Sightings'
        # Newest first: this is a journal feed, and `date` is the day it happened
        # (not the day it was typed up), which is the order a reader expects.
        ordering = ['-date', '-created']
        indexes = [
            models.Index(fields=['-date']),
            models.Index(fields=['species', '-date']),
        ]

    def __str__(self):
        return f'{self.species} on {self.date}'

    def save(self, *args, **kwargs):
        # Derive the season from the date when the author did not pick one. Only
        # ever *fills* a blank: an explicit choice is never overwritten, so an
        # unseasonably warm November day can be filed however the author wants.
        if self.season_id is None and self.date:
            from catalog.models import Season

            season = Season.for_date(self.date)
            if season is not None:
                self.season = season
        super().save(*args, **kwargs)

    @property
    def coordinates(self):
        """``(lat, lng)`` for this sighting, falling back to its location's, or None."""
        if self.latitude is not None and self.longitude is not None:
            return (self.latitude, self.longitude)
        if self.location_id and self.location.latitude is not None and self.location.longitude is not None:
            return (self.location.latitude, self.location.longitude)
        return None

    @property
    def coordinates_are_sensitive(self) -> bool:
        """Whether published coordinates must be blurred (see Location)."""
        return bool(self.location_id and self.location.hide_precise_location)


# What a media row actually holds. One model with a kind rather than three
# models, because a gallery is a single ordered list the author arranges - an
# uploaded clip may sit between two photos - and three tables cannot share one
# `sort_order` sequence.
MEDIA_KIND_CHOICES = [
    ('image', 'Image'),
    ('video', 'Video file'),
    ('link', 'Video link'),
]

# Which field each kind requires. Enforced in clean() (admin) and in the write
# serializer (API), so a row can never claim a kind whose payload is missing.
_REQUIRED_FIELD_FOR_KIND = {
    'image': 'image',
    'video': 'file',
    'link': 'url',
}


class SightingMedia(RegularPicture):
    """One photo, uploaded video, or video link in a sighting's gallery.

    Inherits RegularPicture, so `image` (max 1200px), `name` (the caption),
    `description`, `fit` and `background_color` all come for free; the extra
    fields below cover the two video kinds.
    """

    sighting = models.ForeignKey(
        Sighting,
        on_delete=models.CASCADE,
        related_name='media',
    )
    kind = models.CharField(max_length=8, choices=MEDIA_KIND_CHOICES, default='image')

    # kind='video' - an uploaded file. Multipart only: a video is far past
    # DATA_UPLOAD_MAX_MEMORY_SIZE, so it cannot ride in a base64 JSON body the
    # way every image in this project does.
    file = models.FileField(null=True, blank=True, upload_to=video)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    # Poster frame for either video kind. Without one a video tile in the feed
    # has nothing to paint before playback starts.
    poster = ResizedImageField(
        null=True,
        blank=True,
        max_size=[MEDIUM, None],
        quality=85,
        upload_to=picture,
    )

    # kind='link' - YouTube, Vimeo, or a direct video URL hosted elsewhere.
    url = models.URLField(max_length=500, null=True, blank=True)

    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Sighting Media'
        verbose_name_plural = 'Sighting Media'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.get_kind_display()} for {self.sighting_id} (#{self.sort_order})'

    def clean(self):
        super().clean()
        required = _REQUIRED_FIELD_FOR_KIND.get(self.kind)
        if required and not getattr(self, required, None):
            raise ValidationError({required: f'Required when kind is "{self.kind}".'})

    @property
    def source_url(self):
        """The one URL a player or an <img> should point at, whatever the kind."""
        if self.kind == 'link':
            return self.url or None
        if self.kind == 'video':
            return self.file.url if self.file else None
        return self.image.url if self.image else None


def round_coordinate(value, places=2):
    """Blur a coordinate to ~1 km, for locations flagged as sensitive.

    Two decimal places is roughly 1.1 km at the equator - enough to say which
    park, not enough to find the nest.
    """
    if value is None:
        return None
    return Decimal(value).quantize(Decimal('0.01'))
