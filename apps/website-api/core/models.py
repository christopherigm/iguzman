import os
import uuid
from datetime import datetime, time, timedelta
from decimal import Decimal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.db import models
# Aliased because `Branch`, `Event` and friends all carry a `timezone` *field*,
# and a bare `timezone` in a method body would read as that field rather than
# Django's clock.
from django.utils import timezone as django_tz

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


def validate_timezone(value):
    """Accept any IANA name the running system's tz database knows.

    Checked against `zoneinfo` rather than a `choices` list because the list of
    zones is not ours to freeze: countries add, rename and merge them, and a
    stale enum would reject a legitimate value with no way for a tenant to fix
    it. Migrations reference this by name, so keep it module-level.
    """
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValidationError(f"{value!r} is not a known timezone.") from exc


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


# The two Buyable families a tenant can rename in the CMS.
#
# MenuItem is deliberately absent: a menu is sectioned by the tenant's own
# `MenuCategory` rows, which are already their own copy, so there is nothing
# left for a label override to rename. This list used to carry the five
# `MenuItem.kind` values alongside these two; both the kinds and their ten
# label columns are gone.
CATALOG_KINDS = (
    "product",
    "service",
)

# The bilingual `System` column pair each of those kinds carries. Derived once so
# the read serializer, the write serializer, the publish payload and the Django
# admin cannot end up listing different sets of columns from one another.
KIND_LABEL_FIELDS = tuple(
    field
    for kind in CATALOG_KINDS
    for field in (f"kind_label_{kind}", f"en_kind_label_{kind}")
)


class BasePicture(Common):
    """
    Abstract base for all picture models.

    Provides display metadata (name, description, href), the credit owed for a
    stock ``image`` (attribution), and CSS-layout hints (fit,
    background_color). Concrete size variants are produced by
    ``picture_mixin()``.
    """

    name = models.CharField(max_length=255, null=True, blank=True)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    en_description = models.TextField(null=True, blank=True)
    short_description = models.TextField(null=True, blank=True)
    en_short_description = models.TextField(null=True, blank=True)
    href = models.URLField(max_length=255, null=True, blank=True)
    # Who this row's `image` is owed to, when it came from a stock bank rather
    # than the customer's camera. `seed_site` fills the pair from the fetcher's
    # credits sidecar; a customer who uploads their own photo in the CMS clears
    # them, which is what makes a NON-EMPTY `attribution` the marker for "this
    # is still a stock placeholder" (see `System.stock_image_count`).
    #
    # Two fields rather than one, for the reason `map_attribution` /
    # `map_attribution_url` are two: a bank's terms ask for a visible credit AND
    # (separately) that it point back at them, so a single string could only be
    # rendered as plain text or anchored at a guessed href. Blank url = the
    # credit is plain text.
    attribution = models.CharField(max_length=255, blank=True, default="")
    attribution_url = models.URLField(max_length=500, blank=True, default="")
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

    # ── Rewards ───────────────────────────────────────────────────────────────
    # Both are read only while `System.rewards_enabled`, and both are **nullable
    # with a meaningful null** rather than zero-defaulted.
    #
    # `points_award` is what buying one of these earns. Null means "inherit
    # whatever my category awards" - the same inherit/override rule
    # `MenuItem.effective_sizes` and `CatalogRecommendation` follow, and for the
    # same reason: a tenant states "every pizza earns 120" once, on the Pizzas
    # category, and only says it again on the dish that differs. **Zero is not
    # the same as null**: zero is an explicit "this item earns nothing", which is
    # how a loss-leader is excluded from a category that otherwise earns.
    #
    # `points_price` is what buying one of these *with points* costs. Null means
    # this item cannot be bought with points at all, which is the default and
    # what every row written before this landed is - so turning the program on
    # does not silently make the whole catalog redeemable. It is deliberately
    # **not** inherited from a category: an award is a rate the tenant sets once
    # for a family, while a points price is a per-item decision that has to be
    # weighed against that item's own money price.
    points_award = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Points earned per unit bought. Blank inherits the category's.",
    )
    points_price = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Points needed to buy one of these. Blank means it cannot be bought with points.",
    )

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


