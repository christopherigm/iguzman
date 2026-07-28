import os
import uuid
from decimal import Decimal
from urllib.parse import urlparse

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.db import models

from core import image_sizes as sizes
from core.fields import ResizedImageField
from core.tenant_paths import system_id_for, tenant_path


class Common(models.Model):
    enabled = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True


def picture(instance, filename):
    """Where an uploaded image is stored, namespaced by tenant.

    The `t/<system_id>/` prefix is what lets a customer on its own domain serve
    its images from its own Cloudflare R2 account: `core.storage` resolves the
    bucket by reading the tenant back out of the path, because Django resolves
    `FileField.storage` once at class-load time and can never do it per row. See
    `core.tenant_paths` for the full reasoning.

    An instance whose System cannot be resolved (unsaved parent, a fixture) gets
    the bare path and lands on the platform bucket - reachable, just not
    followable to a tenant bucket. Every file written before this landed has that
    shape, which is why the prefix must stay an unambiguous `t/<digits>/`.
    """
    ext = os.path.splitext(filename)[1].lstrip(".") or "jpg"
    base = f"pictures/{instance.__class__.__name__.lower()}/{uuid.uuid4().hex}.{ext}"
    return tenant_path(system_id_for(instance), base)


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


# The only hosts a `google_font_url` may point at. This value is rendered by the
# frontend into a `<link rel="stylesheet">` in the document head, so it is not
# merely data: an arbitrary URL here would let whoever can edit a System pull a
# stylesheet from any origin into every page of that site. Google serves the CSS
# from fonts.googleapis.com and the font binaries from fonts.gstatic.com; only
# the first is ever the stylesheet, but both are allowed so a tenant pasting a
# gstatic URL fails loudly at validation rather than silently rendering nothing.
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


