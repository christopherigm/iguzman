import os
import uuid
from urllib.parse import urlparse

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
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


# ── Site settings ────────────────────────────────────────────────────────────
#
# ⚠ `System` here is **not** website-api's `System`, and the difference is the
# whole point of this project's tenancy note. There it is the tenant: every row
# in the database FKs to one, and a request resolves which by host. Here it is a
# **singleton** holding this one site's name and brand kit - nothing points at
# it, there is no `host`, and `objects.get_or_create(pk=1)` is the only way it is
# ever fetched. It exists because the CMS in `apps/animals` needs somewhere to
# put the site name, the logos and the palette; it does not reintroduce
# multi-tenancy, and no content model may grow a FK to it.

# The only hosts a `google_font_url` may point at. The value is rendered by the
# frontend into a `<link rel="stylesheet">` in the document head, so it is not
# merely data: an arbitrary URL would let whoever can edit this row pull a
# stylesheet from any origin into every page of the site. Google serves the CSS
# from fonts.googleapis.com and the binaries from fonts.gstatic.com; only the
# first is ever the stylesheet, but both are allowed so a pasted gstatic URL
# fails loudly at validation rather than silently rendering nothing.
GOOGLE_FONT_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")


def validate_google_font_url(value: str) -> None:
    """Allow only a Google Fonts URL - see GOOGLE_FONT_HOSTS for why."""
    if not value:
        return
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in GOOGLE_FONT_HOSTS:
        raise ValidationError(
            "Must be an https URL on %s." % " or ".join(GOOGLE_FONT_HOSTS)
        )


def brand_image(instance, filename):
    """Upload path for the site's brand assets.

    Separate from ``picture`` so the handful of files that appear on *every*
    page (logo, favicon, manifest icons) share one prefix a CDN cache rule can
    address, rather than being scattered through the journal's photographs.
    """
    ext = os.path.splitext(filename)[1].lstrip(".") or "png"
    return f"site/{uuid.uuid4().hex}.{ext}"