class HomepageFlyer(RegularPicture):
    """A promotional flyer on the landing page, pairing copy and a photograph
    with up to three hand-picked catalog items.

    The same idea as ``System.spotlight_*`` - an editorial panel around a few
    items - with one difference that is the whole reason it is a model rather
    than more columns on ``System``: a tenant makes **several** of them and the
    landing pages through them in a slider, so each one carries its own copy,
    its own photograph, its own colour band and its own edge shapes. The
    Spotlight's single panel could stay on the System row; a set of them cannot.

    ``items`` is an ordered list of ``{"kind": "product"|"service"|"food",
    "id": <int>}`` refs - the same shape the guest cart, ``ContactMessage``,
    ``SocialPost`` and ``System.spotlight_items`` use - resolved to live cards on
    the frontend rather than here, so a deleted or disabled item simply drops out
    of its slide. Like ``spotlight_items`` the ids are per-environment and are
    picked in each environment's CMS; they do not travel in a seed.

    ``background``/``top_divider``/``bottom_divider`` are the per-row twin of
    ``System.catalog_items_bg`` + its divider pair, and the frontend paints them
    through the very same ``SectionBand`` component. They are per-flyer because
    every slide is its own band: a set of flyers sharing one background would
    make the slider read as one panel whose contents change, which is exactly
    what a flyer is not.

    Inherits from ``RegularPicture`` (1200 px), which brings ``name``/``en_name``,
    ``description``/``en_description``, ``image``, ``fit``, ``background_color``
    and the stock-photo credit pair.
    """

    # Which side the photograph sits on from `sm` up. Below that the slide always
    # stacks (title -> image -> description -> items), so this has no effect
    # there: a phone has one column and no side to choose.
    SIDE_LEFT = "left"
    SIDE_RIGHT = "right"
    IMAGE_SIDE_CHOICES = (
        (SIDE_LEFT, "Left"),
        (SIDE_RIGHT, "Right"),
    )

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="homepage_flyers",
    )

    items = models.JSONField(
        default=list,
        blank=True,
        help_text='Ordered refs of the featured items, e.g. [{"kind": "product", "id": 12}]. Max 3.',
    )

    image_side = models.CharField(
        max_length=8,
        choices=IMAGE_SIDE_CHOICES,
        default=SIDE_LEFT,
        help_text="Which side the photograph sits on from the sm breakpoint up.",
    )

    # This flyer's own colour band. A CharField holding raw CSS, exactly like
    # `System.catalog_items_bg`: it is authored by the CMS gradient builder and
    # painted straight into a `background` declaration.
    background = models.TextField(
        null=True,
        blank=True,
        help_text="CSS background painted behind this flyer's slide. Blank = no band.",
    )
    top_divider = models.CharField(
        max_length=16,
        choices=DIVIDER_CHOICES,
        default=DIVIDER_NONE,
        help_text="Shape of the notch cut into the top edge of this flyer's band.",
    )
    bottom_divider = models.CharField(
        max_length=16,
        choices=DIVIDER_CHOICES,
        default=DIVIDER_NONE,
        help_text="Shape of the notch cut into the bottom edge of this flyer's band.",
    )

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Homepage Flyer"
        verbose_name_plural = "Homepage Flyers"
        ordering = ["sort_order", "-created"]

    def __str__(self):
        return self.name or f"Flyer #{self.pk}"


# How long an all-day event keeps counting as "on" after the instant stored in
# `starts_at`/`ends_at`. An all-day row is stored at midnight, so comparing it
# straight against the clock would retire today's event one minute into the day
# it is happening on - and the tenant's own timezone is not available to the SQL
# that filters the list. One day errs toward showing an event slightly too long,
# which is the harmless direction: a visitor reading "today" about something that
# finished this morning is a smaller failure than an event vanishing from the
# site on the morning of the day it runs. See `Event.effective_end`, which is
# exact, and `EventListView`, which is this approximation.
ALL_DAY_GRACE = timedelta(days=1)


