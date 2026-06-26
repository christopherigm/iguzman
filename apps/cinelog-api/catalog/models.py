import os
import uuid

from django.contrib.auth.models import User
from django.db import models

from core.models import Common

from .vocab import (
    AUDIO_FORMAT_CHOICES,
    HDR_FORMAT_CHOICES,
    LANGUAGE_CHOICES,
)


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Actor(models.Model):
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


FORMAT_CHOICES = [
    ('dvd', 'DVD'),
    ('bluray', 'Blu-ray'),
    ('4k', '4K UHD'),
    ('digital', 'Digital'),
    ('other', 'Other'),
]


class Format(models.Model):
    """
    Physical release format (DVD, Blu-ray, 4K UHD, ...).

    A small fixed lookup table seeded from FORMAT_CHOICES (see the 0008 data
    migration). Modelled as a table rather than an inline enum so a Movie can
    carry several formats via a clean M2M, and each Barcode can point at the one
    format that specific physical release was pressed in.
    """

    code = models.CharField(max_length=10, unique=True, choices=FORMAT_CHOICES)
    label = models.CharField(max_length=50)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return self.label


class AudioFormat(models.Model):
    """
    A disc audio track format (Dolby Atmos, DTS:X, ...).

    A small controlled-vocabulary lookup table seeded from
    ``vocab.AUDIO_FORMAT_CHOICES`` (see the 0009 data migration). Modelled as a
    table - rather than an inline enum - so a Movie carries its formats via a
    clean M2M the catalog can filter on, and the set stays free of near-duplicate
    spellings.
    """

    code = models.CharField(max_length=20, unique=True, choices=AUDIO_FORMAT_CHOICES)
    label = models.CharField(max_length=50)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return self.label


class HdrFormat(models.Model):
    """
    A disc dynamic-range format (Dolby Vision, HDR10, HDR10+, HLG, SDR).

    Controlled-vocabulary lookup seeded from ``vocab.HDR_FORMAT_CHOICES``;
    same rationale as :class:`AudioFormat`.
    """

    code = models.CharField(max_length=20, unique=True, choices=HDR_FORMAT_CHOICES)
    label = models.CharField(max_length=50)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return self.label


class SpokenLanguage(models.Model):
    """
    A language a disc carries an audio track in (ISO 639-1 code + English name).

    Controlled-vocabulary lookup seeded from ``vocab.LANGUAGE_CHOICES``. Kept as
    its own table (separate from :class:`SubtitleLanguage`) so audio and subtitle
    coverage can be filtered independently.
    """

    code = models.CharField(max_length=10, unique=True, choices=LANGUAGE_CHOICES)
    name = models.CharField(max_length=60)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class SubtitleLanguage(models.Model):
    """
    A language a disc carries subtitles in (ISO 639-1 code + English name).

    Controlled-vocabulary lookup seeded from ``vocab.LANGUAGE_CHOICES``; a sibling
    of :class:`SpokenLanguage` so the two can be filtered independently.
    """

    code = models.CharField(max_length=10, unique=True, choices=LANGUAGE_CHOICES)
    name = models.CharField(max_length=60)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


SCAN_STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('processing', 'Processing'),
    ('review', 'Awaiting Review'),
    ('failed', 'Failed'),
]


