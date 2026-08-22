"""
site_payload - portable serialize / apply for a customer System's content.

This is the backbone of **publishing a site to production**. A site's landing
page is 100 % backend-driven (System + success stories + highlights + the
product / service / menu catalog), so "publishing" a locally-seeded, tested site
means moving *that content* into the production database. Menu items carry their
priced `ingredients`; the internal `recipe_steps` are kitchen IP and are not
seeded or published - the customer maintains them in the production CMS.

`serialize_system` turns a `System` (and its children) into a plain, brief-shaped
dict - the same schema `seed_site` consumes (see `seed_assets/README.md`) but with
each record's real **slug** so the target can upsert deterministically.

**Images travel beside the payload, not inside it.** Each record carries only
`image_file` - the storage-relative *name* of the photo it is using - and
`export_site --images` writes those files into a companion zip, the same shape
`core/backup.py` uses for the same reason (a base64 blob per image would inflate
a JSON document that is meant to stay readable, and hold every photo in memory
twice). A payload sent without an archive publishes text alone, exactly as this
module did before images were transportable at all.

That became worth doing when seeded images stopped being ours: `/seed-site` now
fills a brief from a free stock bank (Pexels/Pixabay), whose licences let the
customer keep the photo commercially - so the picture a site was approved with
can be the picture it launches with, instead of the customer re-uploading forty
files by hand. The credit that makes it legal (`BasePicture.attribution`) rides
in the text payload with everything else.

`apply_payload` ingests that dict on the other side: it **upserts** the System by
host and every child by slug, and - crucially - **fills an image only where the
target has none**, so a customer's CMS-uploaded photo is never clobbered by a
re-publish. `reset=True` wipes the System's prior stories/highlights/catalog
first for an exact replace - which is also the only way a published image is
ever replaced, since it deletes the row rather than overwriting the file.

Consumers: the `export_site` management command (serialize, run locally) and the
`PublishSiteView` API endpoint (apply, on production). The `seed_site` command
imports `SYSTEM_TEXT_FIELDS` from here so seeding and publishing share one source
of System field truth.
"""

from __future__ import annotations

import zipfile
from contextvars import ContextVar
from datetime import timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone as django_timezone
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify

from catalog.models import (
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemIngredient,
    MenuItemIngredientOption,
    MenuSize,
    Product,
    ProductCategory,
    Service,
    ServiceCategory,
)
from core.models import (
    KIND_LABEL_FIELDS,
    CompanyHighlight,
    CompanyHighlightItem,
    Event,
    SuccessStory,
    System,
)

# System text/URL fields carried in the payload (never image files). Shared with
# `seed_site` so both paths agree on which System fields are copyable content.
SYSTEM_TEXT_FIELDS = (
    "site_name",
    "site_description",
    "en_site_description",
    "slogan",
    "primary_color",
    "secondary_color",
    "navbar_translucent",
    "about",
    "en_about",
    "mission",
    "en_mission",
    "vision",
    "en_vision",
    # The credits owed for the hero and about photographs when they came from a
    # stock bank. They are text, so they travel like any other copy - and they
    # have to travel with the images they describe, or a published site shows a
    # bank photo with no credit while `stock_image_count` reads zero.
    "img_hero_attribution",
    "img_hero_attribution_url",
    "img_about_attribution",
    "img_about_attribution_url",
    # Site-wide contact details - portable (no per-environment ids). Physical
    # `Branch` locations are NOT published here; they are per-environment content.
    "contact_email",
    "social_links",
    "highlights_bg",
    "highlights_title",
    "en_highlights_title",
    "highlights_subtitle",
    "en_highlights_subtitle",
    "catalog_items_bg",
    "highlights_top_divider",
    "highlights_bottom_divider",
    "catalog_top_divider",
    "catalog_bottom_divider",
    "hero_video_layout",
    "hero_logo_background",
    "hero_logo_scale",
    "hero_logo_background_scale",
    "hero_overlay_style",
    "hero_overlay_opacity",
    "hero_overlay_extent",
    "hero_bottom_divider",
    "hero_bottom_divider_elevation",
    "hero_text_frame",
    "watermark_enabled",
    "watermark_rotation",
    "watermark_intercalated",
    "watermark_show_logo",
    "watermark_show_brandmark",
    "watermark_size",
    "watermark_spacing",
    "watermark_opacity",
    "background_light",
    "background_dark",
    # The basemap the site's maps are painted from. Portable like the palette
    # and the fonts: it is a design decision made once per site, not a
    # per-environment id. The credit and its link travel with the tile URL for
    # the same reason they are stored together - a URL published without them
    # under-credits whoever serves the tiles.
    "map_style",
    "map_tile_url",
    "map_attribution",
    "map_attribution_url",
    "google_font_url",
    "font_display",
    "font_body",
    "video_link",
    # Spotlight promo copy travels with the site; `spotlight_items` does not -
    # its item ids are per-environment, so the trio is re-picked in each CMS.
    "spotlight_enabled",
    "spotlight_label",
    "en_spotlight_label",
    "spotlight_title",
    "en_spotlight_title",
    "spotlight_text",
    "en_spotlight_text",
    "spotlight_button_label",
    "en_spotlight_button_label",
    "spotlight_button_link",
    "privacy_policy",
    "en_privacy_policy",
    "terms_and_conditions",
    "en_terms_and_conditions",
    "user_data",
    "en_user_data",
    # What the site calls its products and its services. Copy, like the
    # spotlight labels above it - decided once when the site is written and
    # travels with it, unlike anything holding a per-environment id.
    *KIND_LABEL_FIELDS,
)

