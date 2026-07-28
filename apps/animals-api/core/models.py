import os
import uuid

from colorfield.fields import ColorField
from django.db import models

from core.fields import ResizedImageField


class Common(models.Model):
    enabled = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True


def picture(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip(".") or "jpg"
    return f"pictures/{instance.__class__.__name__.lower()}/{uuid.uuid4().hex}.{ext}"


def video(instance, filename):
    """Upload path for uploaded video files (see ``journal.SightingMedia``).

    Kept separate from ``picture`` so a bucket lifecycle rule or a CDN cache
    policy can address the (much larger, much rarer) video objects on their own.
    """
    ext = os.path.splitext(filename)[1].lstrip(".").lower() or "mp4"
    return f"videos/{instance.__class__.__name__.lower()}/{uuid.uuid4().hex}.{ext}"


FIT_CHOICES = [
    ("cover", "Cover"),
    ("contain", "Contain"),
    ("fill", "Fill"),
    ("scale-down", "Scale Down"),
    ("none", "None"),
]


# ── Bilingual content ────────────────────────────────────────────────────────
# Every authored text field comes in a pair: the bare field is **Spanish** and
# its `en_` twin is **English**, exactly as in website-api's `BasePicture`.
#
# The frontend ships five locales (en, es, de, fr, pt) but only two are stored,
# and that is deliberate: `es` reads the bare field, every other locale reads
# `en_*` and falls back to the bare field when the translation is blank. A
# de/fr/pt reader therefore sees English, never an empty card. The API publishes
# **both** members of each pair raw and lets the frontend pick - it does not
# resolve a locale itself, because these payloads are cached under one key per
# resource and a per-locale variant would be written into that same key and then
# served to the next reader in the wrong language. (The same reasoning as
# `Location.hide_precise_location`; see this app's CLAUDE.md.)
#
# `TRANSLATED_FIELDS` names the pairs once so serializers, the admin and the AI
# translate endpoint can iterate them instead of repeating the list.
TRANSLATED_FIELDS = ("name", "description", "short_description")

# The `en_` twin of each. Kept as a tuple so a field list can splat it.
EN_FIELDS = tuple(f"en_{f}" for f in TRANSLATED_FIELDS)


class BasePicture(Common):
    """
    Abstract base for all picture models.

    Provides display metadata (name, description, href) and CSS-layout hints
    (fit, background_color). Concrete size variants are produced by
    ``picture_mixin()``.

    Each authored text field is a Spanish/English pair - see TRANSLATED_FIELDS
    above for how the two relate and why the API serves both.
    """

    name = models.CharField(max_length=255, null=True, blank=True)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    en_description = models.TextField(null=True, blank=True)
    # The one-or-two-line version used on cards and list rows, where the full
    # `description` would not fit. Lives here rather than on each concrete model
    # because every catalog record in this project needs both lengths.
    short_description = models.TextField(null=True, blank=True)
    en_short_description = models.TextField(null=True, blank=True)
    href = models.URLField(max_length=255, null=True, blank=True)
    fit = models.CharField(
        max_length=16,
        choices=FIT_CHOICES,
        default="cover",
        null=True,
        blank=True,
    )
    background_color = ColorField(null=True, blank=True, default="#fff")

    class Meta:
        abstract = True


def picture_mixin(max_width: int, quality: int = 85):
    """
    Factory that returns an abstract Picture mixin for the given size tier.

    Args:
        max_width: Maximum image width in pixels. Height scales proportionally.
        quality:   JPEG/WebP compression quality (1-95).

    Usage::

        class ProductThumbnail(picture_mixin(256)):
            product = models.ForeignKey("Product", on_delete=models.CASCADE)

        class BlogPost(picture_mixin(1200)):
            title = models.CharField(max_length=255)
    """

    class _PictureMixin(BasePicture):
        image = ResizedImageField(
            null=True,
            blank=True,
            max_size=[max_width, None],
            quality=quality,
            upload_to=picture,
        )

        class Meta:
            abstract = True

    _PictureMixin.__name__ = f"Picture{max_width}"
    _PictureMixin.__qualname__ = f"Picture{max_width}"
    return _PictureMixin


# Standard size tiers - use these directly or call picture_mixin() for custom sizes.
SmallPicture   = picture_mixin(256)          # thumbnails, avatars
MediumPicture  = picture_mixin(512)          # cards, previews
RegularPicture = picture_mixin(1200)         # content images, banners
LargePicture   = picture_mixin(3840, quality=90)  # hero images, full-bleed