def _movie_cover_path(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'movies/covers/{uuid.uuid4().hex}.{ext}'


def _scan_cover_path(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'scan_queue/covers/{uuid.uuid4().hex}.{ext}'


def _movie_backdrop_path(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'movies/backdrops/{uuid.uuid4().hex}.{ext}'


def _scan_backdrop_path(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'scan_queue/backdrops/{uuid.uuid4().hex}.{ext}'


class Movie(Common):
    title = models.CharField(max_length=500)
    director = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    # The set of formats this title is available in - the union of its barcodes'
    # formats, but also directly editable so a Movie can advertise a format it
    # has no scanned barcode for yet. The barcode (a specific physical release)
    # is decoupled onto `Barcode` so one title can carry the DVD, Blu-ray and 4K
    # UPCs of different editions.
    formats = models.ManyToManyField(Format, blank=True, related_name='movies')
    cover_url = models.URLField(max_length=1000, blank=True)
    cover_image = models.ImageField(upload_to=_movie_cover_path, null=True, blank=True)
    # Stored wide backdrop/wallpaper bytes - downloaded so the page background
    # survives the source URL (TMDB or web) going away.
    backdrop_image = models.ImageField(upload_to=_movie_backdrop_path, null=True, blank=True)
    tmdb_id = models.CharField(max_length=20, blank=True)
    # Plot summary shown on the detail page (TMDB overview, web/LLM fallback).
    synopsis = models.TextField(blank=True)
    # YouTube watch URL for the film's official trailer.
    trailer_url = models.URLField(max_length=500, blank=True)
    genres = models.ManyToManyField(Category, blank=True, related_name='movies')
    cast = models.ManyToManyField(Actor, blank=True, related_name='movies')
    # Disc technical specs (best-effort, scraped + LLM-normalized). Modelled as
    # M2Ms onto controlled-vocabulary lookups so the catalog can filter by audio
    # format, HDR support, and audio / subtitle language coverage.
    audio_formats = models.ManyToManyField(AudioFormat, blank=True, related_name='movies')
    hdr_formats = models.ManyToManyField(HdrFormat, blank=True, related_name='movies')
    spoken_languages = models.ManyToManyField(SpokenLanguage, blank=True, related_name='movies')
    subtitle_languages = models.ManyToManyField(SubtitleLanguage, blank=True, related_name='movies')

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f'{self.title} ({self.year})'


class Barcode(models.Model):
    """
    A single physical release's UPC, tied to its Movie.

    Decoupled from Movie so the same film can hold the distinct barcodes of its
    DVD, Blu-ray and 4K editions. `code` stays globally unique (a barcode
    identifies exactly one product worldwide); `format` records which format
    that product was pressed in.
    """

    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='barcodes')
    code = models.CharField(max_length=20, unique=True, db_index=True)
    format = models.ForeignKey(
        Format, on_delete=models.SET_NULL, null=True, blank=True, related_name='barcodes'
    )

    class Meta:
        ordering = ['code']

    def __str__(self):
        return self.code


class MovieOwnership(models.Model):
    """
    Links a user to a Movie they added/own (one row per user per movie).

    Ownership gates editing and deleting a movie: an owner may edit it freely
    and "delete" it (which only drops their ownership, leaving the shared Movie
    in the catalog), while non-owners get a read-only view. Many users can own
    the same Movie. `barcode` records the physical copy that established the
    ownership (nullable - a legacy or barcode-less ownership is allowed).
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='movie_ownerships')
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name='ownerships')
    barcode = models.ForeignKey(
        Barcode, on_delete=models.SET_NULL, null=True, blank=True, related_name='ownerships'
    )
    # Private link to this user's own digital copy of the movie (a YouTube,
    # Prime, etc. URL they purchased). Per-user and visible only to its owner -
    # it rides on the ownership row, never on the shared Movie. Blank when the
    # user owns the title on disc only.
    digital_copy_url = models.URLField(max_length=1000, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'movie')]
        ordering = ['-created']

    def __str__(self):
        return f'{self.user} owns {self.movie_id}'


class ScanQueue(Common):
    # The user who scanned this barcode. The Inbox is per-user (each owner only
    # reviews their own scans), and accepting an entry grants ownership to this
    # user. Nullable for legacy rows scanned before ownership existed.
    scanned_by = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True, related_name='scan_queue_entries'
    )
    # Not unique: two users may independently scan the same unknown barcode and
    # each gets their own review entry (per-user inbox).
    barcode = models.CharField(max_length=20, db_index=True)
    status = models.CharField(
        max_length=20, choices=SCAN_STATUS_CHOICES, default='pending', db_index=True
    )
    raw_scraped_text = models.TextField(blank=True)
    extracted_title = models.CharField(max_length=500, blank=True)
    extracted_director = models.CharField(max_length=255, blank=True)
    extracted_year = models.PositiveSmallIntegerField(null=True, blank=True)
    extracted_cast = models.JSONField(default=list, blank=True)
    extracted_genres = models.JSONField(default=list, blank=True)
    extracted_tmdb_id = models.CharField(max_length=20, blank=True)
    extracted_cover_url = models.URLField(max_length=1000, blank=True)
    extracted_cover_image = models.ImageField(upload_to=_scan_cover_path, null=True, blank=True)
    # Wallpaper carried through review; copied onto the Movie on accept.
    extracted_backdrop_image = models.ImageField(upload_to=_scan_backdrop_path, null=True, blank=True)
    # Plot summary + trailer resolved during review; copied onto the Movie on accept.
    extracted_synopsis = models.TextField(blank=True)
    extracted_trailer_url = models.URLField(max_length=500, blank=True)
    # Disc technical specs resolved during review; copied onto the Movie on accept.
    # Audio / HDR are stored as canonical codes (the UI button keys); languages as
    # their English names (like extracted_genres), so the comma-list inputs work.
    extracted_audio_formats = models.JSONField(default=list, blank=True)
    extracted_hdr_formats = models.JSONField(default=list, blank=True)
    extracted_spoken_languages = models.JSONField(default=list, blank=True)
    extracted_subtitle_languages = models.JSONField(default=list, blank=True)
    retry_count = models.PositiveSmallIntegerField(default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return f'ScanQueue({self.barcode}) - {self.get_status_display()}'


class ScanCandidate(models.Model):
    """
    A single TMDB search result offered as an alternative match for a queued
    barcode (Phase 5.4).

    TMDB ranks `/search/movie` by popularity, so a bare title query can bury the
    right film beneath a more famous near-namesake (e.g. "X" 2022 vs "Fast X"
    2023). During slow-path resolution we persist the top few results here so the
    Inbox can render a picker and let the user re-pin the entry to the exact film
    by `tmdb_id`. Rows cascade-deleted with the entry, which happens both when it
    is accepted (promoted to a Movie) and when it is rejected.
    """

    entry = models.ForeignKey(
        ScanQueue,
        on_delete=models.CASCADE,
        related_name='candidates',
    )
    tmdb_id = models.CharField(max_length=20)
    title = models.CharField(max_length=500)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    cover_url = models.URLField(max_length=1000, blank=True)
    # Short plot blurb from the search result - the key signal a user needs to
    # tell two similarly-titled films apart at a glance.
    overview = models.TextField(blank=True)
    # Preserves TMDB's popularity ranking so the picker lists them in order.
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order']

    def __str__(self):
        return f'{self.title} ({self.year}) [{self.tmdb_id}]'