class System(Common):
    """This site's name, contact details and brand kit. Exactly one row.

    Authored in ``apps/animals``' CMS at ``/admin/system`` (the identity half)
    and ``/admin/logos-and-styles`` (the brand half). Both pages PATCH, and each
    sends only the keys it owns, so having both open cannot clobber the other.
    """

    # ── Identity ──────────────────────────────────────────────────────────────
    site_name = models.CharField(max_length=64, default="Field Journal")
    # The bare field is Spanish and its `en_` twin English, the same pairing as
    # every content model here - see TRANSLATED_FIELDS above.
    site_description = models.TextField(null=True, blank=True)
    en_site_description = models.TextField(null=True, blank=True)

    # ── Contact ───────────────────────────────────────────────────────────────
    # Published on purpose: this is how a reader reaches the journal's author,
    # and it appears on the AllowAny GET. It is business contact information, not
    # a user's PII.
    contact_email = models.EmailField(max_length=254, null=True, blank=True)
    social_links = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            'Ordered social links, e.g. '
            '[{"platform": "instagram", "url": "https://instagram.com/acme"}]. '
            'A JSON list rather than a column per network, so adding or '
            'reordering platforms needs no migration.'
        ),
    )

    # ── Brand images ──────────────────────────────────────────────────────────
    # All plain ImageFields: the write serializer's tier is what actually sizes
    # an API upload (ResizedImageField.pre_save never runs on one - see
    # website-api's CLAUDE.md "Image sizes"), so declaring a tier here would be a
    # second number to keep in step for no effect.
    img_logo = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_logo_hero = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_favicon = models.ImageField(null=True, blank=True, upload_to=brand_image)
    # A small mark distinct from the full logo, for cards and for the page
    # watermark (see `watermark_show_brandmark`).
    img_brandmark = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_about = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_hero = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_manifest_1080 = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_manifest_512 = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_manifest_256 = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_manifest_192 = models.ImageField(null=True, blank=True, upload_to=brand_image)
    img_manifest_128 = models.ImageField(null=True, blank=True, upload_to=brand_image)

    # ── Palette ───────────────────────────────────────────────────────────────
    primary_color = models.CharField(max_length=16, default="#06b6d4")
    secondary_color = models.CharField(max_length=16, default="#7c9a3f")

    # ── Typography ────────────────────────────────────────────────────────────
    # One URL carries both families (`css2?family=A&family=B`); the two name
    # fields say which is the display face and which the body face. Deriving that
    # from the URL's `family=` order would make the choice implicit and
    # unfixable from the CMS. All three blank keeps the platform default, so an
    # existing site's typography does not change under it.
    google_font_url = models.URLField(
        max_length=512,
        blank=True,
        default="",
        validators=[validate_google_font_url],
        help_text=(
            "Google Fonts stylesheet URL, e.g. https://fonts.googleapis.com/css2"
            "?family=Fraunces:wght@300..700&family=Karla:wght@400;700&display=swap. "
            "Blank keeps the default font."
        ),
    )
    font_display = models.CharField(
        max_length=64, blank=True, default="",
        help_text="CSS family name for headings, e.g. 'Fraunces'. Must be loaded by the URL above.",
    )
    font_body = models.CharField(
        max_length=64, blank=True, default="",
        help_text="CSS family name for body text, e.g. 'Karla'. Must be loaded by the URL above.",
    )

    # ── Framed heading ────────────────────────────────────────────────────────
    # Wraps a page/section heading in a thin outline; with a brandmark uploaded,
    # the mark sits in a circle straddling the top of the frame. Off by default,
    # so nothing changes until it is turned on.
    hero_text_frame = models.BooleanField(
        default=False,
        help_text="Wrap page and section headings in an outline frame (with the brandmark badge if set).",
    )

    # ── Watermark & page background ───────────────────────────────────────────
    # The logo tiled faintly behind every public page, and the page background it
    # sits on. Sizes are px and opacity a whole percent, because that is what the
    # CMS sliders emit and what the frontend consumes - floats here would only
    # invite rounding drift between the preview and the site.
    watermark_enabled = models.BooleanField(
        default=False, help_text="Tile the logo faintly behind every public page."
    )
    watermark_rotation = models.SmallIntegerField(
        default=-12, help_text="Rotation of the tiled pattern in degrees (-45 to 45)."
    )
    watermark_intercalated = models.BooleanField(
        default=False,
        help_text="Alternate each tile's rotation so neighbours lean opposite ways.",
    )
    watermark_show_logo = models.BooleanField(
        default=True, help_text="Include the logo in the watermark."
    )
    watermark_show_brandmark = models.BooleanField(
        default=False,
        help_text="Include the brandmark in the watermark (needs a brandmark image). "
                  "With the logo also on, the two are intercalated.",
    )
    watermark_size = models.PositiveSmallIntegerField(
        default=120, help_text="Drawn width of one tile in px."
    )
    watermark_spacing = models.PositiveSmallIntegerField(
        default=70, help_text="Empty space between tiles in px (added to the tile size)."
    )
    watermark_opacity = models.PositiveSmallIntegerField(
        default=4, help_text="Opacity of the pattern as a whole percent (1-25)."
    )
    background_light = models.CharField(
        max_length=16, default="#e5e5e5", help_text="Page background in the light theme."
    )
    background_dark = models.CharField(
        max_length=16, default="#3c3c3c", help_text="Page background in the dark theme."
    )

    class Meta:
        verbose_name = "Site Settings"
        verbose_name_plural = "Site Settings"

    def __str__(self):
        return self.site_name

    @classmethod
    def load(cls):
        """The one settings row, created with its defaults if it is missing.

        Every read path goes through here rather than ``objects.first()``: a
        fresh database has no row, and the public site must render with the
        defaults rather than 500 before anyone has opened the CMS.
        """
        instance, _ = cls.objects.get_or_create(pk=1)
        return instance


def backup_upload_path(instance, filename):
    """Upload path for a stored restore point.

    The uuid4 is the archive's only real lock. In production these land in the
    R2 bucket, which a Cloudflare custom domain publishes with no per-object
    ACL - so an unguessable name plus ``SiteBackupSerializer`` never exposing
    ``file`` is what keeps the site's whole database out of reach. See this
    project's CLAUDE.md before changing either.
    """
    return f"backups/{uuid.uuid4().hex}.zip"


class SiteBackup(models.Model):
    """One downloadable restore point, built by ``core.backup.write_archive``.

    Kept as a row rather than only streamed to the browser so the CMS can show a
    history: an author who breaks something wants the archive from before the
    edit, not the one they happen to still have in Downloads.
    """

    name = models.CharField(max_length=128)
    file = models.FileField(upload_to=backup_upload_path)
    sections = models.JSONField(default=list)
    # Denormalised from the manifest so the history list renders without opening
    # every zip.
    size_bytes = models.PositiveBigIntegerField(default=0)
    total_records = models.PositiveIntegerField(default=0)
    media_files = models.PositiveIntegerField(default=0)
    created = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        'auth.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )

    class Meta:
        verbose_name = "Site Backup"
        verbose_name_plural = "Site Backups"
        ordering = ["-created"]

    def __str__(self):
        return f"{self.name} ({self.created:%Y-%m-%d %H:%M})"

    def delete(self, *args, **kwargs):
        # Without this the row goes and the zip stays, quietly filling the bucket
        # with archives nothing can reach.
        if self.file:
            self.file.delete(save=False)
        return super().delete(*args, **kwargs)