# Plain text/URL fields per child model (image fields are intentionally excluded).
#
# The credit `BasePicture` carries for its `image`. Every tuple below splices it
# in, because it is text about an image rather than an image - and because the
# credit is worthless in the environment the photo is not in. A published bank
# photo with its credit left behind in dev is the one failure mode this feature
# has, so these travel wherever an image can.
ATTRIBUTION_FIELDS = ("attribution", "attribution_url")

STORY_FIELDS = (
    "name",
    "en_name",
    "short_description",
    "en_short_description",
    "description",
    "en_description",
    "href",
    *ATTRIBUTION_FIELDS,
)
HIGHLIGHT_FIELDS = (
    "name",
    "en_name",
    "category",
    "en_category",
    "description",
    "en_description",
    "short_description",
    "icon",
    *ATTRIBUTION_FIELDS,
)
HIGHLIGHT_ITEM_FIELDS = ("name", "en_name", "description", "icon", *ATTRIBUTION_FIELDS)
# An event's copy and its place-as-typed. The `branch` FK is deliberately absent
# for the same reason `spotlight_items` is: a branch id is per-environment, so
# publishing one would point a production event at whatever row happens to hold
# that pk there - or at nothing. The tenant re-picks the location in the prod
# CMS; the free-text venue below travels and is what a published event shows
# until they do.
EVENT_FIELDS = (
    "name",
    "en_name",
    "short_description",
    "en_short_description",
    "description",
    "en_description",
    "href",
    "venue_name",
    "en_venue_name",
    "address",
    *ATTRIBUTION_FIELDS,
)
CATEGORY_FIELDS = ("name", "en_name", "description", "short_description", *ATTRIBUTION_FIELDS)
BUYABLE_TEXT_FIELDS = (
    "name",
    "en_name",
    "description",
    "en_description",
    "short_description",
    "href",
    *ATTRIBUTION_FIELDS,
)
# Menu-item dietary/serving flags carried only when truthy (they default False /
# null on the target, so a lean payload never needs the falsy case).
MENU_ITEM_FLAG_FIELDS = (
    "eta_minutes",
    "spice_level",
    "portions",
    "is_organic",
    "is_vegetarian",
    "is_vegan",
    "is_gluten_free",
    "allergens",
)
# The reusable Ingredient catalog: identity + measurement, plus its FDA panel.
INGREDIENT_CATALOG_TEXT_FIELDS = (
    "name", "en_name", "description", "en_description", "unit",
)
INGREDIENT_NUTRIENT_FIELDS = Ingredient.NUTRIENT_FIELDS


# --------------------------------------------------------------------------- #
# Serialize  (DB -> portable dict)
# --------------------------------------------------------------------------- #

def _pick(obj, fields):
    """Truthy-only projection: skip None/empty so a lean payload never blanks a
    populated target field on update.

    Also emits ``image_file`` - the storage-relative *name* of this row's image,
    never its bytes. It is always written, even when no archive is being built,
    for two reasons: it costs one short string, and it makes the exported JSON
    say which photo each record was carrying, which is otherwise unknowable from
    a payload that has never transported one. The apply side ignores it unless
    an archive arrives alongside, so a payload exported without `--images`
    behaves exactly as it did before this existed.
    """
    out = {}
    for f in fields:
        v = getattr(obj, f, None)
        if v not in (None, ""):
            out[f] = v
    image = getattr(obj, "image", None)
    if image:
        out["image_file"] = image.name
    return out


def _story_dict(s: SuccessStory) -> dict:
    return {"slug": s.slug, **_pick(s, STORY_FIELDS)}


def _highlight_item_dict(i: CompanyHighlightItem) -> dict:
    return {"sort_order": i.sort_order, **_pick(i, HIGHLIGHT_ITEM_FIELDS)}