# ── Shape dividers ────────────────────────────────────────────────────────────
# The named shapes a transparent "notch" can be cut in along one edge of a box -
# a hero's bottom edge, a section band's top and bottom edges - so whatever is
# painted behind (the page background and its watermark) shows through and the
# box dissolves into the page instead of ending at a hard line.
#
# Module-level rather than a class attribute because two unrelated groups of
# System fields share the set (the hero divider and the section-band dividers),
# and a Django class body cannot reference an attribute defined further down it.
# The set must match the frontend's ShapeDividerMask
# (packages/ui/src/shape-divider.tsx) - an unknown value falls back to "none" on
# the site, so a typo here reads as the setting having been ignored. Its
# `brandmark` shape is deliberately absent: it needs a same-origin brandmark URL
# that neither the hero nor the section bands plumb through.
DIVIDER_NONE = "none"
DIVIDER_CHOICES = (
    (DIVIDER_NONE, "None - hard edge"),
    ("wave", "Wave - organic wave"),
    ("scallop", "Half-circles - scalloped edge"),
    ("zigzag", "Zigzag - triangular bunting"),
    ("spikes", "Spikes - fine sawtooth"),
    ("arches", "Arches - smooth wide humps"),
    ("slant", "Slant - straight diagonal"),
    ("inverted-slant", "Inverted slant - the same diagonal, mirrored"),
)


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
# The numbers live in core.image_sizes because the write serializers must resize
# to the same tier; see that module for why they cannot be spelled out twice.
SmallPicture = picture_mixin(sizes.SMALL)                # thumbnails, avatars
MediumPicture = picture_mixin(sizes.MEDIUM, quality=90)  # cards, previews
StandardPicture = picture_mixin(sizes.STANDARD)          # buyables, gallery images
RegularPicture = picture_mixin(sizes.REGULAR)            # stories, highlights, content
LargePicture = picture_mixin(sizes.LARGE, quality=90)    # hero images, full-bleed


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

    # A small company symbol / brandmark, distinct from the full logo: a mini
    # icon used in cards, or tiled in the page-background watermark alongside or
    # in place of the logo (see `watermark_show_brandmark`). Stored small and
    # PNG-forced for its alpha channel by the write serializer's _IMAGE_FIELDS
    # (SMALL tier).
    img_brandmark = models.ImageField(null=True, blank=True, upload_to=picture)

    img_hero = models.ImageField(null=True, blank=True, upload_to=picture)
    video_link = models.URLField(max_length=255, null=True, blank=True)
    slogan = models.CharField(max_length=255, null=True, blank=True, default="Company slogan")
    primary_color = models.CharField(max_length=16, null=False, blank=False, default="#2196f3")
    secondary_color = models.CharField(max_length=16, null=False, blank=False, default="#e040fb")

    # ── Contact ───────────────────────────────────────────────────────────────
    # Site-wide contact details, rendered on the public contact page (and reused
    # on other pages later - footer, item pages). Unlike a `Branch`, these belong
    # to the business as a whole, not to any one physical location: a pure-online
    # business has an email and social links but no address. This is *business*
    # contact info meant to be published (the contact page is its whole point),
    # not user PII - it appears on the AllowAny GET /api/system/.
    contact_email = models.EmailField(max_length=254, null=True, blank=True)
    # An ordered list of {"platform": "instagram", "url": "https://..."} refs.
    # A JSON list rather than one column per network so a tenant can add, drop or
    # reorder platforms without a migration; the frontend maps each platform to
    # its icon and falls back to a generic globe for an unknown one.
    social_links = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            'Ordered social links, e.g. '
            '[{"platform": "instagram", "url": "https://instagram.com/acme"}].'
        ),
    )

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

    # ── Section band dividers ─────────────────────────────────────────────────
    # The shape cut as a transparent notch out of each background band's top and
    # bottom edge, so the page (and its watermark) shows through and the band
    # dissolves into the sections around it rather than meeting them at a hard
    # horizontal line. Both edges are offered per band because a band has a
    # section above it *and* one below it - unlike the hero, which only ever
    # dissolves downward. "none" (the default) keeps the straight edge, so every
    # existing tenant is unchanged. See DIVIDER_CHOICES for the shape set.
    highlights_top_divider = models.CharField(
        max_length=16,
        choices=DIVIDER_CHOICES,
        default=DIVIDER_NONE,
        help_text="Shape of the notch cut into the top edge of the Company Highlights band.",
    )
    highlights_bottom_divider = models.CharField(
        max_length=16,
        choices=DIVIDER_CHOICES,
        default=DIVIDER_NONE,
        help_text="Shape of the notch cut into the bottom edge of the Company Highlights band.",
    )
    catalog_top_divider = models.CharField(
        max_length=16,
        choices=DIVIDER_CHOICES,
        default=DIVIDER_NONE,
        help_text="Shape of the notch cut into the top edge of the Catalog Items band.",
    )
    catalog_bottom_divider = models.CharField(
        max_length=16,
        choices=DIVIDER_CHOICES,
        default=DIVIDER_NONE,
        help_text="Shape of the notch cut into the bottom edge of the Catalog Items band.",
    )

    # ── Hero video layout ─────────────────────────────────────────────────────
    # How the logo and text are composed over the hero video, on the landing
    # page and on every item detail page that has one. "profile" places the logo
    # in a circle straddling the video's bottom edge, the way a profile picture
    # sits on a cover photo.
    HERO_LAYOUT_DEFAULT = "default"
    HERO_LAYOUT_NONE = "none"
    HERO_LAYOUT_PROFILE = "profile"
    HERO_LAYOUT_CHOICES = (
        (HERO_LAYOUT_DEFAULT, "Default - logo and text over the video"),
        (HERO_LAYOUT_NONE, "None - text and buttons only, no logo over the video"),
        (HERO_LAYOUT_PROFILE, "Profile - logo in a circle on the bottom edge"),
    )
    hero_video_layout = models.CharField(
        max_length=16,
        choices=HERO_LAYOUT_CHOICES,
        default=HERO_LAYOUT_DEFAULT,
        help_text="How the logo and text are laid out over the hero video.",
    )
    # ── Logo background badge ─────────────────────────────────────────────────
    # A decorative shape drawn behind the hero logo, in either layout. In the
    # "profile" layout it is the badge straddling the video's bottom edge (the
    # former hard-coded circle, now any shape); in "default" it is a badge centred
    # behind the logo over the video. "none" draws the logo with no backing shape,
    # which is also what the "profile" layout falls back to - with no badge there
    # is nothing to straddle the edge with, so it renders like the default layout.
    HERO_LOGO_BG_NONE = "none"
    HERO_LOGO_BG_CIRCLE = "circle"
    HERO_LOGO_BG_SQUARE = "square"
    HERO_LOGO_BG_ROUNDED = "rounded"
    HERO_LOGO_BG_TRIANGLE = "triangle"
    HERO_LOGO_BG_PENTAGON = "pentagon"
    HERO_LOGO_BG_HEXAGON = "hexagon"
    HERO_LOGO_BG_OCTAGON = "octagon"
    HERO_LOGO_BG_LOGO = "logo"
    HERO_LOGO_BACKGROUND_CHOICES = (
        (HERO_LOGO_BG_NONE, "None"),
        (HERO_LOGO_BG_CIRCLE, "Circle"),
        (HERO_LOGO_BG_SQUARE, "Square"),
        (HERO_LOGO_BG_ROUNDED, "Square with rounded corners (8px)"),
        (HERO_LOGO_BG_TRIANGLE, "Triangle"),
        (HERO_LOGO_BG_PENTAGON, "Pentagon"),
        (HERO_LOGO_BG_HEXAGON, "Hexagon"),
        (HERO_LOGO_BG_OCTAGON, "Octagon"),
        # Clips the plate to the logo's own silhouette (via a CSS mask on the
        # logo's alpha) instead of a geometric shape; needs a transparent logo.
        (HERO_LOGO_BG_LOGO, "Logo silhouette (transparent logo)"),
    )
    hero_logo_background = models.CharField(
        max_length=16,
        choices=HERO_LOGO_BACKGROUND_CHOICES,
        default=HERO_LOGO_BG_NONE,
        help_text="Shape drawn behind the hero logo, in either layout. 'None' draws the logo plain.",
    )
    # The drawn size of the logo inside the background shape, as a whole percent of
    # the badge. 100 is edge-to-edge "cover" fill; below that the logo shrinks,
    # centred, leaving a ring of the badge's page-background colour around it. Only
    # meaningful when hero_logo_background is not "none". Stored as a whole percent
    # (not a float) because that is what the CMS slider emits and the frontend consumes.
    hero_logo_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Logo size inside the background shape, as a whole percent (30-100).",
    )
    # The drawn size of the badge itself, as a whole percent of its default
    # diameter; below 100 the whole badge (shape and logo) shrinks about its
    # centre. Independent of hero_logo_scale, which sizes the logo within the
    # badge. Only meaningful when hero_logo_background is not "none".
    hero_logo_background_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Background badge size, as a whole percent of its default diameter (30-100).",
    )
    # ── Hero dark overlay ─────────────────────────────────────────────────────
    # The dark layer between the hero background and the text over it - what
    # keeps white type legible over an arbitrary video frame. The default pair
    # ("bottom" at 75%) reproduces the gradient both heroes used to hard-code, so
    # every existing tenant looks unchanged until they touch these.
    HERO_OVERLAY_NONE = "none"
    HERO_OVERLAY_FULL = "full"
    HERO_OVERLAY_BOTTOM = "bottom"
    HERO_OVERLAY_TOP = "top"
    HERO_OVERLAY_BOTH = "both"
    HERO_OVERLAY_VIGNETTE = "vignette"
    HERO_OVERLAY_STYLE_CHOICES = (
        (HERO_OVERLAY_NONE, "None - no overlay"),
        (HERO_OVERLAY_FULL, "Full - flat tint over the whole frame"),
        (HERO_OVERLAY_BOTTOM, "Bottom to top - dark at the bottom edge"),
        (HERO_OVERLAY_TOP, "Top to bottom - dark at the top edge"),
        (HERO_OVERLAY_BOTH, "Top and bottom - clear through the middle"),
        (HERO_OVERLAY_VIGNETTE, "Vignette - clear centre, dark edges"),
    )
    hero_overlay_style = models.CharField(
        max_length=16,
        choices=HERO_OVERLAY_STYLE_CHOICES,
        default=HERO_OVERLAY_BOTTOM,
        help_text="Shape of the dark overlay drawn over the hero background.",
    )
    # A whole percent, not a float, for the same reason as the scales above: it
    # is what the CMS slider emits and what the frontend consumes. 0 draws no
    # overlay whatever the style is set to.
    hero_overlay_opacity = models.PositiveSmallIntegerField(
        default=75,
        help_text="Strength of the darkest part of the overlay, as a whole percent (0-100).",
    )
    # How far the gradient overlay reaches across the frame, independent of its
    # strength above - a taller or shorter dark band. 50 is the neutral point
    # that reproduces the frontend's historical fade stops, so an existing hero
    # is unchanged until the tenant moves the slider; a flat "full" style ignores
    # it. A whole percent, like the fields above, for the same slider/consumer
    # reason.
    hero_overlay_extent = models.PositiveSmallIntegerField(
        default=50,
        help_text="How far the gradient overlay reaches across the frame, as a whole percent (0-100); 50 is the default reach.",
    )
    # When on, the section/page heading over a hero (category, highlight and item
    # detail pages - not the landing hero) is wrapped in a thin outline frame; if
    # a brandmark image is set it sits in a circle straddling the top of the
    # frame, otherwise it is just the outline. Off by default, so existing sites
    # are unchanged.
    hero_text_frame = models.BooleanField(
        default=False,
        help_text="Wrap the hero section/page heading in an outline frame (with the brandmark badge if set).",
    )
    # ── Hero bottom divider ───────────────────────────────────────────────────
    # An optional shape cut as a transparent notch out of the hero's bottom edge,
    # so the page (and its watermark) shows through it and the hero dissolves into
    # the page rather than ending at a hard line. "none" (the default) keeps the
    # hard edge, so every existing tenant is unchanged. The shape set is the
    # module-level DIVIDER_CHOICES, shared with the section-band dividers above;
    # these two names are kept because the serializer and the admin already
    # reference them.
    HERO_DIVIDER_NONE = DIVIDER_NONE
    HERO_DIVIDER_CHOICES = DIVIDER_CHOICES
    hero_bottom_divider = models.CharField(
        max_length=16,
        choices=HERO_DIVIDER_CHOICES,
        default=HERO_DIVIDER_NONE,
        help_text="Shape of the transparent notch cut into the hero's bottom edge (page shows through).",
    )
    # How far the divider's shaped edge lifts off the page, as a drop-shadow that
    # traces the notch silhouette (see shapeDividerElevationFilter in
    # packages/ui/src/shape-divider.tsx, which mirrors @repo/ui-native's Box
    # elevation scale so the same number reads as the same depth on web and
    # native). 0 is a flat edge; the default 10 reproduces the value the landing
    # hero used to hard-code (HERO_DIVIDER_ELEVATION), so existing sites are
    # unchanged. A whole number, like the scale fields above, for the same
    # slider/consumer reason. Only meaningful when hero_bottom_divider is not
    # "none".
    hero_bottom_divider_elevation = models.PositiveSmallIntegerField(
        default=10,
        help_text="Depth of the divider edge's drop-shadow, on the 0-24 elevation scale.",
    )

    # ── Watermark & page background ───────────────────────────────────────────
    # The logo tiled faintly behind every public page, plus the page background
    # it sits on. Sizes are px and opacity is a whole percent, because that is
    # what the CMS sliders emit and what the frontend consumes - storing floats
    # here would only invite rounding drift between the preview and the site.
    watermark_enabled = models.BooleanField(
        default=False,
        help_text="Tile this site's logo faintly behind every public page.",
    )
    watermark_rotation = models.SmallIntegerField(
        default=-12,
        help_text="Rotation of the tiled pattern in degrees (-45 to 45).",
    )
    # When on, neighbouring logos lean opposite ways (a checkerboard of
    # +rotation / -rotation) instead of the whole pattern sharing one tilt, so
    # `watermark_rotation` becomes the alternation amplitude rather than a
    # uniform angle.
    watermark_intercalated = models.BooleanField(
        default=False,
        help_text="Alternate each logo's rotation so neighbours lean opposite ways.",
    )
    # Which images the page-background watermark tiles. With both on it
    # intercalates them (alternating logo / brandmark tiles); with one on it
    # tiles that image; with neither on it paints nothing. `watermark_show_logo`
    # tiles `img_logo`, `watermark_show_brandmark` tiles `img_brandmark` - the
    # latter is ignored (and its switch hidden in the CMS) unless a brandmark
    # image has been uploaded.
    watermark_show_logo = models.BooleanField(
        default=True,
        help_text="Include the logo in the page watermark.",
    )
    watermark_show_brandmark = models.BooleanField(
        default=False,
        help_text="Include the brandmark in the page watermark (needs a brandmark image). With the logo also on, the two are intercalated.",
    )
    watermark_size = models.PositiveSmallIntegerField(
        default=120,
        help_text="Drawn width of one logo in px.",
    )
    watermark_spacing = models.PositiveSmallIntegerField(
        default=70,
        help_text="Empty space between logos in px (added to the tile size).",
    )
    watermark_opacity = models.PositiveSmallIntegerField(
        default=4,
        help_text="Opacity of the pattern as a whole percent (1-25).",
    )
    # Default to the cyan palette's --surface-2, which is what the page
    # background was hardcoded to before these became editable.
    background_light = models.CharField(
        max_length=16,
        default="#e5e5e5",
        help_text="Page background color in the light theme.",
    )
    background_dark = models.CharField(
        max_length=16,
        default="#3c3c3c",
        help_text="Page background color in the dark theme.",
    )

    # ── Typography ────────────────────────────────────────────────────────────
    # The tenant's own typeface, loaded from Google Fonts. One URL carries both
    # families (`css2?family=A&family=B`), and the two name fields say which of
    # them is the display face and which is the body face - deriving that from
    # the URL's `family=` order would make the choice implicit and unfixable
    # from the CMS. All three blank means the site keeps the platform default,
    # so an existing tenant's typography does not change under it.
    google_font_url = models.URLField(
        max_length=512,
        blank=True,
        default="",
        validators=[validate_google_font_url],
        help_text=(
            "Google Fonts stylesheet URL loading this site's typefaces, e.g. "
            "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700"
            "&family=Karla:wght@400;500;700&display=swap. Blank keeps the default font."
        ),
    )
    font_display = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="CSS family name for headings, e.g. 'Fraunces'. Must be loaded by the URL above.",
    )
    font_body = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="CSS family name for body text, e.g. 'Karla'. Must be loaded by the URL above.",
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

    # ── Offline payment ─────────────────────────────────────────────────────────
    # Independent of Stripe and of each other: a tenant may take card payments
    # online, let customers pay in store, accept cash on delivery, any
    # combination, or none. Checkout gates each offline branch on its own flag the
    # same way it gates the online branch on `stripe_configured`. Unlike Stripe
    # these need no credentials, so a plain boolean is the whole switch.
    pay_in_store_enabled = models.BooleanField(
        default=False,
        help_text="Let customers place an order to pay when they pick it up in store.",
    )
    pay_on_delivery_enabled = models.BooleanField(
        default=False,
        help_text="Let customers place an order to pay on delivery (collects a delivery address).",
    )

    # ── Storage (Cloudflare R2) ───────────────────────────────────────────────
    # Optional, and only worth filling in for a tenant on its own domain: with
    # these set, this site's uploads go to *its* R2 bucket and serve from *its*
    # CDN hostname, so the customer owns their assets and their bandwidth bill.
    # Left blank - the normal case - the tenant uses the platform bucket
    # (`R2_*` in settings) and nothing here is consulted.
    #
    # Same shape as the Stripe pair above and for the same reasons: per-tenant
    # because each customer has their own Cloudflare account, and the secret is
    # Fernet ciphertext (core.crypto) because it must be read back to sign
    # requests. Switching this on does **not** move files that already exist:
    # only *future* uploads land in the tenant's bucket, and the existing ones
    # keep serving from the platform bucket, where their unprefixed names route.
    storage_enabled = models.BooleanField(
        default=False,
        help_text="Store this site's images and backups in its own Cloudflare R2 bucket instead of the platform's.",
    )
    storage_account_id = models.CharField(max_length=64, blank=True, default="")
    storage_access_key_id = models.CharField(max_length=128, blank=True, default="")
    # Fernet ciphertext - decrypted server-side to sign S3 requests, never
    # serialized back out. Same rule as stripe_secret_key_encrypted.
    storage_secret_access_key_encrypted = models.TextField(blank=True, default="")
    storage_bucket_name = models.CharField(max_length=128, blank=True, default="")
    # The custom hostname mapped to the bucket in Cloudflare (e.g.
    # "cdn.elpanbueno.com"). Without one there is no public route to an object,
    # so URLs fall back to expiring signed links: functional, but uncacheable and
    # therefore slower than the platform bucket it replaced.
    storage_public_domain = models.CharField(max_length=255, blank=True, default="")

    # ── Spotlight section ─────────────────────────────────────────────────────
    # An editorial promo panel paired with up to three hand-picked catalog items,
    # rendered by the shared `Spotlight` block on a site's landing (café de altura
    # uses it for "wholesale", pan orgánico for "vegan breads", …). The left
    # column is label → title → text → button (all bilingual, DB-driven per
    # tenant); the right column renders the chosen items as catalog cards.
    #
    # `spotlight_items` is an ordered list of
    # {"kind": "product"|"service"|"food", "id": <int>} refs - the same shape the
    # guest cart uses - resolved to live cards on the frontend. It is deliberately
    # NOT part of SYSTEM_TEXT_FIELDS (seed/publish): the ids are per-environment,
    # so the trio is picked in each environment's CMS, while the copy below travels.
    # A single switch to show or hide the whole Spotlight block on the landing,
    # independent of whether copy/items are filled in. Defaults on, so existing
    # tenants with a configured spotlight keep rendering it unchanged.
    spotlight_enabled = models.BooleanField(default=True)
    spotlight_label = models.CharField(max_length=255, null=True, blank=True)
    en_spotlight_label = models.CharField(max_length=255, null=True, blank=True)
    spotlight_title = models.CharField(max_length=255, null=True, blank=True)
    en_spotlight_title = models.CharField(max_length=255, null=True, blank=True)
    spotlight_text = models.TextField(null=True, blank=True)
    en_spotlight_text = models.TextField(null=True, blank=True)
    spotlight_button_label = models.CharField(max_length=255, null=True, blank=True)
    en_spotlight_button_label = models.CharField(max_length=255, null=True, blank=True)
    # Internal path (e.g. "/mayoreo") or an absolute URL - a CharField, not a
    # URLField, so an in-site relative link validates. The frontend routes it.
    spotlight_button_link = models.CharField(max_length=255, null=True, blank=True)
    spotlight_items = models.JSONField(
        default=list,
        blank=True,
        help_text='Ordered refs of the featured items, e.g. [{"kind": "product", "id": 12}]. Max 3.',
    )

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

    def set_storage_secret_access_key(self, raw_secret: str) -> None:
        """Encrypt and store the plaintext R2 secret access key ('' clears it)."""
        from core.crypto import encrypt
        self.storage_secret_access_key_encrypted = encrypt(raw_secret) if raw_secret else ""

    @property
    def storage_secret_access_key(self) -> str:
        """Decrypt and return the plaintext R2 secret access key (server-side only)."""
        from core.crypto import decrypt
        if not self.storage_secret_access_key_encrypted:
            return ""
        return decrypt(self.storage_secret_access_key_encrypted)

    @property
    def storage_configured(self) -> bool:
        """Whether this tenant's uploads go to its own bucket.

        Every part must be present. A half-filled form is *not* a configuration:
        it would send the next upload to a bucket that cannot be written or read,
        and the customer would only find out when an image failed to appear.
        `storage_public_domain` is deliberately not required - without it the
        bucket still works, just with slower signed URLs.
        """
        return bool(
            self.storage_enabled
            and self.storage_account_id
            and self.storage_access_key_id
            and self.storage_secret_access_key_encrypted
            and self.storage_bucket_name
        )


