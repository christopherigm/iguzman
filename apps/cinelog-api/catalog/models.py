import os
import uuid

from django.db import models

from core.models import Common


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
    ('other', 'Other'),
]

SCAN_STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('processing', 'Processing'),
    ('review', 'Awaiting Review'),
    ('accepted', 'Accepted'),
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
    barcode = models.CharField(max_length=20, unique=True, db_index=True)
    title = models.CharField(max_length=500)
    director = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES, blank=True)
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

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f'{self.title} ({self.year})'


class ScanQueue(Common):
    barcode = models.CharField(max_length=20, unique=True, db_index=True)
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
    retry_count = models.PositiveSmallIntegerField(default=0)
    error_message = models.TextField(blank=True)
    movie = models.OneToOneField(
        Movie,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='scan_queue_entry',
    )

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
    by `tmdb_id`. Rows are wiped when the entry is accepted, and cascade-deleted
    when it is rejected.
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