def _highlight_dict(h: CompanyHighlight) -> dict:
    return {
        "slug": h.slug,
        "size": h.size,
        "sort_order": h.sort_order,
        **_pick(h, HIGHLIGHT_FIELDS),
        "items": [_highlight_item_dict(i) for i in h.items.all()],
    }


def _event_dict(e: Event) -> dict:
    """One event, with its instants as ISO-8601 strings.

    ``_pick`` would carry the two datetimes through as `datetime` objects, which
    `export_site`'s `json.dumps` cannot encode - so they are formatted here and
    parsed back in `_apply_events`. Everything else on the model is either copy
    (`EVENT_FIELDS`), a flag, or the coordinates.
    """
    d = {"slug": e.slug, **_pick(e, EVENT_FIELDS)}
    d["starts_at"] = e.starts_at.isoformat()
    if e.ends_at is not None:
        d["ends_at"] = e.ends_at.isoformat()
    d["is_all_day"] = e.is_all_day
    d["timezone"] = e.timezone
    d["is_featured"] = e.is_featured
    if e.latitude is not None:
        d["latitude"] = str(e.latitude)
    if e.longitude is not None:
        d["longitude"] = str(e.longitude)
    return d


def _product_dict(p: Product) -> dict:
    d = {"slug": p.slug, **_pick(p, BUYABLE_TEXT_FIELDS)}
    d["price"] = str(p.price)
    if p.compare_price is not None:
        d["compare_price"] = str(p.compare_price)
    d["currency"] = p.currency
    d["is_featured"] = p.is_featured
    d["in_stock"] = p.in_stock
    if p.stock_count is not None:
        d["stock_count"] = p.stock_count
    return d


def _service_dict(s: Service) -> dict:
    d = {"slug": s.slug, **_pick(s, BUYABLE_TEXT_FIELDS)}
    d["price"] = str(s.price)
    if s.compare_price is not None:
        d["compare_price"] = str(s.compare_price)
    d["currency"] = s.currency
    d["is_featured"] = s.is_featured
    if s.duration is not None:
        d["duration"] = s.duration
    if s.modality:
        d["modality"] = s.modality
    return d


def _product_category_dict(c: ProductCategory) -> dict:
    return {
        "slug": c.slug,
        **_pick(c, CATEGORY_FIELDS),
        "products": [_product_dict(p) for p in c.products.all()],
    }


def _service_category_dict(c: ServiceCategory) -> dict:
    return {
        "slug": c.slug,
        **_pick(c, CATEGORY_FIELDS),
        "services": [_service_dict(s) for s in c.services.all()],
    }


def _ingredient_catalog_dict(i: Ingredient) -> dict:
    """One reusable Ingredient (system-scoped): identity + measurement + the
    FDA nutrition panel. Keyed by ``slug`` on import."""
    d = {"slug": i.slug, **_pick(i, INGREDIENT_CATALOG_TEXT_FIELDS)}
    if i.nutrition_basis_quantity is not None:
        d["nutrition_basis_quantity"] = str(i.nutrition_basis_quantity)
    for f in INGREDIENT_NUTRIENT_FIELDS:
        v = getattr(i, f)
        if v is not None:
            d[f] = str(v)
    return d


def _ingredient_dict(i: MenuItemIngredient) -> dict:
    """One menu-item ingredient: a reference to a reusable Ingredient (by slug)
    plus the recipe portion and pricing. Identity/nutrition are not repeated
    here - they live on the referenced Ingredient.

    A row may be a **single-select choice group** (`group_name` + `options`), in
    which case its own `ingredient` is the default option and each option is
    another reusable Ingredient with its own per-unit price. The group has to
    travel: it is how a dish sold in several sizes is priced, so dropping it on
    publish would leave production with only the base-price variant.
    """
    d = {
        "sort_order": i.sort_order,
        "ingredient": i.ingredient.slug if i.ingredient_id else None,
    }
    if i.group_name:
        d["group_name"] = i.group_name
    if i.group_en_name:
        d["group_en_name"] = i.group_en_name
    if i.quantity is not None:
        d["quantity"] = str(i.quantity)
    if i.unit:
        d["unit"] = i.unit
    d["price"] = str(i.price)
    d["is_removable"] = i.is_removable
    d["max_quantity"] = i.max_quantity
    d["number_of_free_portions"] = i.number_of_free_portions
    d["default_quantity"] = i.default_quantity
    options = [
        {
            "ingredient": o.ingredient.slug if o.ingredient_id else None,
            "price": str(o.price),
            "sort_order": o.sort_order,
        }
        for o in i.options.all()
    ]
    if options:
        d["options"] = options
    return d


