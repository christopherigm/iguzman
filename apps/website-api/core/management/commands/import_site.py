"""
import_site - pull a customer System's content FROM production INTO this database.

This is the inverse of the **publish** flow (`export_site` + `/api/publish-site/`).
Publishing moves a locally-seeded site *up* to production and deliberately omits
image files; `import_site` moves a production site's content *down* into the local
database **including its images**, so a developer can work against a faithful copy
of what customers actually see.

Unlike publish, this reuses the API's existing **public read endpoints** (system,
success stories, highlights, product/service/menu catalog) rather than a dedicated
endpoint, so it works against production today with no redeploy. Each read
endpoint already returns absolute image URLs; this command downloads those files
and re-saves them onto the local records' ImageFields. Menu items bring their
priced `ingredients`; the internal `recipe_steps` are kitchen IP and are never
served on the public API, so they are not imported.

Semantics (see `cli/website/website.sh pull`, which drives this):
  * The System is matched/created by host and its text + image fields overwritten.
  * Each selected content section is **reset** (the local System's existing rows
    for that section are deleted) and then rebuilt from production - so the local
    site ends up mirroring production exactly.
  * Images are always downloaded and overwritten.

Usage:
    python manage.py import_site acme.com \
        --api-url https://website-api.iguzman.com.mx \
        --user admin --password secret \
        --sections system,stories,highlights,products,services

`--sections` is a comma list drawn from: system, stories, highlights, products,
services, menu (default: all). Pass `--no-reset` to upsert without wiping first.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlparse

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import (
    MenuCategory,
    MenuItem,
    MenuItemImage,
    MenuItemIngredient,
    Product,
    ProductCategory,
    ProductImage,
    Service,
    ServiceCategory,
    ServiceImage,
)
from core.models import (
    CompanyHighlight,
    CompanyHighlightItem,
    SuccessStory,
    SuccessStoryImage,
    System,
)
from core.site_payload import SYSTEM_TEXT_FIELDS

ALL_SECTIONS = ("system", "stories", "highlights", "products", "services", "menu")

# The production WAF rejects the default "Python-urllib/x.y" User-Agent with a
# 403, so every request (JSON reads + image downloads) sends a browser-like one.
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# System ImageField names to pull (mirrors SystemSerializer's image outputs).
SYSTEM_IMAGE_FIELDS = (
    "img_logo",
    "img_logo_hero",
    "img_favicon",
    "img_manifest_1080",
    "img_manifest_512",
    "img_manifest_256",
    "img_manifest_192",
    "img_manifest_128",
    "img_about",
    "img_hero",
)

# Scalar (non-image, non-relational) fields copied verbatim per child model.
STORY_FIELDS = (
    "name", "en_name",
    "short_description", "en_short_description",
    "description", "en_description",
    "href", "fit", "background_color",
)
GALLERY_FIELDS = ("name", "en_name", "description", "en_description",
                  "href", "fit", "background_color", "sort_order")
HIGHLIGHT_FIELDS = (
    "category", "en_category", "name", "en_name",
    "short_description", "en_short_description",
    "description", "en_description",
    "href", "fit", "background_color", "icon", "size", "sort_order",
)
HIGHLIGHT_ITEM_FIELDS = (
    "name", "en_name", "description", "en_description",
    "href", "fit", "background_color", "icon", "sort_order",
)
CATEGORY_FIELDS = ("name", "en_name", "description", "en_description")
PRODUCT_FIELDS = (
    "name", "en_name", "description", "en_description",
    "short_description", "en_short_description",
    "sku", "barcode", "href", "fit", "background_color",
    "price", "compare_price", "cost_price", "currency",
    "in_stock", "stock_count", "is_featured", "is_ai_generated", "is_verified",
    "length", "width", "height", "weight", "dimension_unit", "weight_unit",
)
SERVICE_FIELDS = (
    "name", "en_name", "description", "en_description",
    "short_description", "en_short_description",
    "sku", "href", "fit", "background_color",
    "price", "compare_price", "cost_price", "currency",
    "is_featured", "is_ai_generated", "is_verified",
    "duration", "modality",
)
MENU_ITEM_FIELDS = (
    "name", "en_name", "description", "en_description",
    "short_description", "en_short_description",
    "sku", "href", "fit", "background_color",
    "price", "compare_price", "cost_price", "currency",
    "is_available", "is_featured", "is_ai_generated", "is_verified",
    "calories", "spice_level", "servings",
    "is_organic", "is_vegetarian", "is_vegan", "is_gluten_free", "allergens",
)
INGREDIENT_FIELDS = (
    "name", "en_name", "quantity", "unit", "price",
    "is_default", "is_removable", "max_quantity", "sort_order",
)


class Command(BaseCommand):
    help = "Pull a production System's content (+ images) into the local database."

    def add_arguments(self, parser):
        parser.add_argument("host", help="System.host to import (e.g. acme.com).")
        parser.add_argument("--api-url", required=True, help="Production API base URL.")
        parser.add_argument("--user", default="", help="Admin username (Basic auth).")
        parser.add_argument("--password", default="", help="Admin password (Basic auth).")
        parser.add_argument(
            "--sections",
            default=",".join(ALL_SECTIONS),
            help=f"Comma list of sections to import (any of: {', '.join(ALL_SECTIONS)}).",
        )
        parser.add_argument(
            "--no-reset",
            action="store_true",
            help="Upsert without first deleting the System's existing rows for each section.",
        )
        parser.add_argument("--timeout", type=int, default=30, help="Per-request timeout (s).")

    # ------------------------------------------------------------------ #
    # Entry point
    # ------------------------------------------------------------------ #

    def handle(self, *args, **opts):
        self.host = (opts["host"] or "").strip().lower()
        if not self.host:
            raise CommandError("A host is required.")
        self.api_url = opts["api_url"].rstrip("/")
        self.timeout = opts["timeout"]
        self.reset = not opts["no_reset"]

        sections = [s.strip() for s in opts["sections"].split(",") if s.strip()]
        unknown = [s for s in sections if s not in ALL_SECTIONS]
        if unknown:
            raise CommandError(f"Unknown section(s): {', '.join(unknown)}")
        if not sections:
            raise CommandError("No sections selected.")
        self.sections = sections

        # Base headers: Basic auth (harmless on the public GET endpoints, needed
        # only if any are locked down) + the host the API resolves the site by.
        # A browser-like User-Agent is required: production sits behind a WAF that
        # 403s the default "Python-urllib/x.y" agent (curl/browsers pass through).
        self.headers = {
            "Accept": "application/json",
            "X-Website-Host": self.host,
            "User-Agent": USER_AGENT,
        }
        if opts["user"]:
            token = base64.b64encode(
                f"{opts['user']}:{opts['password']}".encode()
            ).decode()
            self.headers["Authorization"] = f"Basic {token}"

        with transaction.atomic():
            system = self._import_system()
            if "stories" in sections:
                self._import_stories(system)
            if "highlights" in sections:
                self._import_highlights(system)
            if "products" in sections:
                self._import_products(system)
            if "services" in sections:
                self._import_services(system)
            if "menu" in sections:
                self._import_menu(system)

        self.stdout.write(self.style.SUCCESS(
            f"Imported '{self.host}' from {self.api_url} "
            f"(sections: {', '.join(sections)})."
        ))

    # ------------------------------------------------------------------ #
    # HTTP + images
    # ------------------------------------------------------------------ #

    def _get(self, path):
        """GET a JSON endpoint on the production API for this host."""
        url = f"{self.api_url}{path}"
        req = urllib.request.Request(url, headers=self.headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise CommandError(f"GET {url} -> {exc.code} {exc.reason}")
        except urllib.error.URLError as exc:
            raise CommandError(f"GET {url} failed: {exc.reason}")

    def _attach(self, instance, field_name, url):
        """Download an image URL and save it onto instance.<field_name> (no save)."""
        if not url:
            return
        try:
            img_req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(img_req, timeout=self.timeout) as resp:
                data = resp.read()
        except (urllib.error.HTTPError, urllib.error.URLError) as exc:
            self.stderr.write(self.style.WARNING(f"  image {url} skipped: {exc}"))
            return
        filename = os.path.basename(urlparse(url).path) or "image"
        getattr(instance, field_name).save(filename, ContentFile(data), save=False)

    @staticmethod
    def _scalars(item, fields):
        """Project provided, non-null scalar fields from an API item."""
        return {f: item[f] for f in fields if item.get(f) is not None}

    # ------------------------------------------------------------------ #
    # System
    # ------------------------------------------------------------------ #

    def _import_system(self):
        data = self._get("/api/system/")
        if not isinstance(data, dict) or not data.get("host"):
            raise CommandError(
                f"No System for host '{self.host}' on {self.api_url}."
            )

        system, created = System.objects.get_or_create(
            host=self.host,
            defaults={"site_name": data.get("site_name") or self.host, "enabled": True},
        )
        if "system" in self.sections:
            for field in SYSTEM_TEXT_FIELDS:
                if data.get(field) is not None:
                    setattr(system, field, data[field])
            system.enabled = True
            for field in SYSTEM_IMAGE_FIELDS:
                self._attach(system, field, data.get(field))
            system.save()
            self.stdout.write(f"  {'Created' if created else 'Updated'} System ({self.host})")
        elif created:
            system.save()
        return system

    # ------------------------------------------------------------------ #
    # Success stories
    # ------------------------------------------------------------------ #

    def _import_stories(self, system):
        if self.reset:
            system.success_stories.all().delete()
        stories = self._get("/api/success-stories/")
        for s in stories:
            defaults = {"system": system, **self._scalars(s, STORY_FIELDS)}
            story, _ = SuccessStory.objects.update_or_create(
                slug=s.get("slug"), defaults=defaults
            )
            self._attach(story, "image", s.get("image"))
            story.save()
            story.images.all().delete()
            for g in s.get("images") or []:
                img = SuccessStoryImage(story=story, **self._scalars(g, GALLERY_FIELDS))
                self._attach(img, "image", g.get("image"))
                img.save()
        self.stdout.write(f"  Imported {len(stories)} success stories")

    # ------------------------------------------------------------------ #
    # Highlights
    # ------------------------------------------------------------------ #

    def _import_highlights(self, system):
        if self.reset:
            system.highlights.all().delete()
        highlights = self._get("/api/highlights/")
        for h in highlights:
            defaults = {"system": system, **self._scalars(h, HIGHLIGHT_FIELDS)}
            hl, _ = CompanyHighlight.objects.update_or_create(
                slug=h.get("slug"), defaults=defaults
            )
            self._attach(hl, "image", h.get("image"))
            hl.save()
            hl.items.all().delete()
            for it in h.get("items") or []:
                item = CompanyHighlightItem(highlight=hl, **self._scalars(it, HIGHLIGHT_ITEM_FIELDS))
                self._attach(item, "image", it.get("image"))
                item.save()
        self.stdout.write(f"  Imported {len(highlights)} highlights")

    # ------------------------------------------------------------------ #
    # Catalog - products
    # ------------------------------------------------------------------ #

    def _import_products(self, system):
        if self.reset:
            Product.objects.filter(system=system).delete()
            system.product_categories.all().delete()

        cats = self._get("/api/catalog/product-categories/")
        cat_by_slug = {}
        for c in cats:
            cat, _ = ProductCategory.objects.update_or_create(
                slug=c.get("slug"),
                defaults={"system": system, **self._scalars(c, CATEGORY_FIELDS)},
            )
            self._attach(cat, "image", c.get("image"))
            cat.save()
            cat_by_slug[c.get("slug")] = cat

        products = self._get("/api/catalog/products/")
        for p in products:
            defaults = {"system": system, **self._scalars(p, PRODUCT_FIELDS)}
            defaults["category"] = cat_by_slug.get(p.get("category_slug"))
            product, _ = Product.objects.update_or_create(
                slug=p.get("slug"), defaults=defaults
            )
            self._attach(product, "image", p.get("image"))
            product.save()
            product.images.all().delete()
            for g in p.get("images") or []:
                img = ProductImage(product=product, **self._scalars(g, GALLERY_FIELDS))
                self._attach(img, "image", g.get("image"))
                img.save()
        self.stdout.write(f"  Imported {len(cats)} product categories / {len(products)} products")

    # ------------------------------------------------------------------ #
    # Catalog - services
    # ------------------------------------------------------------------ #

    def _import_services(self, system):
        if self.reset:
            Service.objects.filter(system=system).delete()
            system.service_categories.all().delete()

        cats = self._get("/api/catalog/service-categories/")
        cat_by_slug = {}
        for c in cats:
            cat, _ = ServiceCategory.objects.update_or_create(
                slug=c.get("slug"),
                defaults={"system": system, **self._scalars(c, CATEGORY_FIELDS)},
            )
            self._attach(cat, "image", c.get("image"))
            cat.save()
            cat_by_slug[c.get("slug")] = cat

        services = self._get("/api/catalog/services/")
        for s in services:
            defaults = {"system": system, **self._scalars(s, SERVICE_FIELDS)}
            defaults["category"] = cat_by_slug.get(s.get("category_slug"))
            service, _ = Service.objects.update_or_create(
                slug=s.get("slug"), defaults=defaults
            )
            self._attach(service, "image", s.get("image"))
            service.save()
            service.images.all().delete()
            for g in s.get("images") or []:
                img = ServiceImage(service=service, **self._scalars(g, GALLERY_FIELDS))
                self._attach(img, "image", g.get("image"))
                img.save()
        self.stdout.write(f"  Imported {len(cats)} service categories / {len(services)} services")

    # ------------------------------------------------------------------ #
    # Catalog - menu (food)
    # ------------------------------------------------------------------ #

    def _import_menu(self, system):
        if self.reset:
            MenuItem.objects.filter(system=system).delete()
            system.menu_categories.all().delete()

        cats = self._get("/api/catalog/menu-categories/")
        cat_by_slug = {}
        for c in cats:
            cat, _ = MenuCategory.objects.update_or_create(
                slug=c.get("slug"),
                defaults={"system": system, **self._scalars(c, CATEGORY_FIELDS)},
            )
            self._attach(cat, "image", c.get("image"))
            cat.save()
            cat_by_slug[c.get("slug")] = cat

        items = self._get("/api/catalog/menu-items/")
        for m in items:
            defaults = {"system": system, **self._scalars(m, MENU_ITEM_FIELDS)}
            defaults["category"] = cat_by_slug.get(m.get("category_slug"))
            item, _ = MenuItem.objects.update_or_create(
                slug=m.get("slug"), defaults=defaults
            )
            self._attach(item, "image", m.get("image"))
            item.save()
            # Priced ingredients (the internal recipe steps are never public).
            item.ingredients.all().delete()
            for ing in m.get("ingredients") or []:
                MenuItemIngredient.objects.create(
                    menu_item=item, **self._scalars(ing, INGREDIENT_FIELDS)
                )
            item.images.all().delete()
            for g in m.get("images") or []:
                img = MenuItemImage(menu_item=item, **self._scalars(g, GALLERY_FIELDS))
                self._attach(img, "image", g.get("image"))
                img.save()
        self.stdout.write(f"  Imported {len(cats)} menu categories / {len(items)} menu items")