class Branch(Common):
    """A physical location for a System.

    One System has one *or more* branches. A single-location business has exactly
    one, flagged ``is_main``; the contact page then renders a single-location view
    rather than a grid of cards. A pure-online business may have none at all - its
    contact details then live only on `System` (email, social links).

    The location fields live here, never duplicated on `System`: the "main"
    location is simply the branch with ``is_main=True``. Products, services and
    menu items will link to branches in a later task.
    """

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="branches",
    )
    # Exactly one branch per system should carry this; it decides which location
    # the single-location view shows and sorts first in the grid. Not a DB
    # constraint because enforcing "at most one true per system" is noisy to
    # migrate and the CMS owns the invariant.
    is_main = models.BooleanField(default=False)

    name = models.CharField(max_length=255, null=True, blank=True)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    # Optional: a pure-online branch (e.g. a pickup-by-appointment number) may
    # have a phone but no street address.
    address = models.TextField(null=True, blank=True)
    phone = models.CharField(max_length=32, null=True, blank=True)
    # Digits (with country code) for the wa.me link the frontend builds.
    whatsapp = models.CharField(max_length=32, null=True, blank=True)
    email = models.EmailField(max_length=254, null=True, blank=True)

    # Coordinates for the map pointer. Stored as decimals (not a single "lat,lng"
    # string) so they validate and the frontend needn't parse. Latitude spans
    # -90..90 (2 whole digits), longitude -180..180 (3), hence the wider longitude
    # precision. 8 decimal places (~1mm) comfortably holds any pasted coordinate -
    # Google Maps' "copy coordinates" gives 7, which the old 6 places rejected.
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Branch"
        verbose_name_plural = "Branches"
        # Main location first, then manual order, then newest.
        ordering = ["-is_main", "sort_order", "-created"]

    def __str__(self):
        return self.name or f"Branch #{self.pk}"