# A size's own fields. `portion`/`unit`/`price_delta`/`is_default` are handled
# separately below: the first two may legitimately be null and the last two are
# meaningful when falsy, which `_pick`'s truthy-only projection would drop.
MENU_SIZE_TEXT_FIELDS = ("name", "en_name", "description", "en_description", *ATTRIBUTION_FIELDS)


def _menu_size_dict(s) -> dict:
    """One size, for either owner - a category's list or a dish's override rows.

    Keyed on apply by (owner, sort_order), like a menu-item ingredient, because a
    size has no slug of its own.
    """
    d = {"sort_order": s.sort_order, **_pick(s, MENU_SIZE_TEXT_FIELDS)}
    if s.portion is not None:
        d["portion"] = str(s.portion)
    if s.unit:
        d["unit"] = s.unit
    # Always carried, unlike the text fields: 0.00 is the *normal* delta (the
    # size sold at the list price) and a default of False is a real state.
    d["price_delta"] = str(s.price_delta)
    d["is_default"] = s.is_default
    return d


def _menu_item_dict(m: MenuItem) -> dict:
    d = {"slug": m.slug, **_pick(m, BUYABLE_TEXT_FIELDS)}
    d["price"] = str(m.price)
    if m.compare_price is not None:
        d["compare_price"] = str(m.compare_price)
    d["currency"] = m.currency
    d["is_featured"] = m.is_featured
    d["is_available"] = m.is_available
    # Dietary/serving flags travel only when set (see MENU_ITEM_FLAG_FIELDS).
    for f in MENU_ITEM_FLAG_FIELDS:
        v = getattr(m, f)
        if v not in (None, "", False):
            d[f] = v
    d["ingredients"] = [_ingredient_dict(i) for i in m.ingredients.all()]
    # Carried unconditionally: False is the meaningful state (this dish opts out
    # of a category that sizes everything else), and the flag list above drops
    # falsy values.
    d["sizes_enabled"] = m.sizes_enabled
    # The dish's OWN rows only - its override. A dish that inherits its
    # category's sizes carries none, and must arrive inheriting too; exporting
    # the resolved list would turn every dish into an overriding one and detach
    # it from the category on the far side.
    own_sizes = [_menu_size_dict(s) for s in m.own_sizes.all()]
    if own_sizes:
        d["sizes"] = own_sizes
    return d


def _menu_category_dict(c: MenuCategory) -> dict:
    d = {
        "slug": c.slug,
        **_pick(c, CATEGORY_FIELDS),
        "menu_items": [_menu_item_dict(m) for m in c.menu_items.all()],
    }
    sizes = [_menu_size_dict(s) for s in c.sizes.all()]
    if sizes:
        d["sizes"] = sizes
    return d


def _system_image_files(system: System) -> dict:
    """System's two photographic images, as ``<field>_file`` name refs.

    Named per field rather than through `_pick`'s single `image_file` because
    System carries several images and only these two can be a photograph - the
    rest are the customer's own mark (see `img_hero_attribution` on the model).
    """
    out = {}
    for field in ("img_hero", "img_about"):
        image = getattr(system, field, None)
        if image:
            out[f"{field}_file"] = image.name
    return out


def serialize_system(system: System) -> dict:
    """Serialize a System + its content into a portable, brief-shaped dict.

    Image **bytes** are not in here - each record carries only `image_file`, the
    storage-relative name of the file it is using. `export_site --images` writes
    those files into a companion zip, which `apply_payload` reads if it is given
    one; see this module's docstring.
    """
    return {
        "system": {
            "host": system.host,
            **_pick(system, SYSTEM_TEXT_FIELDS),
            **_system_image_files(system),
        },
        "success_stories": [
            _story_dict(s) for s in system.success_stories.all()
        ],
        "highlights": [
            _highlight_dict(h)
            for h in system.highlights.all().prefetch_related("items")
        ],
        "events": [_event_dict(e) for e in system.events.all()],
        "product_categories": [
            _product_category_dict(c)
            for c in system.product_categories.all().prefetch_related("products")
        ],
        "service_categories": [
            _service_category_dict(c)
            for c in system.service_categories.all().prefetch_related("services")
        ],
        # The reusable ingredient catalog is emitted before menu_categories so
        # an importer can create it first and then link each menu-item
        # ingredient to it by slug.
        "ingredients": [
            _ingredient_catalog_dict(i) for i in system.ingredients.all()
        ],
        "menu_categories": [
            _menu_category_dict(c)
            for c in system.menu_categories.all().prefetch_related(
                "sizes",
                "menu_items__own_sizes",
                "menu_items__ingredients__options__ingredient",
                "menu_items__ingredients__ingredient"
            )
        ],
    }


