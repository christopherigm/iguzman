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
            max_size=[max_width, None], # type: ignore
            quality=quality, # type: ignore
            upload_to=picture,
        )

        class Meta:
            abstract = True

    _PictureMixin.__name__ = f"Picture{max_width}"
    _PictureMixin.__qualname__ = f"Picture{max_width}"
    return _PictureMixin


# Standard size tiers - use these directly or call picture_mixin() for custom sizes.
SmallPicture = picture_mixin(256)               # thumbnails, avatars
MediumPicture = picture_mixin(512, quality=90)  # cards, previews
StandardPicture = picture_mixin(900)            # stories, highlights, buyables
RegularPicture = picture_mixin(1200)            # content images, banners
LargePicture = picture_mixin(3840, quality=90)  # hero images, full-bleed


class Brand(Common):
    name = models.CharField(max_length=255, null=False, blank=False)
    slug = models.SlugField(max_length=255, unique=True)
    logo = models.ImageField(null=True, blank=True, upload_to=picture)
    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="brands",
    )
    # Manual display order set by dragging rows in the admin CMS list. Every
    # existing row defaults to 0, so the alphabetical order below stays in
    # effect until someone actually re-arranges the list.
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Brand"
        verbose_name_plural = "Brands"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Buyable(StandardPicture):
    """
    Abstract base for all buyable items (products, services, meals, houses, cars).

    Inherits from RegularPicture which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - StandardPicture: image (max 900px)
    """

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
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

    # Manual display order set by dragging rows in the admin CMS list. Concrete
    # subclasses put it first in their `ordering` so the CMS arrangement is what
    # the customer sees; their old ordering field stays as the tiebreak, which
    # is what every row uses until it is dragged (they all default to 0).
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True