class ContactMessage(Common):
    """A question a customer sent through a contact form.

    Sent either from the site's contact page or from a product/service/menu-item
    detail page - the latter records which item it was about, so an admin reading
    the inbox knows the context without the customer having to spell it out.

    Stores customer PII (name/email), so it is exposed only to a tenant's own
    admins (the inbox), never on any public endpoint. A logged-in sender is linked
    via `user`, and their account name/email are used rather than trusting the body.
    """

    # The three catalog families a message may be about (the frontend's kind
    # names, matching the guest-cart / spotlight refs). Blank = a general enquiry.
    KIND_PRODUCT = "product"
    KIND_SERVICE = "service"
    KIND_FOOD = "food"
    RELATED_KIND_CHOICES = (
        (KIND_PRODUCT, "Product"),
        (KIND_SERVICE, "Service"),
        (KIND_FOOD, "Menu item"),
    )

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="contact_messages",
    )
    # Set when the sender was signed in; the account is the source of name/email.
    user = models.ForeignKey(
        "auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=254)
    subject = models.CharField(max_length=255, null=True, blank=True)
    message = models.TextField()

    # What the message is about, if it came from an item detail page. `related_id`
    # is a plain int, not an FK, because it can point at any of three models; the
    # name is snapshotted so the inbox reads correctly even after the item is
    # renamed or deleted.
    related_kind = models.CharField(
        max_length=16, choices=RELATED_KIND_CHOICES, null=True, blank=True
    )
    related_id = models.PositiveIntegerField(null=True, blank=True)
    related_name = models.CharField(max_length=255, null=True, blank=True)

    is_read = models.BooleanField(default=False)

    # An admin's reply, sent back to the customer from the inbox. These are set
    # only once the reply email has actually gone out, so the inbox can show a
    # truthful "Replied" state and a second admin does not answer again unaware.
    reply_subject = models.CharField(max_length=255, null=True, blank=True)
    reply_body = models.TextField(null=True, blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)
    replied_by = models.ForeignKey(
        "auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = "Contact Message"
        verbose_name_plural = "Contact Messages"
        ordering = ["-created"]

    def __str__(self):
        return f"Message from {self.name} ({self.email})"


class SocialPost(Common):
    """An admin-authored social-media flyer/post for a catalog item.

    A marketing artifact, not customer data: the admin picks one catalog item
    (a product, service or menu item), a code-defined *template* (the layout,
    which lives in the frontend registry - only its key is stored here), a
    *format* (aspect ratio), writes a prompt, and lets the LLM draft the on-image
    text plus the post caption and hashtags. The rendered JPG is built and
    downloaded client-side from the template preview; nothing image-like is stored
    here - only the configuration and the generated copy, so a saved post can be
    reopened and re-downloaded without re-generating.

    The item is referenced by ``related_kind`` + ``related_id`` (the same
    ``{kind, id}`` shape ``ContactMessage`` and ``System.spotlight_items`` use),
    not a hard FK, so this model needs no import of the catalog app and one model
    can point at any of the three buyable families. The serializer resolves the
    reference to a live item snapshot (name, image, price) for the preview.
    """

    # The three catalog families a post may feature - the frontend's kind names,
    # matching the guest-cart / spotlight / contact refs.
    KIND_PRODUCT = "product"
    KIND_SERVICE = "service"
    KIND_FOOD = "food"
    RELATED_KIND_CHOICES = (
        (KIND_PRODUCT, "Product"),
        (KIND_SERVICE, "Service"),
        (KIND_FOOD, "Menu item"),
    )

    # Aspect ratios the flyer can be rendered at. Stored as a compact token the
    # frontend template maps to a pixel canvas (1x1 -> 1080x1080, 4x5 -> 1080x1350).
    FORMAT_SQUARE = "1x1"
    FORMAT_PORTRAIT = "4x5"
    FORMAT_CHOICES = (
        (FORMAT_SQUARE, "Square 1:1"),
        (FORMAT_PORTRAIT, "Portrait 4:5"),
    )

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="social_posts",
    )

    # Internal label shown in the admin list; not part of the rendered flyer.
    name = models.CharField(max_length=255)

    # The featured catalog item. `related_id` is a plain int, not an FK, because it
    # can point at any of three models; see the class docstring.
    related_kind = models.CharField(max_length=16, choices=RELATED_KIND_CHOICES)
    related_id = models.PositiveIntegerField(null=True, blank=True)

    # The key of a code-defined template in the frontend registry
    # (`components/admin/social-templates/registry.ts`). Stored as a string so the
    # collection can grow in the frontend without a migration here.
    template_id = models.CharField(max_length=64)
    format = models.CharField(max_length=8, choices=FORMAT_CHOICES, default=FORMAT_SQUARE)

    # The admin's free-text brief; the seed the LLM turns into the copy below.
    prompt = models.TextField(null=True, blank=True)

    # LLM-drafted copy, persisted and editable so a saved post re-downloads without
    # re-generating. `image_text` is overlaid on the flyer; `caption` is the post
    # body; `hashtags` is a space-separated list of `#tags`.
    image_text = models.TextField(null=True, blank=True)
    caption = models.TextField(null=True, blank=True)
    hashtags = models.TextField(null=True, blank=True)

    # Which optional elements the template composes onto the flyer.
    include_item_data = models.BooleanField(
        default=True,
        help_text="Overlay the item's price (and discount, if any) on the flyer.",
    )
    include_brand = models.BooleanField(
        default=True,
        help_text="Overlay the brand logo and slogan on the flyer.",
    )
    include_hashtags = models.BooleanField(
        default=True,
        help_text="Show the LLM-suggested hashtags beneath the post caption.",
    )

    # ── Flyer artwork ─────────────────────────────────────────────────────────
    # A flyer is a marketing artifact, not a storefront listing: the shot that
    # sells the post is often not the catalog photo (a plated version, a seasonal
    # styling, a group shot). `img_item` overrides the resolved item image in
    # *every* template; `img_background` is a full-bleed backdrop, painted by the
    # templates that declare support for one (currently "profile"). Both are
    # optional - with neither set a post renders exactly as it did before.
    img_item = models.ImageField(null=True, blank=True, upload_to=picture)
    img_background = models.ImageField(null=True, blank=True, upload_to=picture)

    # ── Centred-image badge ───────────────────────────────────────────────────
    # How the centred item photo is framed in the templates that badge it. The
    # shape vocabulary is deliberately System.HERO_LOGO_BACKGROUND_CHOICES: the
    # CMS offers one set of shapes everywhere, and the frontend shapes both with
    # the same exported `heroLogoBackgroundStyle`, so they cannot drift apart.
    badge_shape = models.CharField(
        max_length=16,
        choices=System.HERO_LOGO_BACKGROUND_CHOICES,
        default=System.HERO_LOGO_BG_CIRCLE,
        help_text="Shape framing the centred item photo. 'None' draws the photo unframed.",
    )
    # The drawn size of the badge itself, as a whole percent of its default
    # diameter; below 100 the whole badge (frame and photo) shrinks about its
    # centre. Whole percents, not floats, because that is what the CMS slider
    # emits and the template consumes - the same contract as hero_logo_*_scale.
    badge_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Badge size as a whole percent of its default size (30-100).",
    )
    # The drawn size of the photo inside the badge, as a whole percent of it. 100
    # is edge-to-edge "cover" fill; below that the photo shrinks, centred, leaving
    # a ring of the badge's frame colour around it. Independent of badge_scale.
    badge_image_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Photo size inside the badge, as a whole percent (30-100).",
    )

    # ── Brand-logo badge ──────────────────────────────────────────────────────
    # A plate behind the brand logo, in *every* template (unlike the badge above,
    # which frames the item photo in the templates that centre one). A logo drawn
    # bare over a busy backdrop often stops reading; a plate is what a real logo
    # lockup uses. Same shape vocabulary and the same two-scale relationship as
    # the hero's own logo badge (System.hero_logo_background*), so the tenant
    # tunes it with the controls they already know. Defaults to "none" - no
    # plate - so every existing post renders exactly as it did before.
    brand_logo_background = models.CharField(
        max_length=16,
        choices=System.HERO_LOGO_BACKGROUND_CHOICES,
        default=System.HERO_LOGO_BG_NONE,
        help_text="Shape of the plate behind the brand logo. 'None' draws the logo bare.",
    )
    # The drawn size of the plate (shape and logo together), as a whole percent
    # of the template's default logo height.
    brand_logo_background_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Logo-with-background size as a whole percent (30-100).",
    )
    # The drawn size of the logo inside the plate, as a whole percent of it;
    # below 100 the logo shrinks about the centre and a ring of plate shows.
    brand_logo_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Logo size inside its background, as a whole percent (30-100).",
    )

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Social Post"
        verbose_name_plural = "Social Posts"
        ordering = ["sort_order", "-created"]

    def __str__(self):
        return self.name or f"Social Post #{self.pk}"


