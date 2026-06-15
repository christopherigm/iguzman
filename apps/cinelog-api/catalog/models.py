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


class Movie(Common):
    barcode = models.CharField(max_length=20, unique=True, db_index=True)
    title = models.CharField(max_length=500)
    director = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    format = models.CharField(max_length=10, choices=FORMAT_CHOICES, blank=True)
    cover_url = models.URLField(max_length=1000, blank=True)
    cover_image = models.ImageField(upload_to=_movie_cover_path, null=True, blank=True)
    tmdb_id = models.CharField(max_length=20, blank=True)
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