class Event(RegularPicture):
    """A dated happening a business announces: a tasting, a workshop, a live set.

    Editorial content in the same family as ``SuccessStory`` and
    ``CompanyHighlight`` - it is announced, read and shared, and that is all.
    Deliberately **informational**: nothing here sells a ticket, counts a seat or
    registers an attendee. Adding that later means a second model hanging off
    this one (the shape ``orders.Booking`` uses against ``Order``), not extra
    columns here.

    Inherits from RegularPicture (1200 px) which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description,
        short_description, en_short_description, href, fit, background_color
      - RegularPicture: image (max 1200 px) - the event's cover

    **There is no `sort_order`.** Every sibling content model has one, and an
    event is the one that must not: it is ordered by *when it happens*, and a
    hand-dragged order beside a date is a second source of truth that can only
    ever disagree with the first. The CMS list is chronological and has no
    drag-to-reorder mode for this reason.
    """

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="events",
    )
    slug = models.SlugField(max_length=255, unique=True, null=True, blank=True)

    # ── Where ─────────────────────────────────────────────────────────────────
    # Two ways to answer, because both are real. A business holding a tasting in
    # its own shop should pick the `Branch` it already maintains (address,
    # coordinates and map come with it, and stay correct when the shop moves);
    # one holding a pop-up in a rented hall or a park types the place instead.
    # Read the `effective_*` properties, never these columns - they resolve the
    # two into one answer, with the event's own value winning so a tenant can
    # override a single field (a hall inside their building, say) without
    # detaching the event from its branch.
    #
    # SET_NULL rather than CASCADE: retiring a location must not delete the
    # history of what happened there.
    branch = models.ForeignKey(
        "core.Branch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="events",
        help_text="One of the business's own locations. Leave empty to name a one-off place below.",
    )
    venue_name = models.CharField(max_length=255, null=True, blank=True)
    en_venue_name = models.CharField(max_length=255, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    # Same precision and reasoning as Branch.latitude/longitude - stored as
    # decimals so they validate and the frontend needn't parse a "lat,lng" string.
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)

    # ── When ──────────────────────────────────────────────────────────────────
    # `starts_at` is the only required field on the whole model: an event without
    # a date is not an event, and every consumer (the ordering, the upcoming
    # filter, the "past" badge) reads it.
    starts_at = models.DateTimeField(help_text="When the event begins.")
    ends_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When it finishes. Blank for an event with no announced end.",
    )
    is_all_day = models.BooleanField(
        default=False,
        help_text="Show the date without a time (an open day, a week-long fair).",
    )
    # ⚠ Same trap as `Branch.timezone`, and for the same reason: Django runs on
    # UTC, so an instant rendered without a zone shows a Mexico City evening as a
    # small-hours event. Unlike Branch this is a *snapshot* rather than a live
    # setting - an event happened in the zone it happened in, and re-rendering a
    # past one through a branch that has since moved zones would rewrite history
    # (the same rule `orders.Booking.timezone` follows).
    timezone = models.CharField(
        max_length=64,
        default="UTC",
        validators=[validate_timezone],
        help_text="IANA timezone the times above are local to (e.g. America/Mexico_City).",
    )

    is_featured = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Event"
        verbose_name_plural = "Events"
        # Chronological, soonest first - see the class docstring on why there is
        # no manual order to put ahead of it. The list endpoint flips this to
        # newest-first when it is asked for past events.
        ordering = ["starts_at"]
        indexes = [
            # Every public read is "this tenant's events, by date"; the CMS adds
            # the disabled ones to the same shape.
            models.Index(fields=["system", "starts_at"], name="core_event_system_start"),
        ]

    def __str__(self):
        return self.name or self.slug or f"Event #{self.pk}"

    @property
    def tzinfo(self):
        """The event's zone, falling back to UTC rather than raising.

        A row written before the validator existed (or straight into the
        database) must not 500 every page that renders it.
        """
        try:
            return ZoneInfo(self.timezone or "UTC")
        except (ZoneInfoNotFoundError, ValueError):
            return ZoneInfo("UTC")

    @property
    def effective_end(self):
        """The instant this event stops being current.

        `ends_at` when one was announced, otherwise the start. An **all-day**
        event runs to midnight at the end of its last local day - stored at
        midnight, it would otherwise be over one minute into the day it is
        happening on. This is the exact answer; the list endpoint's SQL filter
        approximates it with `ALL_DAY_GRACE` because it cannot reach each row's
        own zone from a `WHERE` clause.
        """
        end = self.ends_at or self.starts_at
        if not self.is_all_day:
            return end
        local_end = end.astimezone(self.tzinfo)
        return datetime.combine(
            local_end.date() + timedelta(days=1), time.min, tzinfo=self.tzinfo
        )

    @property
    def is_past(self) -> bool:
        return self.effective_end < django_tz.now()

    # ── Location resolved across the branch ──────────────────────────────────
    # The event's own value wins in every one of these, so a tenant can override
    # a single field without detaching the event from its branch.

    @property
    def effective_venue_name(self):
        return self.venue_name or (self.branch.name if self.branch_id else None)

    @property
    def effective_en_venue_name(self):
        return self.en_venue_name or (self.branch.en_name if self.branch_id else None)

    @property
    def effective_address(self):
        return self.address or (self.branch.address if self.branch_id else None)

    @property
    def effective_latitude(self):
        if self.latitude is not None:
            return self.latitude
        return self.branch.latitude if self.branch_id else None

    @property
    def effective_longitude(self):
        if self.longitude is not None:
            return self.longitude
        return self.branch.longitude if self.branch_id else None


