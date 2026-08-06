import os
import uuid
from urllib.parse import urlparse

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.db import models

from core import image_sizes
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


# Standard size tiers - use these directly or call picture_mixin() for custom
# sizes. The numbers are named in core.image_sizes, never typed here: the write
# serializers resize against those same constants *before* the field is reached,
# and the smaller of the two silently wins.
SmallPicture   = picture_mixin(image_sizes.SMALL)     # thumbnails, avatars
MediumPicture  = picture_mixin(image_sizes.MEDIUM)    # cards, previews
RegularPicture = picture_mixin(image_sizes.REGULAR)   # content images, banners
# Every photograph a person uploads to this journal - see the note on
# REGULAR_PLUS_QUALITY for why this tier alone carries a quality of its own.
RegularPlusPicture = picture_mixin(
    image_sizes.REGULAR_PLUS, quality=image_sizes.REGULAR_PLUS_QUALITY
)
LargePicture   = picture_mixin(image_sizes.LARGE, quality=90)  # hero, full-bleed


# ── Contributions ────────────────────────────────────────────────────────────
#
# `created_by` and `is_contribution` are declared on each of the three
# contributable models rather than on a shared base, because each carries its own
# `related_name` and its own help text (a species has nobody to credit, a
# sighting does). `was_published` is the exception only in that its meaning is
# identical everywhere, so the field itself is written once here - the models
# still declare it individually, exactly like the other two.


def was_published_field():
    """Whether an administrator has ever had this row live on the public site.

    Set the first time the row is saved with ``enabled=True`` and **never
    cleared**, which is the whole of its usefulness: without it, a contribution
    waiting for its first review and one that was published and has since been
    edited back into the queue are both simply ``enabled=False``, and the
    contributor's own list cannot tell them apart.

    That distinction is not cosmetic. Editing a published contribution takes it
    **off** the public site until it is re-approved, so the frontend has to be
    able to say so - both as a warning before the edit is saved and as a distinct
    status afterwards. See ``core/contribute_views.py``.

    ⚠ It is set in each model's ``save()``, not in a serializer, because
    publishing is an ordinary ``enabled=True`` PATCH from the CMS and is also
    done from the Django admin - neither of which passes through the contribute
    layer.
    """
    return models.BooleanField(
        default=False,
        help_text='Whether an administrator has ever published this row. Set the '
                  'first time it is saved enabled and never cleared, so a '
                  'contribution awaiting its first review can be told apart from '
                  'a published one its author has edited back into review.',
    )


def stamp_published(instance):
    """Latch ``was_published`` on a row being saved live. Call from ``save()``."""
    if instance.enabled and not instance.was_published:
        instance.was_published = True


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

    # ── Maps ─────────────────────────────────────────────────────────────────
    # Which basemap every map in `apps/animals` is painted from - the four public
    # maps and the CMS's own coordinate picker, which all read one resolved
    # value so they cannot show two different worlds.
    #
    # ⚠ This chooses a *style*, not what the style contains. The maps draw raster
    # tiles, and roads, labels and building footprints are baked into each PNG
    # before it arrives, so there is no "hide the houses" flag here and there
    # cannot be one - the only way to that is `custom` below, pointed at a style
    # authored in a hosted provider's editor with the layer deleted. See
    # `packages/ui/src/core-elements/basemaps.ts`, which holds the matching list.
    map_style = models.CharField(
        max_length=32,
        default="osm",
        choices=[
            ("osm", "OpenStreetMap standard"),
            ("carto-light", "CARTO Positron (pale)"),
            ("carto-dark", "CARTO Dark Matter"),
            ("carto-voyager", "CARTO Voyager"),
            ("custom", "Custom tile server"),
        ],
        help_text="Which basemap the site's maps are drawn from. 'Custom' uses "
                  "the tile URL below - a provider needing an API key "
                  "(MapTiler, Mapbox, Thunderforest), or a tile server of your own.",
    )
    map_tile_url = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Only used when the style is 'Custom'. A {z}/{x}/{y} template, "
                  "e.g. https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY",
    )
    map_attribution = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Only used when the style is 'Custom'. The credit drawn in the "
                  "map's corner - required by every tile provider. Left blank, "
                  "the OpenStreetMap credit is used.",
    )
    # Where that credit links. Separate from the string because the two are
    # separate requirements: a provider's terms ask for a visible credit, and
    # most also ask that it point back at them. The frontend used to anchor
    # every credit to openstreetmap.org/copyright, so a "© MapTiler" named one
    # party and linked another; blank here now renders the credit as plain text
    # rather than borrowing that href. See `basemaps.ts` -> `attributionUrl`.
    map_attribution_url = models.URLField(
        max_length=300,
        blank=True,
        default="",
        help_text="Only used when the style is 'Custom'. Where the credit links - "
                  "most providers require it to point back at them, e.g. "
                  "https://www.maptiler.com/copyright/ . Left blank, the credit "
                  "is drawn as plain text.",
    )

    # ── Video transcoding ────────────────────────────────────────────────────
    # Read by the handler in `apps/animals` when it transcodes an uploaded clip.
    # Authored at /admin/system. Changing any of them affects the *next* upload
    # only - a clip already transcoded is not re-encoded, and the source it came
    # from was deleted when it finished.
    video_max_height = models.PositiveSmallIntegerField(
        default=1080,
        choices=[(720, "720p"), (1080, "1080p"), (1440, "1440p"), (2160, "2160p (4K)")],
        help_text="Cap on the short edge of an uploaded clip - what '1080p' "
                  "means, applied whichever way round the clip is. Never "
                  "upscales: a smaller source is left at its own size.",
    )
    # Stored as the ffmpeg CRF it becomes, so the handler needs no lookup table -
    # but the CMS renders it as four named steps, because the scale is inverted
    # (lower is better) and a raw number reads backwards to an author.
    video_quality = models.PositiveSmallIntegerField(
        default=23,
        choices=[
            (20, "Maximum"),
            (23, "High"),
            (26, "Balanced"),
            (29, "Small file"),
        ],
        help_text="Constant Rate Factor. Lower is better quality and a bigger file.",
    )
    video_codec = models.CharField(
        max_length=8,
        default="h264",
        choices=[("h264", "H.264"), ("hevc", "HEVC / H.265")],
        help_text="H.264 plays everywhere. HEVC files are ~30%% smaller but need "
                  "hardware decode support - Firefox and many desktop browsers "
                  "will not play them at all.",
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