# --------------------------------------------------------------------------- #
# Apply  (portable dict -> DB, upsert; never touches image fields on update)
# --------------------------------------------------------------------------- #

def _decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        return Decimal("0.00")


def _datetime(value):
    """Parse an ISO-8601 instant back out of a payload, or ``None``.

    Django runs on UTC and refuses a naive datetime, so a value that carries no
    offset (a hand-written brief) is anchored to UTC rather than rejected -
    events are announced to the hour, and a payload that omitted the zone meant
    the site's own, not "invalid". The event's own ``timezone`` field is what
    renders it back to a reader.
    """
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if django_timezone.is_naive(parsed):
        return django_timezone.make_aware(parsed, dt_timezone.utc)
    return parsed


def _slug_of(item: dict) -> str | None:
    return item.get("slug") or slugify(item.get("name") or "") or None


def _defaults(system, item: dict, fields) -> dict:
    """Build update_or_create defaults from a payload item. Only provided,
    non-image fields are set - so images on an existing record survive."""
    defaults = {"system": system}
    for f in fields:
        if item.get(f) is not None:
            defaults[f] = item[f]
    return defaults


def _reset(system: System) -> None:
    system.success_stories.all().delete()
    system.highlights.all().delete()
    system.events.all().delete()
    Product.objects.filter(system=system).delete()
    system.product_categories.all().delete()
    Service.objects.filter(system=system).delete()
    system.service_categories.all().delete()
    # MenuItem first (cascades its MenuItemIngredient rows), then the reusable
    # Ingredient catalog they PROTECT-referenced, then the categories.
    MenuItem.objects.filter(system=system).delete()
    Ingredient.objects.filter(system=system).delete()
    system.menu_categories.all().delete()


def _upsert(counts: dict, was_created: bool, obj=None, item=None) -> None:
    counts["created" if was_created else "updated"] += 1
    if obj is not None and item is not None:
        attach_image(obj, item)


# The image archive for the publish currently being applied, if one was sent.
# A ContextVar rather than a module global because gunicorn runs `gthread`
# workers: two tenants publishing at the same instant would otherwise read each
# other's zip, and the failure mode is a customer's site wearing another
# customer's photographs.
_ARCHIVE: ContextVar = ContextVar("site_payload_archive", default=None)


def attach_image(obj, item: dict, key: str = "image_file", field: str = "image") -> bool:
    """Give `obj` the image named in `item[key]`, if it has none already.

    **Fill, never clobber.** A record that already carries an image keeps it, so
    a customer who replaced a seeded photo with their own in the CMS does not
    lose it on the next content publish - the same guarantee `_defaults` gives
    for image fields, extended to the case where we now *do* have bytes to
    write. `--reset` still replaces everything, because it deletes the rows
    first and a recreated row has no image to protect.

    Returns True when a file was actually written.
    """
    archive = _ARCHIVE.get()
    if archive is None:
        return False
    name = item.get(key)
    if not name or getattr(obj, field, None):
        return False
    data = archive.read_member(name)
    if data is None:
        return False
    # Store under the basename only: the source path is namespaced by the *dev*
    # tenant's id (`t/<system_id>/…`), and reusing it here would file the photo
    # under whatever system happens to hold that id in production. The upload_to
    # callable re-derives the correct prefix from the target row.
    getattr(obj, field).save(name.rsplit("/", 1)[-1], ContentFile(data), save=True)
    return True


class ImageArchive:
    """Read-only view over the zip `export_site --images` builds.

    Wraps `zipfile.ZipFile` so `attach_image` can ask for a member by its
    storage-relative name and get `None` - rather than an exception - for one
    that is missing. A publish whose archive is short a few files must still
    publish the rest: the images are a bonus on top of the content, and half a
    catalog of photos beats a 500.
    """

    def __init__(self, zf):
        self._zf = zf
        self._names = set(zf.namelist())

    def read_member(self, name: str) -> bytes | None:
        if name not in self._names:
            return None
        try:
            return self._zf.read(name)
        except (KeyError, zipfile.BadZipFile, OSError):
            return None


def media_names(payload: dict) -> set[str]:
    """Every storage-relative image name referenced anywhere in a payload.

    Walks the whole structure rather than mirroring its shape, so a section
    added to `serialize_system` is picked up here with no edit - the drift this
    module's own docstring warns about.
    """
    found: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k.endswith("image_file") or (
                    k.startswith("img_") and k.endswith("_file")
                ):
                    if isinstance(v, str) and v:
                        found.add(v)
                else:
                    walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found


def _apply_stories(system, items) -> dict:
    counts = {"created": 0, "updated": 0}
    for it in items:
        slug = _slug_of(it)
        if not slug:
            continue
        obj, created = SuccessStory.objects.update_or_create(
            slug=slug, defaults=_defaults(system, it, STORY_FIELDS)
        )
        _upsert(counts, created, obj, it)
    return counts