class EventImage(StandardPicture):
    """Additional gallery images for an event."""

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name="images",
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Event Image"
        verbose_name_plural = "Event Images"
        ordering = ["sort_order"]

    def __str__(self):
        return f"Image for {self.event} (#{self.sort_order})"


class System(Common):
    site_name = models.CharField(max_length=32, null=False, blank=False, default="Web Site")
    site_description = models.TextField(null=True, blank=True)
    en_site_description = models.TextField(null=True, blank=True)
    host = models.CharField(max_length=64, null=False, blank=False, default="127.0.0.1", unique=True)

    # The namespace every globally-unique slug on this site carries, and the one
    # thing standing between two tenants who both sell a "Latte" - see
    # `core.site_prefix` for the whole story, and for why users and coupons are
    # deliberately left out of it.
    #
    # ⚠ **Derived in `save()` when blank, not defaulted here** - the same shape
    # `MenuSize.system` uses, and for a harder reason. A `default=` on a
    # `unique=True` column is a literal every row would share, so the *second*
    # `System.objects.create(host=...)` on a database fails the insert outright.
    # Filling it from the row's own host (`javastop.com.mx` -> `javastop`)
    # instead makes every door correct at once: the CMS, `seed_site`,
    # `publish-site`, the Django admin, a fixture and a shell one-liner.
    #
    # Blank is allowed at the form layer only so that door exists; a saved row
    # never carries one, because a slug built from a blank prefix has a leading
    # hyphen and no namespace at all - the exact collision this column prevents.
    #
    # ⚠ Editing it does **not** re-slug anything. The catalog keeps the slugs it
    # was created with until an operator presses "Recreate IDs"
    # (`SystemRecreateSlugsView`), which is a deliberate second step: re-slugging
    # changes every public URL on the site at once.
    site_prefix = models.SlugField(
        max_length=32, null=False, blank=True, default="", unique=True,
    )

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
    # The credit owed for `img_hero`, in the shape `BasePicture` carries for
    # every other image in the schema. System's images are plain ImageFields
    # rather than a BasePicture row, so the pair has to be spelled out here -
    # and only for the two that are ever a photograph. A logo, favicon,
    # brandmark or manifest icon is the customer's own mark by definition and
    # can never come from a stock bank, so it is owed no credit.
    img_hero_attribution = models.CharField(max_length=255, blank=True, default="")
    img_hero_attribution_url = models.URLField(max_length=500, blank=True, default="")
    video_link = models.URLField(max_length=255, null=True, blank=True)
    slogan = models.CharField(max_length=255, null=True, blank=True, default="Company slogan")
    primary_color = models.CharField(max_length=16, null=False, blank=False, default="#2196f3")
    secondary_color = models.CharField(max_length=16, null=False, blank=False, default="#e040fb")
    # Whether the fixed navbar is semi-transparent with a backdrop blur (the
    # frontend's `Navbar translucent` prop) or a solid bar. Default True because
    # the website hard-coded `translucent` before this field existed, so every
    # existing tenant is unchanged; a site whose hero is busy behind the bar
    # turns it off for a solid, always-legible header.
    navbar_translucent = models.BooleanField(
        default=True,
        help_text="Make the navbar semi-transparent with a backdrop blur (off = a solid bar).",
    )

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
    # The credit owed for `img_about` - see `img_hero_attribution` above.
    img_about_attribution = models.CharField(max_length=255, blank=True, default="")
    img_about_attribution_url = models.URLField(max_length=500, blank=True, default="")

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

    # ── Maps ──────────────────────────────────────────────────────────────────
    # Which basemap every map on this tenant's site is painted from - the contact
    # page's locations, an event's pin, and the booking page's map of the chosen
    # branch. One setting for all of them, so a customer cannot be shown two
    # different worlds on two pages of the same site.
    #
    # ⚠ This chooses a *style*, not what the style contains. The maps draw raster
    # tiles, and roads, labels and building footprints are baked into each PNG
    # before it arrives, so there is no "hide the houses" flag here and there
    # cannot be one - the only way to that is `custom` below, pointed at a style
    # authored in a hosted provider's editor with the layer deleted. See
    # `packages/ui/src/core-elements/basemaps.ts`, which holds the matching list
    # and each style's required credit.
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
        help_text="Which basemap this site's maps are drawn from. 'Custom' uses "
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
    # party and linked another; blank here renders the credit as plain text
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

    # ── Rewards (loyalty points) ────────────────────────────────────────────────
    # The **global** switch for the whole program. With it off nothing anywhere
    # earns, shows or spends a point - the catalog's own `points_award` /
    # `points_price` columns keep their values but are never read, so a tenant
    # can turn the program off for a season and back on without re-entering the
    # numbers. Every surface gates on this one flag rather than on "does this
    # item have points set", which is why an item that a tenant forgot to price
    # in points is simply not redeemable rather than free.
    rewards_enabled = models.BooleanField(
        default=False,
        help_text="Turn the rewards program on. Off, nothing earns or spends points.",
    )

    # How many points one unit of currency spent is worth, and the one number
    # that keeps the program coherent across a catalog. Nothing at runtime reads
    # it - a purchase earns whatever the item's own `points_award` says, not a
    # figure derived here - it is the rate the CMS's points calculator works an
    # item's two numbers *out* from, so that points earned on a taco are worth
    # the same as points earned on a pizza. Left to drift per item, a customer
    # simply farms whichever family pays best and redeems whichever costs least.
    #
    # Decimal rather than an integer because the useful rate depends entirely on
    # the currency: 10 points per US$1 reads well, 10 points per CLP$1 does not.
    points_per_currency = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("1.00"),
        help_text=(
            "Points a customer earns per 1 unit of currency spent. Used by the "
            "CMS calculator to work out an item's points, not at checkout."
        ),
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

    # ── Catalog kind labels ───────────────────────────────────────────────────
    # What this tenant *calls* the two Buyable families it can sell: a workshop
    # renames "Services" to "Lo que hacemos". (A menu is sectioned by the
    # tenant's own MenuCategory rows, so it has nothing to rename here.)
    #
    # These are *display* overrides and nothing else. Every URL
    # (`/categories/products`, `/products/<slug>`) is structural and stays as it
    # is - renaming a label must not move a page a customer has bookmarked or a
    # search engine has indexed. Blank means "use the frontend's own
    # translation", which is why they are nullable with no default: a default
    # would have to be written in one language and would then be wrong on the
    # four locales the site does not store copy for.
    #
    # Bilingual in the same shape as every other pair on this model: the bare
    # column is the Spanish copy and `en_*` the English one. `max_length=64`
    # rather than the 255 its siblings carry - the string lands in a navbar
    # item as well as a page heading, and a paragraph pasted here would break
    # the bar rather than the sentence.
    kind_label_product = models.CharField(max_length=64, null=True, blank=True)
    en_kind_label_product = models.CharField(max_length=64, null=True, blank=True)
    kind_label_service = models.CharField(max_length=64, null=True, blank=True)
    en_kind_label_service = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        verbose_name = "System"
        verbose_name_plural = "Systems"

    def __str__(self):
        return f"{self.site_name} ({self.host})"

    def save(self, *args, **kwargs):
        """Fill `site_prefix` from the host before the row can be written blank.

        This is what lets every other door stay simple: a `System` created in a
        test, a fixture, the Django admin or a shell has a working slug
        namespace without anyone remembering to pass one, and a second site on
        the same database does not collide with the first over a shared default.

        ⚠ It only ever *fills* - a prefix an operator typed is never rewritten,
        because the catalog's slugs are built from it and quietly changing it
        would orphan every URL on the site. `update_fields` is widened when it
        fills, or the write it was about to make would silently drop the value.
        """
        if not self.site_prefix:
            from core.site_prefix import default_prefix_for_host, unique_prefix

            self.site_prefix = unique_prefix(
                default_prefix_for_host(self.host), exclude_pk=self.pk,
            )
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "site_prefix"}
        super().save(*args, **kwargs)

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


