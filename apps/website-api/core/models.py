import os
import uuid
from decimal import Decimal

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


FIT_CHOICES = [
    ("cover", "Cover"),
    ("contain", "Contain"),
    ("fill", "Fill"),
    ("scale-down", "Scale Down"),
    ("none", "None"),
]


CURRENCY_CHOICES = [
    ("USD", "US Dollar"),
    ("EUR", "Euro"),
    ("MXN", "Mexican Peso"),
    ("GBP", "British Pound"),
    ("CAD", "Canadian Dollar"),
    ("ARS", "Argentine Peso"),
    ("COP", "Colombian Peso"),
    ("CLP", "Chilean Peso"),
    ("BRL", "Brazilian Real"),
]


class BasePicture(Common):
    """
    Abstract base for all picture models.

    Provides display metadata (name, description, href) and CSS-layout hints
    (fit, background_color). Concrete size variants are produced by
    ``picture_mixin()``.
    """

    name = models.CharField(max_length=255, null=True, blank=True)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    en_description = models.TextField(null=True, blank=True)
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
        quality:   JPEG/WebP compression quality (1–95).

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
            max_size=[max_width, None], # type: ignore
            quality=quality, # type: ignore
            upload_to=picture,
        )

        class Meta:
            abstract = True

    _PictureMixin.__name__ = f"Picture{max_width}"
    _PictureMixin.__qualname__ = f"Picture{max_width}"
    return _PictureMixin


# Standard size tiers — use these directly or call picture_mixin() for custom sizes.
SmallPicture = picture_mixin(256)          # thumbnails, avatars
MediumPicture = picture_mixin(512)         # cards, previews
RegularPicture = picture_mixin(1200)       # content images, banners
LargePicture = picture_mixin(3840, quality=90)  # hero images, full-bleed


class Brand(Common):
    name = models.CharField(max_length=255, null=False, blank=False)
    slug = models.SlugField(max_length=255, unique=True)
    logo = models.ImageField(null=True, blank=True, upload_to=picture)

    class Meta:
        verbose_name = "Brand"
        verbose_name_plural = "Brands"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Buyable(RegularPicture):
    """
    Abstract base for all buyable items (products, services, meals, houses, cars).

    Inherits from RegularPicture which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - RegularPicture: image (max 1200px)
    """

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    brand = models.ForeignKey(
        "core.Brand",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # Pricing
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    compare_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="USD")

    class Meta:
        abstract = True


class System(Common):
    site_name = models.CharField(max_length=32, null=False, blank=False, default="Web Site")
    host = models.CharField(max_length=64, null=False, blank=False, default="127.0.0.1", unique=True)

    img_logo = models.ImageField(null=True, blank=True, upload_to=picture)
    img_logo_hero = models.ImageField(null=True, blank=True, upload_to=picture)
    img_favicon = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_1080 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_512 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_256 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_128 = models.ImageField(null=True, blank=True, upload_to=picture)

    img_hero = models.ImageField(null=True, blank=True, upload_to=picture)
    video_link = models.URLField(max_length=255, null=True, blank=True)
    primary_color = models.CharField(max_length=16, null=False, blank=False, default="#2196f3")
    secondary_color = models.CharField(max_length=16, null=False, blank=False, default="#e040fb")

    about = models.TextField(null=True, blank=True)
    en_about = models.TextField(null=True, blank=True)
    mission = models.TextField(null=True, blank=True)
    en_mission = models.TextField(null=True, blank=True)
    vision = models.TextField(null=True, blank=True)
    en_vision = models.TextField(null=True, blank=True)
    img_about = models.ImageField(null=True, blank=True, upload_to=picture)

    privacy_policy = models.TextField(null=True, blank=True)
    en_privacy_policy = models.TextField(null=True, blank=True)
    terms_and_conditions = models.TextField(null=True, blank=True)
    en_terms_and_conditions = models.TextField(null=True, blank=True)
    user_data = models.TextField(null=True, blank=True)
    en_user_data = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "System"
        verbose_name_plural = "Systems"

    def __str__(self):
        return f"{self.site_name} ({self.host})"