def _apply_events(system, items) -> dict:
    """Upsert events by slug.

    An item with no parsable ``starts_at`` is **skipped**, not defaulted to now:
    a date is the whole of what makes an event an event, and inventing one would
    publish a fabricated announcement onto a customer's live site.
    """
    counts = {"created": 0, "updated": 0}
    for it in items:
        slug = _slug_of(it)
        if not slug:
            continue
        starts_at = _datetime(it.get("starts_at"))
        if starts_at is None:
            continue
        defaults = _defaults(system, it, EVENT_FIELDS)
        defaults["starts_at"] = starts_at
        ends_at = _datetime(it.get("ends_at"))
        if ends_at is not None:
            defaults["ends_at"] = ends_at
        for flag in ("is_all_day", "is_featured"):
            if it.get(flag) is not None:
                defaults[flag] = bool(it[flag])
        if it.get("timezone"):
            defaults["timezone"] = it["timezone"]
        for coord in ("latitude", "longitude"):
            if it.get(coord) is not None:
                defaults[coord] = _decimal(it[coord])
        obj, created = Event.objects.update_or_create(slug=slug, defaults=defaults)
        _upsert(counts, created, obj, it)
    return counts


def _apply_highlights(system, items) -> dict:
    counts = {"created": 0, "updated": 0}
    for it in items:
        slug = _slug_of(it)
        if not slug:
            continue
        defaults = _defaults(system, it, HIGHLIGHT_FIELDS)
        if it.get("size"):
            defaults["size"] = it["size"]
        if it.get("sort_order") is not None:
            defaults["sort_order"] = it["sort_order"]
        hl, created = CompanyHighlight.objects.update_or_create(
            slug=slug, defaults=defaults
        )
        _upsert(counts, created, hl, it)
        # Sub-items have no global slug; key them by (highlight, sort_order) so a
        # re-publish updates in place rather than duplicating.
        for j, sub in enumerate(it.get("items") or []):
            item_defaults = {}
            for f in HIGHLIGHT_ITEM_FIELDS:
                if sub.get(f) is not None:
                    item_defaults[f] = sub[f]
            sub_obj, _ = CompanyHighlightItem.objects.update_or_create(
                highlight=hl,
                sort_order=sub.get("sort_order", j),
                defaults=item_defaults,
            )
            attach_image(sub_obj, sub)
    return counts


def _apply_products(system, categories) -> dict:
    counts = {"created": 0, "updated": 0, "categories": 0}
    for c in categories:
        cslug = _slug_of(c)
        if not cslug:
            continue
        cat, _ = ProductCategory.objects.update_or_create(
            slug=cslug, defaults=_defaults(system, c, CATEGORY_FIELDS)
        )
        attach_image(cat, c)
        _apply_sizes("category", cat, c.get("sizes"))
        counts["categories"] += 1
        for p in c.get("products") or []:
            pslug = _slug_of(p)
            if not pslug:
                continue
            defaults = _defaults(system, p, BUYABLE_TEXT_FIELDS)
            defaults["category"] = cat
            defaults["price"] = _decimal(p.get("price"))
            defaults["compare_price"] = (
                _decimal(p["compare_price"]) if p.get("compare_price") else None
            )
            defaults["currency"] = p.get("currency") or "USD"
            defaults["is_featured"] = p.get("is_featured", True)
            defaults["in_stock"] = p.get("in_stock", True)
            if p.get("stock_count") is not None:
                defaults["stock_count"] = p["stock_count"]
            obj, created = Product.objects.update_or_create(
                slug=pslug, defaults=defaults
            )
            _upsert(counts, created, obj, p)
    return counts


def _apply_services(system, categories) -> dict:
    counts = {"created": 0, "updated": 0, "categories": 0}
    for c in categories:
        cslug = _slug_of(c)
        if not cslug:
            continue
        cat, _ = ServiceCategory.objects.update_or_create(
            slug=cslug, defaults=_defaults(system, c, CATEGORY_FIELDS)
        )
        attach_image(cat, c)
        _apply_sizes("category", cat, c.get("sizes"))
        counts["categories"] += 1
        for s in c.get("services") or []:
            sslug = _slug_of(s)
            if not sslug:
                continue
            defaults = _defaults(system, s, BUYABLE_TEXT_FIELDS)
            defaults["category"] = cat
            defaults["price"] = _decimal(s.get("price"))
            defaults["compare_price"] = (
                _decimal(s["compare_price"]) if s.get("compare_price") else None
            )
            defaults["currency"] = s.get("currency") or "USD"
            defaults["is_featured"] = s.get("is_featured", True)
            if s.get("duration") is not None:
                defaults["duration"] = s["duration"]
            if s.get("modality"):
                defaults["modality"] = s["modality"]
            obj, created = Service.objects.update_or_create(
                slug=sslug, defaults=defaults
            )
            _upsert(counts, created, obj, s)
    return counts