def branch_map_upload_path(instance, filename):
    """Where a branch's rendered map screenshot is stored.

    Tenant-prefixed like every other file (see `core.tenant_paths`) and named
    after the branch, so re-picking a location overwrites nothing else and the
    file in the bucket is traceable with no database lookup. A `uuid4` rides in
    the name because storage never overwrites - it appends a suffix instead -
    and without one a branch whose pin moved five times would leave five files
    behind with only the last of them referenced.
    """
    ext = os.path.splitext(filename)[1].lstrip(".") or "jpg"
    base = f"pictures/branchmap/{instance.pk or 'new'}-{uuid.uuid4().hex}.{ext}"
    return tenant_path(system_id_for(instance), base)


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
    # The half of "where is it" a street address cannot carry: the landmark to
    # turn at, which gate to use, what floor, where to park. A separate column
    # rather than more lines in `address` because the two are read by different
    # things - `address` is what a geocoder and a postal label want, this is
    # what a person standing outside wants - and the storefront renders them as
    # two labelled lines.
    location_details = models.TextField(
        null=True,
        blank=True,
        help_text=(
            "How to find the entrance once you are there (landmarks, floor, "
            "parking). Shown under the map and sent in booking emails."
        ),
    )
    en_location_details = models.TextField(
        null=True,
        blank=True,
        help_text=(
            "English version of the location details. Shown to readers on the "
            "English site; the Spanish one is used when this is blank."
        ),
    )
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

    # A picture of this location on the map, with the tenant's brandmark as its
    # pin. **Rendered in the browser by the CMS's map picker** and uploaded with
    # the coordinates it belongs to - not drawn here, and never drawn per
    # send: an order email cannot run JavaScript and this API cannot fetch map
    # tiles for every message it puts in a queue, so the one moment where a map
    # of this place is already on screen (an operator choosing the pin) is where
    # the image comes from.
    #
    # ⚠ It is a **snapshot and can go stale**: moving the pin re-renders it, but
    # changing the tenant's brandmark or its basemap does not. That is the trade
    # for an image that costs nothing to send.
    map_image = ResizedImageField(
        null=True,
        blank=True,
        max_size=[sizes.STANDARD, None],  # type: ignore
        upload_to=branch_map_upload_path,
        help_text="Map screenshot rendered by the CMS map picker. Emailed with a booking.",
    )

    sort_order = models.PositiveIntegerField(default=0)

    # ── Booking ────────────────────────────────────────────────────────────────
    # What a bookable service needs to know about this location. They live here
    # rather than on Service because they describe the *place*: a branch keeps
    # one set of opening hours however many services are sold out of it.

    # ⚠ The one field with no sensible fallback. Django runs on UTC
    # (settings.TIME_ZONE), so a `BranchHours` row saying "09:00" is meaningless
    # until it is read against a zone - and reading it against UTC would open a
    # Mexico City salon at 3am local. Stored as an IANA name and validated
    # against the system's own tz database rather than a choices list, which
    # would go stale every time a country changed its rules.
    timezone = models.CharField(
        max_length=64,
        default="UTC",
        validators=[validate_timezone],
        help_text="IANA timezone name (e.g. America/Mexico_City). Opening hours are local to this.",
    )
    # How many **people** may be booked into one moment here. 1 is the one-person
    # business working out of their home; a three-chair salon sets 3; a boat with
    # ten seats sets 10. Deliberately on the branch and not the service: what it
    # really counts is people, chairs or rooms, which are shared by every service
    # the branch offers - per-service capacity would let three different services
    # each book the only chair at 10am.
    #
    # ⚠ The unit is **seats, not bookings**. It used to be bookings, and the two
    # only agree while every booking is for one person; a party of four now
    # consumes four of these. This field is the fallback used when the branch has
    # no `ResourcePool` rows - one implicit resource of this capacity, which is
    # exactly the behaviour a tenant that never opens the pools editor had before
    # pools existed (see `orders.services.booking.resources_for`).
    booking_capacity = models.PositiveIntegerField(
        default=1,
        help_text=(
            "How many people can be booked into the same time here (seats, chairs, places). "
            "Ignored once this location defines resource pools - their capacities are used instead."
        ),
    )
    # ⚠ There is deliberately no per-branch "slot interval" column here. Start
    # times are spaced by the **service's own duration** and by nothing else
    # (`orders.services.booking.slot_step_minutes`): a 60-minute tour is offered
    # at 9:00, 10:00, 11:00 rather than every half hour - where, with one boat,
    # taking the 9:00 kills the 9:30 anyway and half the buttons on screen are
    # there to disappear. A branch-level grid was the wrong shape for that
    # decision twice over: it applied to every service sold out of the location,
    # and it was a second source of truth beside the duration it could only
    # disagree with. See migration `core.0061`.
    #
    # How soon is too soon. Stops a customer booking the 9:00 slot at 8:58.
    booking_min_notice_hours = models.PositiveIntegerField(
        default=2,
        help_text="Minimum hours between now and the start of a bookable slot.",
    )
    booking_max_days_ahead = models.PositiveIntegerField(
        default=60,
        help_text="How far ahead the booking calendar goes.",
    )

    class Meta:
        verbose_name = "Branch"
        verbose_name_plural = "Branches"
        # Main location first, then manual order, then newest.
        ordering = ["-is_main", "sort_order", "-created"]

    def __str__(self):
        return self.name or f"Branch #{self.pk}"

    @property
    def tzinfo(self):
        """The branch's zone, falling back to UTC rather than raising.

        A row written before the validator existed (or straight into the
        database) must not 500 every availability lookup for the tenant.
        """
        try:
            return ZoneInfo(self.timezone or "UTC")
        except (ZoneInfoNotFoundError, ValueError):
            return ZoneInfo("UTC")