class SuccessStory(RegularPicture):
    """
    A company success story linked to a System.

    Inherits from RegularPicture (1200 px) which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - RegularPicture: image (max 1200 px)
    """

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="success_stories",
    )
    slug = models.SlugField(max_length=255, unique=True, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Success Story"
        verbose_name_plural = "Success Stories"
        ordering = ["sort_order", "-created"]

    def __str__(self):
        return self.name or f"Story #{self.pk}"


class SuccessStoryImage(StandardPicture):
    """Additional gallery images for a success story."""

    story = models.ForeignKey(
        SuccessStory,
        on_delete=models.CASCADE,
        related_name="images",
        null=True,
        blank=True,
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Success Story Image"
        verbose_name_plural = "Success Story Images"
        ordering = ["sort_order"]

    def __str__(self):
        return f"Image for {self.story} (#{self.sort_order})"


class CompanyHighlight(RegularPicture):
    """
    A company highlight / spec entry linked to a System.

    Examples: "Pioneering Hardware", "AI-Powered Navigation", pilot certifications,
    tech features, fleet specs. Supports optional sub-items (CompanyHighlightItem)
    for nested specs or feature icons.
    """

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="highlights",
    )
    SIZE_CHOICES = [
        ("sm", "Small"),
        ("md", "Medium"),
        ("lg", "Large"),
        ("xl", "Extra Large"),
    ]

    category = models.CharField(max_length=128, null=True, blank=True)
    en_category = models.CharField(max_length=128, null=True, blank=True)
    icon = models.CharField(max_length=512, null=True, blank=True)
    size = models.CharField(max_length=4, choices=SIZE_CHOICES, default="md")
    slug = models.SlugField(max_length=255, unique=True, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Company Highlight"
        verbose_name_plural = "Company Highlights"
        ordering = ["sort_order", "-created"]

    def __str__(self):
        return self.name or f"Highlight #{self.pk}"


class CompanyHighlightItem(SmallPicture):
    """A sub-element (spec, feature icon) belonging to a CompanyHighlight."""

    highlight = models.ForeignKey(
        CompanyHighlight,
        on_delete=models.CASCADE,
        related_name="items",
    )
    icon = models.CharField(max_length=512, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Company Highlight Item"
        verbose_name_plural = "Company Highlight Items"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name or f"Item #{self.pk}"


class System(Common):
    site_name = models.CharField(max_length=32, null=False, blank=False, default="Web Site")
    site_description = models.TextField(null=True, blank=True)
    en_site_description = models.TextField(null=True, blank=True)
    host = models.CharField(max_length=64, null=False, blank=False, default="127.0.0.1", unique=True)

    img_logo = models.ImageField(null=True, blank=True, upload_to=picture)
    img_logo_hero = models.ImageField(null=True, blank=True, upload_to=picture)
    img_favicon = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_1080 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_512 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_256 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_192 = models.ImageField(null=True, blank=True, upload_to=picture)
    img_manifest_128 = models.ImageField(null=True, blank=True, upload_to=picture)

    img_hero = models.ImageField(null=True, blank=True, upload_to=picture)
    video_link = models.URLField(max_length=255, null=True, blank=True)
    slogan = models.CharField(max_length=255, null=True, blank=True, default="Company slogan")
    primary_color = models.CharField(max_length=16, null=False, blank=False, default="#2196f3")
    secondary_color = models.CharField(max_length=16, null=False, blank=False, default="#e040fb")

    about = models.TextField(null=True, blank=True)
    en_about = models.TextField(null=True, blank=True)
    mission = models.TextField(null=True, blank=True)
    en_mission = models.TextField(null=True, blank=True)
    vision = models.TextField(null=True, blank=True)
    en_vision = models.TextField(null=True, blank=True)
    img_about = models.ImageField(null=True, blank=True, upload_to=picture)

    highlights_bg = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text=(
            "CSS background value for the Company Highlights section "
            "(e.g. 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' "
            "or a solid color). Defaults to a gradient from primary/secondary colors."
        ),
    )
    highlights_title = models.CharField(max_length=255, null=True, blank=True)
    en_highlights_title = models.CharField(max_length=255, null=True, blank=True)
    highlights_subtitle = models.TextField(null=True, blank=True)
    en_highlights_subtitle = models.TextField(null=True, blank=True)

    catalog_items_bg = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text=(
            "CSS background value for the Catalog Items section "
            "(e.g. 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' "
            "or a solid color). Defaults to transparent."
        ),
    )

    privacy_policy = models.TextField(null=True, blank=True)
    en_privacy_policy = models.TextField(null=True, blank=True)
    terms_and_conditions = models.TextField(null=True, blank=True)
    en_terms_and_conditions = models.TextField(null=True, blank=True)
    user_data = models.TextField(null=True, blank=True)
    en_user_data = models.TextField(null=True, blank=True)

    # ── Stripe ────────────────────────────────────────────────────────────────
    # Each System is a separate business and connects its *own* Stripe account,
    # so there is no project-wide key: the credentials live here, per tenant.
    # The two secrets are stored as Fernet ciphertext (see core.crypto) because,
    # unlike a password, we must be able to read them back - one to call Stripe
    # as this tenant, the other to verify the signature on its webhooks.
    stripe_enabled = models.BooleanField(
        default=False,
        help_text="Whether this site can take payments. Checkout refuses unless this is on AND both Stripe secrets are set.",
    )
    # Publishable by design (Stripe intends it to be shipped to browsers), so it
    # is stored in the clear. Unused by the hosted-Checkout flow; kept because a
    # tenant pastes it alongside the secret key and Elements would need it.
    stripe_publishable_key = models.CharField(max_length=255, blank=True, default="")
    # Fernet ciphertext - decrypted only server-side, never serialized back out.
    stripe_secret_key_encrypted = models.TextField(blank=True, default="")
    stripe_webhook_secret_encrypted = models.TextField(blank=True, default="")
    # Names this tenant in its own Stripe webhook URL, in place of the pk.
    #
    # Opaque and immutable, and both halves matter. Opaque, so handing a tenant
    # the endpoint to paste into their dashboard does not also hand them another
    # tenant's addressable id. Immutable, so it cannot be `host`: host is
    # editable on the admin page, and a tenant renaming their domain would
    # silently unhook the endpoint Stripe delivers to - payments would stop being
    # confirmed and orders would sit pending forever, with nothing in the logs to
    # say why (Stripe's retries would 404 against an id nobody looks at).
    stripe_webhook_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    class Meta:
        verbose_name = "System"
        verbose_name_plural = "Systems"

    def __str__(self):
        return f"{self.site_name} ({self.host})"

    def set_stripe_secret_key(self, raw_secret: str) -> None:
        """Encrypt and store the plaintext Stripe secret key ('' clears it)."""
        from core.crypto import encrypt
        self.stripe_secret_key_encrypted = encrypt(raw_secret) if raw_secret else ""

    def set_stripe_webhook_secret(self, raw_secret: str) -> None:
        """Encrypt and store the plaintext webhook signing secret ('' clears it)."""
        from core.crypto import encrypt
        self.stripe_webhook_secret_encrypted = encrypt(raw_secret) if raw_secret else ""

    @property
    def stripe_secret_key(self) -> str:
        """Decrypt and return the plaintext Stripe secret key (server-side only)."""
        from core.crypto import decrypt
        if not self.stripe_secret_key_encrypted:
            return ""
        return decrypt(self.stripe_secret_key_encrypted)

    @property
    def stripe_webhook_secret(self) -> str:
        """Decrypt and return the plaintext webhook signing secret (server-side only)."""
        from core.crypto import decrypt
        if not self.stripe_webhook_secret_encrypted:
            return ""
        return decrypt(self.stripe_webhook_secret_encrypted)

    @property
    def stripe_configured(self) -> bool:
        """Whether checkout can run: switched on and both secrets present.

        The webhook secret counts because without it a payment can never be
        confirmed - the order would sit pending forever - so a site missing it is
        not "partly working", it is broken in a way that takes money first.
        """
        return bool(
            self.stripe_enabled
            and self.stripe_secret_key_encrypted
            and self.stripe_webhook_secret_encrypted
        )
