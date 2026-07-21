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
each record's real **slug** so the target can upsert deterministically. Image
files are ImageFields under MEDIA_ROOT and are **not portable**, so they are
omitted; only true URLs (`video_link`, `href`) travel. The customer uploads real
images in the production CMS.

`apply_payload` ingests that dict on the other side: it **upserts** the System by
host and every child by slug, and - crucially - **never touches image fields on
update**, so a customer's CMS-uploaded images are not clobbered by a re-publish.
`reset=True` wipes the System's prior stories/highlights/catalog first for an
exact replace.

Consumers: the `export_site` management command (serialize, run locally) and the
`PublishSiteView` API endpoint (apply, on production). The `seed_site` command
imports `SYSTEM_TEXT_FIELDS` from here so seeding and publishing share one source
of System field truth.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils.text import slugify

from catalog.models import (
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemIngredient,
    Product,
    ProductCategory,
    Service,
    ServiceCategory,
)
from core.models import (
    CompanyHighlight,
    CompanyHighlightItem,
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
    "about",
    "en_about",
    "mission",
    "en_mission",
    "vision",
    "en_vision",
    "highlights_bg",
    "highlights_title",
    "en_highlights_title",
    "highlights_subtitle",
    "en_highlights_subtitle",
    "catalog_items_bg",
    "hero_video_layout",
    "watermark_enabled",
    "watermark_rotation",
    "watermark_size",
    "watermark_spacing",
    "watermark_opacity",
    "background_light",
    "background_dark",
    "video_link",
    "privacy_policy",
    "en_privacy_policy",
    "terms_and_conditions",
    "en_terms_and_conditions",
    "user_data",
    "en_user_data",
)

# Plain text/URL fields per child model (image fields are intentionally excluded).
STORY_FIELDS = (
    "name",
    "en_name",
    "short_description",
    "en_short_description",
    "description",
    "en_description",
    "href",
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
)
HIGHLIGHT_ITEM_FIELDS = ("name", "en_name", "description", "icon")
CATEGORY_FIELDS = ("name", "en_name", "description", "short_description")
BUYABLE_TEXT_FIELDS = (
    "name",
    "en_name",
    "description",
    "en_description",
    "short_description",
    "href",
)
# Menu-item dietary/serving flags carried only when truthy (they default False /
# null on the target, so a lean payload never needs the falsy case).
MENU_ITEM_FLAG_FIELDS = (
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
    populated target field on update."""
    out = {}
    for f in fields:
        v = getattr(obj, f, None)
        if v not in (None, ""):
            out[f] = v
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
    here - they live on the referenced Ingredient."""
    d = {
        "sort_order": i.sort_order,
        "ingredient": i.ingredient.slug if i.ingredient_id else None,
    }
    if i.quantity is not None:
        d["quantity"] = str(i.quantity)
    if i.unit:
        d["unit"] = i.unit
    d["price"] = str(i.price)
    d["is_removable"] = i.is_removable
    d["max_quantity"] = i.max_quantity
    d["number_of_free_portions"] = i.number_of_free_portions
    d["default_quantity"] = i.default_quantity
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
    return d


def _menu_category_dict(c: MenuCategory) -> dict:
    return {
        "slug": c.slug,
        **_pick(c, CATEGORY_FIELDS),
        "menu_items": [_menu_item_dict(m) for m in c.menu_items.all()],
    }


def serialize_system(system: System) -> dict:
    """Serialize a System + its content into a portable, brief-shaped dict
    (image files omitted)."""
    return {
        "system": {"host": system.host, **_pick(system, SYSTEM_TEXT_FIELDS)},
        "success_stories": [
            _story_dict(s) for s in system.success_stories.all()
        ],
        "highlights": [
            _highlight_dict(h)
            for h in system.highlights.all().prefetch_related("items")
        ],
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
    Product.objects.filter(system=system).delete()
    system.product_categories.all().delete()
    Service.objects.filter(system=system).delete()
    system.service_categories.all().delete()
    # MenuItem first (cascades its MenuItemIngredient rows), then the reusable
    # Ingredient catalog they PROTECT-referenced, then the categories.
    MenuItem.objects.filter(system=system).delete()
    Ingredient.objects.filter(system=system).delete()
    system.menu_categories.all().delete()


def _upsert(counts: dict, was_created: bool) -> None:
    counts["created" if was_created else "updated"] += 1


def _apply_stories(system, items) -> dict:
    counts = {"created": 0, "updated": 0}
    for it in items:
        slug = _slug_of(it)
        if not slug:
            continue
        _, created = SuccessStory.objects.update_or_create(
            slug=slug, defaults=_defaults(system, it, STORY_FIELDS)
        )
        _upsert(counts, created)
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
        _upsert(counts, created)
        # Sub-items have no global slug; key them by (highlight, sort_order) so a
        # re-publish updates in place rather than duplicating.
        for j, sub in enumerate(it.get("items") or []):
            item_defaults = {}
            for f in HIGHLIGHT_ITEM_FIELDS:
                if sub.get(f) is not None:
                    item_defaults[f] = sub[f]
            CompanyHighlightItem.objects.update_or_create(
                highlight=hl,
                sort_order=sub.get("sort_order", j),
                defaults=item_defaults,
            )
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
            _, created = Product.objects.update_or_create(
                slug=pslug, defaults=defaults
            )
            _upsert(counts, created)
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
            _, created = Service.objects.update_or_create(
                slug=sslug, defaults=defaults
            )
            _upsert(counts, created)
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
        _, created = Ingredient.objects.update_or_create(
            slug=slug, defaults=defaults
        )
        _upsert(counts, created)
    return counts


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
            for f in MENU_ITEM_FLAG_FIELDS:
                if m.get(f) is not None:
                    defaults[f] = m[f]
            item, created = MenuItem.objects.update_or_create(
                slug=mslug, defaults=defaults
            )
            _upsert(counts, created)
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
                MenuItemIngredient.objects.update_or_create(
                    menu_item=item,
                    sort_order=ing.get("sort_order", k),
                    defaults=ing_defaults,
                )
    return counts


def apply_payload(payload: dict, *, reset: bool = False) -> dict:
    """Upsert a System + its content from a serialized payload into THIS database.

    Matches the System by host and every child by slug. Image fields are left
    untouched on update (never clobbers customer-uploaded images). `reset=True`
    deletes the System's prior stories/highlights/catalog (product, service and
    menu) first. Returns a
    per-section created/updated summary.
    """
    sys_data = payload.get("system") or {}
    host = (sys_data.get("host") or "").strip().lower()
    if not host:
        raise ValueError('payload["system"]["host"] is required.')

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

        if reset:
            _reset(system)

        summary = {
            "host": host,
            "system": "created" if created else "updated",
            "success_stories": _apply_stories(system, payload.get("success_stories") or []),
            "highlights": _apply_highlights(system, payload.get("highlights") or []),
            "product_categories": _apply_products(system, payload.get("product_categories") or []),
            "service_categories": _apply_services(system, payload.get("service_categories") or []),
            # Ingredients before menu items: the latter link to the former by slug.
            "ingredients": _apply_ingredients(system, payload.get("ingredients") or []),
            "menu_categories": _apply_menu(system, payload.get("menu_categories") or []),
        }
    return summary