class BranchHours(models.Model):
    """When one branch is open on one weekday, and when it breaks for lunch.

    One row per (branch, weekday) - seven at most, and a weekday with no row is
    simply closed. That is why there is no separate "closed" flag: absence *is*
    the closure, so the CMS deleting a day and the CMS never having created one
    are the same state, and there is no third case where a row says open with no
    times in it.

    `weekday` follows **Python's** `date.weekday()` (Monday=0 … Sunday=6), not
    Django's `__week_day` lookup (Sunday=1) - the availability engine walks dates
    with `date.weekday()`, and a second convention in the same feature is how an
    off-by-one lands on the wrong day of the week.

    Times are **local wall clock** in `branch.timezone`. Storing them as
    `TimeField` rather than as offsets is what keeps them correct across a
    daylight-saving change: "we open at 9" stays 9 whatever UTC thinks.
    """

    WEEKDAY_CHOICES = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="hours")
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAY_CHOICES)
    opens_at = models.TimeField()
    closes_at = models.TimeField()
    # The midday closure. Both or neither - a start with no end cannot be
    # subtracted from the open window, so `clean` rejects it rather than letting
    # the engine guess.
    break_start = models.TimeField(null=True, blank=True)
    break_end = models.TimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Branch hours"
        verbose_name_plural = "Branch hours"
        ordering = ["branch", "weekday"]
        constraints = [
            models.UniqueConstraint(fields=["branch", "weekday"], name="branch_hours_unique_weekday"),
        ]

    def __str__(self):
        return f"{self.branch} {self.get_weekday_display()} {self.opens_at}-{self.closes_at}"

    def clean(self):
        if self.opens_at and self.closes_at and self.opens_at >= self.closes_at:
            raise ValidationError({"closes_at": "Closing time must be after opening time."})
        if bool(self.break_start) != bool(self.break_end):
            raise ValidationError({"break_start": "A break needs both a start and an end."})
        if self.break_start and self.break_end:
            if self.break_start >= self.break_end:
                raise ValidationError({"break_end": "Break end must be after break start."})
            if self.break_start < self.opens_at or self.break_end > self.closes_at:
                raise ValidationError({"break_start": "The break must fall inside opening hours."})