def _apply_ingredients(system, items) -> dict:
    """Upsert the reusable Ingredient catalog (keyed by global slug)."""
    counts = {"created": 0, "updated": 0}
    for ing in items:
        slug = _slug_of(ing)
        if not slug:
            continue
        defaults = _defaults(system, ing, INGREDIENT_CATALOG_TEXT_FIELDS)
        if ing.get("nutrition_basis_quantity") is not None:
            defaults["nutrition_basis_quantity"] = _decimal(
                ing["nutrition_basis_quantity"]
            )
        for f in INGREDIENT_NUTRIENT_FIELDS:
            if ing.get(f) is not None:
                defaults[f] = _decimal(ing[f])
        obj, created = Ingredient.objects.update_or_create(
            slug=slug, defaults=defaults
        )
        _upsert(counts, created, obj, ing)
    return counts


def _apply_sizes(owner_field, owner, sizes) -> None:
    """Upsert one owner's size rows, keyed by (owner, sort_order).

    Same shape as a menu-item ingredient, and for the same reason: a size has no
    slug, so position is the only identity a second database can match on. A
    re-publish therefore updates in place rather than duplicating the list.
    """
    for index, entry in enumerate(sizes or []):
        name = entry.get("name")
        if not name:
            continue
        defaults = {
            f: entry[f]
            for f in MENU_SIZE_TEXT_FIELDS
            if entry.get(f) is not None
        }
        defaults["portion"] = (
            _decimal(entry["portion"]) if entry.get("portion") is not None else None
        )
        defaults["unit"] = entry.get("unit") or None
        defaults["price_delta"] = _decimal(entry.get("price_delta", 0))
        defaults["is_default"] = entry.get("is_default", False)
        row, _ = MenuSize.objects.update_or_create(
            **{owner_field: owner},
            sort_order=entry.get("sort_order", index),
            defaults=defaults,
        )
        attach_image(row, entry)


def _apply_menu(system, categories) -> dict:
    counts = {"created": 0, "updated": 0, "categories": 0}
    # Menu-item ingredients link to reusable Ingredients by slug (applied just
    # before this in apply_payload), so resolve them once up front.
    ingredient_by_slug = {i.slug: i for i in system.ingredients.all()}
    for c in categories:
        cslug = _slug_of(c)
        if not cslug:
            continue
        cat, _ = MenuCategory.objects.update_or_create(
            slug=cslug, defaults=_defaults(system, c, CATEGORY_FIELDS)
        )
        attach_image(cat, c)
        _apply_sizes("category", cat, c.get("sizes"))
        counts["categories"] += 1
        for m in c.get("menu_items") or []:
            mslug = _slug_of(m)
            if not mslug:
                continue
            defaults = _defaults(system, m, BUYABLE_TEXT_FIELDS)
            defaults["category"] = cat
            defaults["price"] = _decimal(m.get("price"))
            defaults["compare_price"] = (
                _decimal(m["compare_price"]) if m.get("compare_price") else None
            )
            defaults["currency"] = m.get("currency") or "USD"
            defaults["is_featured"] = m.get("is_featured", True)
            defaults["is_available"] = m.get("is_available", True)
            defaults["sizes_enabled"] = m.get("sizes_enabled", True)
            for f in MENU_ITEM_FLAG_FIELDS:
                if m.get(f) is not None:
                    defaults[f] = m[f]
            item, created = MenuItem.objects.update_or_create(
                slug=mslug, defaults=defaults
            )
            _upsert(counts, created, item, m)
            _apply_sizes("menu_item", item, m.get("sizes"))
            # Menu-item ingredients reference a reusable Ingredient by slug and
            # have no global slug themselves; key them by (menu_item, sort_order)
            # so a re-publish updates in place rather than duplicating - the same
            # pattern used for highlight sub-items above. A row whose referenced
            # ingredient is unknown (catalog not imported) is skipped.
            for k, ing in enumerate(m.get("ingredients") or []):
                ingredient = ingredient_by_slug.get(ing.get("ingredient"))
                if ingredient is None:
                    continue
                ing_defaults = {"ingredient": ingredient}
                ing_defaults["quantity"] = (
                    _decimal(ing["quantity"]) if ing.get("quantity") is not None else None
                )
                ing_defaults["unit"] = ing.get("unit") or None
                ing_defaults["price"] = _decimal(ing.get("price", 0))
                ing_defaults["is_removable"] = ing.get("is_removable", False)
                ing_defaults["max_quantity"] = ing.get("max_quantity", 1)
                ing_defaults["number_of_free_portions"] = ing.get("number_of_free_portions", 0)
                ing_defaults["default_quantity"] = ing.get("default_quantity", 0)
                ing_defaults["group_name"] = ing.get("group_name") or None
                ing_defaults["group_en_name"] = ing.get("group_en_name") or None
                row, _ = MenuItemIngredient.objects.update_or_create(
                    menu_item=item,
                    sort_order=ing.get("sort_order", k),
                    defaults=ing_defaults,
                )
                # A choice group's options are replaced wholesale, not upserted:
                # unlike the group itself they carry no identity of their own
                # (an option *is* its ingredient reference), so replacing is
                # indistinguishable from editing - and nothing points at an
                # option row the way `Booking.resource` points at a resource.
                # An option whose ingredient is unknown is skipped, like the
                # group's own reference above.
                options = ing.get("options") or []
                row.options.all().delete()
                for oi, opt in enumerate(options):
                    opt_ingredient = ingredient_by_slug.get(opt.get("ingredient"))
                    if opt_ingredient is None:
                        continue
                    MenuItemIngredientOption.objects.create(
                        menu_item_ingredient=row,
                        ingredient=opt_ingredient,
                        price=_decimal(opt.get("price", 0)),
                        sort_order=opt.get("sort_order", oi),
                    )
    return counts