def backup_upload_path(instance, filename):
    """Where a tenant's backup archive is stored.

    In the same media namespace as the images it contains, and tenant-prefixed
    like everything else, so a customer's archives follow it to its own R2
    account when it connects one.

    ⚠ **The filename carries an unguessable token, and in production it is the
    main lock.** The bucket is served by a Cloudflare custom domain, which has no
    notion of an ACL and publishes every object in it. This file is the tenant's
    entire database - customer accounts and order history included - and a path
    guess away from anyone who tries. What stands between them:
    uuid4 in the name, `SiteBackupSerializer` never exposing `file`, and
    `SiteBackupDownloadView` (which matches the row against the caller's own
    System) being the only code that ever produces a URL for one. A Cloudflare
    WAF rule blocking `/t/*/backups/*` on the public hostname restores a real
    second lock without affecting this code, which only ever uses the S3
    endpoint; see the note in `core/storage.py`.
    """
    ext = os.path.splitext(filename)[1].lstrip(".") or "zip"
    return tenant_path(instance.system_id, f"backups/{uuid.uuid4().hex}.{ext}")


class SiteBackup(Common):
    """A downloadable archive of one tenant's data, kept as a restore point.

    The row is the *history entry* the CMS lists; the zip it points at is what
    `core.backup` wrote (manifest + data.json + the media files). Everything here
    besides `file` is a denormalised copy of that archive's manifest, so the list
    renders without opening a single zip.

    Rows are scoped to a `System` and every endpoint filters on it - a backup is
    the most concentrated form a tenant's data takes, so it must never be
    listable, downloadable or restorable across the tenant boundary.
    """

    system = models.ForeignKey(
        "core.System",
        on_delete=models.CASCADE,
        related_name="backups",
    )
    # Operator-supplied label; the CMS defaults it to the current date-time.
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=backup_upload_path, max_length=255)

    # Which sections the archive holds, as stored by core.backup.normalize_sections
    # (e.g. ["system", "products", "images"]). A restore may select a subset.
    sections = models.JSONField(default=list, blank=True)
    include_images = models.BooleanField(default=True)

    # Denormalised from the manifest so the history list needs no zip reads.
    size_bytes = models.PositiveBigIntegerField(default=0)
    media_files = models.PositiveIntegerField(default=0)
    record_counts = models.JSONField(default=dict, blank=True)

    # Who pressed the button. SET_NULL so removing a staff account never takes
    # the restore point with it.
    created_by = models.ForeignKey(
        "auth.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="site_backups",
    )

    class Meta:
        verbose_name = "Site Backup"
        verbose_name_plural = "Site Backups"
        ordering = ["-created"]

    def __str__(self):
        return f"{self.name} ({self.system_id})"

    @property
    def total_records(self) -> int:
        counts = self.record_counts or {}
        return sum(v for v in counts.values() if isinstance(v, int))