class ResourcePool(models.Model):
    """A named group of interchangeable things a booking consumes seats on.

    "Large boats", "Guides", "Treatment rooms". A pool exists so the availability
    engine can answer a question `Branch.booking_capacity` alone cannot: *can
    these six people travel together?* A branch with ten seats spread over five
    two-seat boats has capacity for ten customers and room for no party of three,
    and only a per-resource model can tell those apart.

    **Pools are entirely opt-in.** A branch with no pools falls back to one
    implicit resource carrying `Branch.booking_capacity`, which reproduces the
    pre-pool behaviour exactly - see `orders.services.booking.resources_for`.
    That fallback is the whole safety story for every tenant already taking
    bookings, so it must not be "tidied" into a data migration that creates a
    real pool per branch: the implicit case has to keep working for a branch
    created tomorrow, too.

    Tenancy flows pool → branch → system, like `BranchHours`, rather than through
    a second `system` FK that could disagree with `branch.system`.
    """

    branch = models.ForeignKey(
        Branch, on_delete=models.CASCADE, related_name="resource_pools",
    )

    name = models.CharField(max_length=255)
    en_name = models.CharField(max_length=255, null=True, blank=True)

    # The singular noun for one member of the pool - "boat", "guide", "table".
    # Used in customer-facing copy ("3 seats left on this boat") and in the CMS,
    # which is why it is translated like every other display string here.
    unit_label = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        help_text='What one of these is called, singular: "boat", "guide", "table".',
    )
    en_unit_label = models.CharField(max_length=64, null=True, blank=True)

    # Whether the customer gets to choose *which* one. Off is the common case -
    # a salon assigns whichever chair is free and the customer never hears about
    # it - and it is what keeps `BookingResource.name` an internal label. Turning
    # it on publishes those names on the booking page.
    customer_selectable = models.BooleanField(
        default=False,
        help_text="Let the customer pick a specific one when booking.",
    )

    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Resource pool"
        verbose_name_plural = "Resource pools"
        ordering = ["sort_order", "pk"]

    def __str__(self):
        return f"{self.name} ({self.branch})"