def apply_payload(payload: dict, *, reset: bool = False, images=None) -> dict:
    """Upsert a System + its content from a serialized payload into THIS database.

    Matches the System by host and every child by slug. `reset=True` deletes the
    System's prior stories/highlights/catalog (product, service and menu) first.
    Returns a per-section created/updated summary.

    `images` is the optional companion archive built by `export_site --images`
    (a `zipfile.ZipFile`, or anything with a `read_member(name)`). With one, a
    record that has **no image yet** is given the photograph it was carrying in
    the source database; a record that already has one keeps it. Without one,
    every image field is left alone exactly as before - which is still what a
    plain `pnpm publish-site` does.

    The fill-don't-clobber rule is the whole safety story: a customer who
    replaced a seeded stock photo with their own must not lose it because
    somebody re-published a typo fix. `--reset` is the deliberate exception, and
    it works by deleting the rows rather than by overwriting files.

    ⚠ **With an archive, the file writes happen inside the transaction**, so a
    publish carrying sixty photos holds it open for however long sixty uploads to
    object storage take. That is a deliberate trade rather than an oversight:
    unlike `_open_order`'s QR write - which is kept outside its transaction
    because it holds a *contended row lock* every checkout at that branch queues
    behind - this upserts one tenant's own content from an admin-only endpoint
    that runs a handful of times per site, and a half-published catalog would be
    worse than a slow one. If it ever needs to change, the shape is: upsert the
    rows in the transaction, attach the files after it commits.
    """
    sys_data = payload.get("system") or {}
    host = (sys_data.get("host") or "").strip().lower()
    if not host:
        raise ValueError('payload["system"]["host"] is required.')

    token = _ARCHIVE.set(images)
    try:
        return _apply(payload, sys_data, host, reset=reset)
    finally:
        _ARCHIVE.reset(token)


def _apply(payload: dict, sys_data: dict, host: str, *, reset: bool) -> dict:
    with transaction.atomic():
        system, created = System.objects.get_or_create(
            host=host,
            defaults={"site_name": sys_data.get("site_name") or host, "enabled": True},
        )
        for f in SYSTEM_TEXT_FIELDS:
            if sys_data.get(f) is not None:
                setattr(system, f, sys_data[f])
        system.enabled = True
        system.save()
        # The hero and about photographs, under their own per-field refs. Same
        # fill-don't-clobber rule as every other image.
        for field in ("img_hero", "img_about"):
            attach_image(system, sys_data, key=f"{field}_file", field=field)

        if reset:
            _reset(system)

        summary = {
            "host": host,
            "system": "created" if created else "updated",
            "success_stories": _apply_stories(system, payload.get("success_stories") or []),
            "highlights": _apply_highlights(system, payload.get("highlights") or []),
            "events": _apply_events(system, payload.get("events") or []),
            "product_categories": _apply_products(system, payload.get("product_categories") or []),
            "service_categories": _apply_services(system, payload.get("service_categories") or []),
            # Ingredients before menu items: the latter link to the former by slug.
            "ingredients": _apply_ingredients(system, payload.get("ingredients") or []),
            "menu_categories": _apply_menu(system, payload.get("menu_categories") or []),
        }
    return summary
