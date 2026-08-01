"""
The journal: every individual encounter, and its photos and videos.

A ``Sighting`` is one entry in the field journal - this species, on this date, at
this place - and it is what the public site renders as a post. The stable records
it points at (species, location, season, weather) live in the `catalog` app.
"""

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from core.fields import ResizedImageField
from core.image_sizes import MEDIUM
from core.models import RegularPlusPicture, picture, video


class Sighting(RegularPlusPicture):
    """One recorded encounter with a catalogued subject.

    Inherits from RegularPlusPicture, which provides:
      - Common:      enabled, created, modified, version
      - BasePicture: name, description, short_description, href, fit, background_color
      - RegularPlusPicture: image (max 2560px, quality 90) - the entry's cover photo

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

    # ---- Who filed it -------------------------------------------------------
    # `created_by` is now *both* things: the audit trail, and the source of the
    # credit line the public site prints under the entry. There is no stored
    # `author_name` any more - the read serializer derives the credit from this
    # account's `first_name`, so an account that corrects its own name corrects
    # every entry it filed, and no free-text name can drift from the account that
    # actually filed it.
    #
    # The FK itself is still never published: what leaves this API is a first
    # name, never an id, an email or a username.
    created_by = models.ForeignKey(
        'auth.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contributed_sightings',
        help_text='The account that filed this entry, and whose first name is '
                  'published as the credit line. Null for entries authored in '
                  'the CMS and for any whose author was deleted - those carry no '
                  'credit line at all.',
    )
    author_anonymous = models.BooleanField(
        default=False,
        help_text="Withhold the credit line. The account is still recorded - this "
                  "only stops the contributor's first name being published.",
    )

    # ---- Moderation ---------------------------------------------------------
    # A contribution is created with `enabled=False`, exactly like an unpublished
    # draft, so it is invisible to the public list and detail endpoints with no
    # second visibility rule to keep in step. This flag records *why* it is off:
    # a contribution awaiting review, rather than an author's own work in
    # progress, which is what lets the CMS list the queue.
    is_contribution = models.BooleanField(
        default=False,
        help_text='Filed through the public contribute flow rather than the CMS. '
                  'Such an entry starts disabled and is published by an '
                  'administrator enabling it.',
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
            # What a contributor's own list is read by - their entries, newest
            # first, including the pending ones no public feed will show them.
            models.Index(fields=['created_by', '-date']),
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
#
# ⚠ A `video` row is the one kind that exists *before* its required field does:
# the handler creates the row, then uploads and transcodes, then attaches the
# file. So `clean()` skips the check while the row is still being processed -
# see `PROCESSING_STATUS_CHOICES` below.
_REQUIRED_FIELD_FOR_KIND = {
    'image': 'image',
    'video': 'file',
    'link': 'url',
}


# Where an uploaded clip is in the transcode pipeline. Only `kind='video'` ever
# leaves `ready`: a photo and a link have nothing to process, so they are born
# finished - which is also why `ready` is the default and every row that predates
# this is already correct.
#
# The work happens in `apps/animals` (Next.js), not here: it receives the upload
# in chunks onto its own disk, runs ffmpeg, uploads the result to R2 and PATCHes
# the row through `.../media/<pk>/processing/`. This API only records where that
# got to.
PROCESSING_PENDING = 'pending'
PROCESSING_PROCESSING = 'processing'
PROCESSING_READY = 'ready'
PROCESSING_FAILED = 'failed'

PROCESSING_STATUS_CHOICES = [
    (PROCESSING_PENDING, 'Awaiting upload'),
    (PROCESSING_PROCESSING, 'Transcoding'),
    (PROCESSING_READY, 'Ready'),
    (PROCESSING_FAILED, 'Failed'),
]

# The two states a handler is expected to move out of. A row sitting in either
# for longer than the timeout below has lost the pod that was working on it.
PROCESSING_IN_FLIGHT = {PROCESSING_PENDING, PROCESSING_PROCESSING}


class SightingMedia(RegularPlusPicture):
    """One photo, uploaded video, or video link in a sighting's gallery.

    Inherits RegularPlusPicture, so `image` (max 2560px at quality 90), `name`
    (the caption), `description`, `fit` and `background_color` all come for free;
    the extra fields below cover the two video kinds.

    The `poster` below stays at MEDIUM deliberately: it is the frame painted
    behind a play button before the clip starts, never a picture a reader opens.
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

    # ── Transcode state (kind='video' only) ──────────────────────────────────
    # `ready` by default so a photo, a link, and every row written before this
    # existed are all correct without a data migration.
    processing_status = models.CharField(
        max_length=12,
        choices=PROCESSING_STATUS_CHOICES,
        default=PROCESSING_READY,
    )
    # Why a transcode failed, as a short **code** the frontend translates -
    # `too_long`, `too_large`, `unsupported_format`, `probe_failed`,
    # `encode_failed`, `upload_failed`, `abandoned`.
    #
    # ⚠ Deliberately not ffmpeg's stderr. This payload is cached under one key
    # and served to every caller, staff or not (the `hide_precise_location`
    # trap), so whatever lands here is public - and stderr carries absolute
    # paths from inside the pod. The handler maps its failure to one of these
    # and logs the detail on its own side.
    processing_error = models.CharField(max_length=32, null=True, blank=True)

    # Filled by the handler from the *output* file, not the source, so they
    # describe what a reader will actually download.
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    # PositiveBigInteger: a source clip is capped at 3 GB, which overflows the
    # 2.1 GB ceiling of a plain PositiveInteger.
    size_bytes = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        verbose_name = 'Sighting Media'
        verbose_name_plural = 'Sighting Media'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.get_kind_display()} for {self.sighting_id} (#{self.sort_order})'

    def clean(self):
        super().clean()
        # A video row is created before its file exists - the handler uploads and
        # transcodes afterwards - so the requirement only applies once it claims
        # to be finished.
        if self.kind == 'video' and self.processing_status in PROCESSING_IN_FLIGHT:
            return
        required = _REQUIRED_FIELD_FOR_KIND.get(self.kind)
        if required and not getattr(self, required, None):
            raise ValidationError({required: f'Required when kind is "{self.kind}".'})

    @property
    def effective_processing_status(self):
        """``processing_status``, with an abandoned job reported as failed.

        The handler is an ordinary Next.js pod with the raw upload on its own
        local disk, so a rollout, an OOM or a node drain takes the job with it and
        nothing is left to write ``failed``. There is no worker or scheduler in
        this project to sweep for that, so the sweep is **derived at read time**:
        a row still in flight past ``VIDEO_PROCESSING_TIMEOUT_MINUTES`` is
        reported as failed without being written.

        Not a stored transition on purpose - it needs no cron, and it corrects
        itself if the pod comes back and finishes late.
        """
        if self.processing_status not in PROCESSING_IN_FLIGHT:
            return self.processing_status
        limit = timezone.now() - timedelta(minutes=settings.VIDEO_PROCESSING_TIMEOUT_MINUTES)
        if self.modified and self.modified < limit:
            return PROCESSING_FAILED
        return self.processing_status

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