class BookingResource(models.Model):
    """One bookable thing inside a pool, with the number of people it holds.

    **One row per resource that differs in capacity or that a customer can pick
    by name.** Six identical eight-seat tables are *one* row with `capacity=48`,
    not six rows - the engine only needs to tell parties apart from each other,
    and six rows would make it refuse a party of ten that four of those tables
    could seat together. Two boats of different sizes are two rows, because which
    one a party of six lands on is a real question with a real answer.

    `capacity` is in **people**, matching `Branch.booking_capacity`. A resource
    that is not really about seating (one guide, one chair) simply keeps the
    default of 1.
    """

    pool = models.ForeignKey(
        ResourcePool, on_delete=models.CASCADE, related_name="resources",
    )

    name = models.CharField(max_length=255)
    # Only ever shown when the pool is `customer_selectable`; a proper noun
    # ("Montse", "Panga Marlin") leaves it blank and reads the same in every
    # locale.
    en_name = models.CharField(max_length=255, null=True, blank=True)

    capacity = models.PositiveIntegerField(
        default=1,
        help_text="How many people this one holds.",
    )

    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Booking resource"
        verbose_name_plural = "Booking resources"
        ordering = ["sort_order", "pk"]

    def __str__(self):
        return f"{self.name} ({self.pool.name})"


class ContactMessage(Common):
    """A question a customer sent through a contact form.

    Sent either from the site's contact page or from a product/service/menu-item
    detail page - the latter records which item it was about, so an admin reading
    the inbox knows the context without the customer having to spell it out.

    Stores customer PII (name/email/phone), so it is exposed only to a tenant's
    own admins (the inbox), never on any public endpoint. A logged-in sender is
    linked via `user`, and their account name/email are used rather than trusting
    the body.

    A customer reaches the tenant by **email or WhatsApp** - `preferred_channel`
    records which they asked to be answered on, and `reply_channel` records which
    one an admin actually used. The two are separate because they genuinely
    disagree: a customer may leave both addresses, and an admin may answer by
    email anyway.
    """

    # How a customer asked to be reached, and how an admin replied. A WhatsApp
    # reply leaves this app entirely (the admin's own WhatsApp sends it via a
    # wa.me deep link), so it is *recorded* here rather than confirmed - see
    # AdminContactMessageReplyView.
    CHANNEL_EMAIL = "email"
    CHANNEL_WHATSAPP = "whatsapp"
    CHANNEL_CHOICES = (
        (CHANNEL_EMAIL, "Email"),
        (CHANNEL_WHATSAPP, "WhatsApp"),
    )

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
    # Either of these may be blank, but never both - the view refuses a message
    # with no way to answer it. `email` was once required; it is optional now
    # that a customer may leave a WhatsApp number instead, so every reader has to
    # treat it as possibly empty (the notification email's `reply_to` especially).
    email = models.EmailField(max_length=254, blank=True, default="")
    # The customer's WhatsApp number, as typed. Deliberately a free CharField
    # like `Branch.whatsapp` rather than a validated phone type: the wa.me link
    # strips it to digits at render time, and refusing an oddly-formatted number
    # would lose the message rather than the formatting.
    phone = models.CharField(max_length=32, null=True, blank=True)
    preferred_channel = models.CharField(
        max_length=16, choices=CHANNEL_CHOICES, default=CHANNEL_EMAIL
    )
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

    # An admin's reply, sent back to the customer from the inbox. For an email
    # reply these are set only once the mail has actually gone out, so the inbox
    # shows a truthful "Replied" state and a second admin does not answer again
    # unaware. ⚠ A WhatsApp reply cannot make that promise: it is handed to the
    # admin's own WhatsApp through a wa.me link and this app never hears back, so
    # `reply_channel="whatsapp"` means "an admin said they sent this", not "this
    # was delivered". Keep the distinction visible wherever it is displayed.
    reply_channel = models.CharField(
        max_length=16, choices=CHANNEL_CHOICES, null=True, blank=True
    )
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
        # Either contact detail may be blank now, so fall back rather than
        # printing an empty pair of brackets.
        return f"Message from {self.name} ({self.email or self.phone or '-'})"


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
