"""
seed_site - populate a customer System's initial content from a JSON brief.

The `website` app landing page is 100 % backend-driven: Hero, SuccessStories,
CompanyHighlights, CatalogCategories and CatalogItems all read the `System`
record + its stories / highlights / catalog by request host. This command turns
a natural-language-derived **brief** (produced by the `/seed-site` skill) into
those records so a freshly scaffolded site renders full and alive - with real
copy and placeholder images/links - instead of an empty shell.

Images are Django ImageFields (files under MEDIA_ROOT), NOT URLs. The brief
references filenames that live in the assets dir (default: `seed_assets/`); this
command copies them into media and links each record. Any field left unset in
the brief falls back to round-robining the generic image pool in the assets dir,
so the page never shows a broken/empty slot. Only `video_link` (YouTube) and
`href` are true URLs and come straight from the brief / `links.json`.

Usage:
    python manage.py seed_site --brief seed_assets/briefs/acme.json
    python manage.py seed_site --brief <path> --reset          # wipe prior seed first
    python manage.py seed_site --brief <path> --assets-dir seed_assets

The brief schema is documented in `seed_assets/README.md` and exemplified in
`seed_assets/brief.example.json`. See apps/website/sites/CLAUDE.md.
"""

from __future__ import annotations

import json
import os
from decimal import Decimal, InvalidOperation
from itertools import cycle
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from catalog.models import (
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemImage,
    MenuItemIngredient,
    MenuItemIngredientOption,
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

# System image fields the brief may set under `system.assets`. A single
# `img_manifest` master fills all five PWA manifest sizes.
SYSTEM_IMAGE_FIELDS = (
    "img_logo",
    "img_logo_hero",
    "img_favicon",
    "img_hero",
    "img_about",
)
MANIFEST_FIELDS = (
    "img_manifest_1080",
    "img_manifest_512",
    "img_manifest_256",
    "img_manifest_192",
    "img_manifest_128",
)

# Plain System text fields copied verbatim from brief["system"] when present -
# shared with `core.site_payload` (imported above) so seeding and publishing
# agree on which System fields are copyable content.


class Command(BaseCommand):
    help = "Populate a customer System's initial content (stories, highlights, catalog) from a JSON brief."

    def add_arguments(self, parser):
        parser.add_argument(
            "--brief",
            required=True,
            help="Path to the brief JSON (see seed_assets/brief.example.json).",
        )
        parser.add_argument(
            "--assets-dir",
            default=None,
            help="Directory holding placeholder images + links.json. "
            "Defaults to the `seed_assets/` folder next to manage.py.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete this System's existing seeded stories/highlights/catalog before seeding.",
        )

    # ------------------------------------------------------------------ #
    # Entry point
    # ------------------------------------------------------------------ #

    def handle(self, *args, **opts):
        brief_path = Path(opts["brief"]).expanduser()
        if not brief_path.is_file():
            raise CommandError(f"Brief not found: {brief_path}")

        try:
            brief = json.loads(brief_path.read_text())
        except json.JSONDecodeError as exc:
            raise CommandError(f"Brief is not valid JSON: {exc}")

        base_dir = Path(__file__).resolve().parents[3]  # apps/website-api/
        self.assets_dir = (
            Path(opts["assets_dir"]).expanduser()
            if opts["assets_dir"]
            else base_dir / "seed_assets"
        )
        if not self.assets_dir.is_dir():
            raise CommandError(f"Assets dir not found: {self.assets_dir}")

        self._pool = self._build_image_pool()
        self._links = self._load_links()

        sys_brief = brief.get("system") or {}
        host = (sys_brief.get("host") or "").strip().lower()
        if not host:
            raise CommandError('brief["system"]["host"] is required.')

        self._credits = self._load_credits(host)

        # A short token derived from the host, used to namespace globally-unique
        # slugs so two seeded sites never collide (product/service/category/story
        # slugs are unique across the whole DB).
        self._token = slugify(host.split(":")[0].replace(".", "-")) or "site"

        with transaction.atomic():
            system = self._upsert_system(host, sys_brief)
            if opts["reset"]:
                self._reset(system)
            self._seed_success_stories(system, brief.get("success_stories") or [])
            self._seed_highlights(system, brief.get("highlights") or [])
            self._seed_products(system, brief.get("product_categories") or [])
            self._seed_services(system, brief.get("service_categories") or [])
            self._seed_menu(system, brief.get("menu_categories") or [])

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded '{system.site_name}' ({host}). "
                "Preview via the dev site switcher, then verify at the real host."
            )
        )

    # ------------------------------------------------------------------ #
    # Assets & links
    # ------------------------------------------------------------------ #

    def _build_image_pool(self):
        """Round-robin iterator over the generic `placeholder-*` images."""
        exts = {".jpg", ".jpeg", ".png", ".webp"}
        pool = sorted(
            p
            for p in self.assets_dir.glob("placeholder-*")
            if p.suffix.lower() in exts
        )
        if not pool:
            self.stderr.write(
                self.style.WARNING(
                    f"No placeholder-* images in {self.assets_dir}; "
                    "records without an explicit asset will have no image."
                )
            )
        return cycle(pool) if pool else None

    def _load_links(self) -> dict:
        links_path = self.assets_dir / "links.json"
        if links_path.is_file():
            try:
                return json.loads(links_path.read_text())
            except json.JSONDecodeError:
                self.stderr.write(self.style.WARNING("links.json is invalid; ignoring."))
        return {}

    def _resolve_asset(self, filename: str | None) -> Path | None:
        """Return a real image path: the named file, else the next pool image."""
        if filename:
            candidate = self.assets_dir / filename
            if candidate.is_file():
                return candidate
            self.stderr.write(
                self.style.WARNING(f"asset '{filename}' not found; using pool fallback.")
            )
        if self._pool is not None:
            return next(self._pool)
        return None

    def _load_credits(self, host: str) -> dict:
        """The credits sidecar `fetch_seed_images` wrote for this host, if any.

        Keyed by the same brief-relative path the command wrote into each
        record's `image` field, so `_attach` can look a credit up from the one
        thing it already has. Absent (nobody ran the fetcher) it is empty and
        every image is an uncredited local placeholder, which is correct - the
        `placeholder-*` pool is ours and owes nobody.
        """
        path = self.assets_dir / "fetched" / host / "credits.json"
        if not path.is_file():
            return {}
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            self.stderr.write(
                self.style.WARNING(f"{path} is invalid JSON; images will be uncredited.")
            )
            return {}

    def _attach(self, instance, field_name: str, filename: str | None) -> None:
        """Copy an asset into media, link it, and carry over any credit it owes.

        The credit travels with the file rather than being a per-record brief
        field, because it is a property of the photograph and not of the dish:
        the `/seed-site` skill writes an `image_query`, and who the result turns
        out to belong to is only known after the search has run.
        """
        path = self._resolve_asset(filename)
        if path is None:
            return
        with path.open("rb") as fh:
            getattr(instance, field_name).save(path.name, File(fh), save=False)
        # Only credit when the named file is the one actually used. A brief
        # naming a file that has since been deleted falls back to the generic
        # pool, and crediting a photographer for our own placeholder would put a
        # false credit on the page and inflate `stock_image_count`.
        if filename and path == (self.assets_dir / filename):
            self._credit(instance, field_name, filename)

    def _credit(self, instance, field_name: str, filename: str | None) -> None:
        """Copy the bank credit for `filename` onto the instance, if it has one.

        `image` is the BasePicture field, whose columns are plain `attribution` /
        `attribution_url`; System's two photographic images namespace theirs
        (`img_hero_attribution`). A field with no columns at all - System's logo,
        favicon, brandmark and manifest icons - is silently skipped, since the
        customer's own mark is never owed a credit.
        """
        credit = self._credits.get(filename or "")
        if not credit:
            return
        base = "attribution" if field_name == "image" else f"{field_name}_attribution"
        if not hasattr(instance, base):
            return
        setattr(instance, base, credit.get("attribution") or "")
        setattr(instance, f"{base}_url", credit.get("attribution_url") or "")

    def _href(self, explicit: str | None) -> str | None:
        if explicit:
            return explicit
        pool = self._links.get("href")
        if isinstance(pool, list) and pool:
            return pool[0]
        return None

    def _uslug(self, raw: str, fallback: str) -> str:
        """A globally-unique, host-namespaced slug."""
        base = slugify(raw) or slugify(fallback) or "item"
        return f"{self._token}-{base}"

    @staticmethod
    def _price(value) -> Decimal:
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError):
            return Decimal("0.00")

    # ------------------------------------------------------------------ #
    # System
    # ------------------------------------------------------------------ #

    def _upsert_system(self, host: str, sys_brief: dict) -> System:
        system, created = System.objects.get_or_create(
            host=host,
            defaults={"site_name": sys_brief.get("site_name") or host, "enabled": True},
        )
        for field in SYSTEM_TEXT_FIELDS:
            if sys_brief.get(field) is not None:
                setattr(system, field, sys_brief[field])
        system.enabled = True

        assets = sys_brief.get("assets") or {}
        for field in SYSTEM_IMAGE_FIELDS:
            if assets.get(field):
                self._attach(system, field, assets[field])
        manifest = assets.get("img_manifest")
        if manifest:
            for field in MANIFEST_FIELDS:
                self._attach(system, field, manifest)

        if not system.video_link:
            system.video_link = self._links.get("video_link") or None

        system.save()
        verb = "Created" if created else "Updated"
        self.stdout.write(f"  {verb} System #{system.pk} ({host})")
        return system

    def _reset(self, system: System) -> None:
        counts = {
            "stories": system.success_stories.all().delete()[0],
            "highlights": system.highlights.all().delete()[0],
            "products": Product.objects.filter(system=system).delete()[0],
            "product_categories": system.product_categories.all().delete()[0],
            "services": Service.objects.filter(system=system).delete()[0],
            "service_categories": system.service_categories.all().delete()[0],
            "menu_items": MenuItem.objects.filter(system=system).delete()[0],
            "menu_categories": system.menu_categories.all().delete()[0],
            # Ingredients last: `MenuItemIngredient.ingredient` and
            # `MenuItemIngredientOption.ingredient` are both PROTECT, so the
            # dishes referencing them have to go first (the dict literal is
            # evaluated top to bottom). Only rows nothing else points at are
            # dropped - an ingredient a dish outside this reset still uses is
            # left alone rather than raising ProtectedError.
            "ingredients": Ingredient.objects.filter(
                system=system, menu_uses__isnull=True, menu_option_uses__isnull=True
            ).delete()[0],
        }
        self.stdout.write(f"  Reset prior content: {counts}")

    # ------------------------------------------------------------------ #
    # Success stories
    # ------------------------------------------------------------------ #

    def _seed_success_stories(self, system: System, stories: list) -> None:
        for i, s in enumerate(stories):
            story = SuccessStory(
                system=system,
                name=s.get("name"),
                en_name=s.get("en_name"),
                short_description=s.get("short_description"),
                en_short_description=s.get("en_short_description"),
                description=s.get("description"),
                en_description=s.get("en_description"),
                href=self._href(s.get("href")),
                slug=self._uslug(s.get("slug") or s.get("name") or f"story-{i + 1}", f"story-{i + 1}"),
            )
            self._attach(story, "image", s.get("image"))
            story.save()
            for j, g in enumerate(s.get("gallery") or []):
                img = SuccessStoryImage(story=story, sort_order=j)
                self._attach(img, "image", g)
                img.save()
        if stories:
            self.stdout.write(f"  Seeded {len(stories)} success stories")

    # ------------------------------------------------------------------ #
    # Highlights
    # ------------------------------------------------------------------ #

    def _seed_highlights(self, system: System, highlights: list) -> None:
        for i, h in enumerate(highlights):
            hl = CompanyHighlight(
                system=system,
                name=h.get("name"),
                en_name=h.get("en_name"),
                category=h.get("category"),
                en_category=h.get("en_category"),
                description=h.get("description"),
                en_description=h.get("en_description"),
                short_description=h.get("short_description"),
                icon=h.get("icon"),
                size=h.get("size") or "md",
                sort_order=h.get("sort_order", i),
                slug=self._uslug(h.get("slug") or h.get("name") or f"highlight-{i + 1}", f"highlight-{i + 1}"),
            )
            self._attach(hl, "image", h.get("image"))
            hl.save()
            for j, item in enumerate(h.get("items") or []):
                hi = CompanyHighlightItem(
                    highlight=hl,
                    name=item.get("name"),
                    en_name=item.get("en_name"),
                    description=item.get("description"),
                    icon=item.get("icon"),
                    sort_order=item.get("sort_order", j),
                )
                if item.get("image"):
                    self._attach(hi, "image", item["image"])
                hi.save()
        if highlights:
            self.stdout.write(f"  Seeded {len(highlights)} highlights")

    # ------------------------------------------------------------------ #
    # Catalog - products
    # ------------------------------------------------------------------ #

    def _seed_products(self, system: System, categories: list) -> None:
        n_cat = n_item = 0
        for ci, c in enumerate(categories):
            cat = ProductCategory(
                system=system,
                name=c.get("name"),
                en_name=c.get("en_name"),
                description=c.get("description"),
                short_description=c.get("short_description"),
                slug=self._uslug(c.get("slug") or c.get("name") or f"category-{ci + 1}", f"pcat-{ci + 1}"),
            )
            self._attach(cat, "image", c.get("image"))
            cat.save()
            n_cat += 1
            for pi, p in enumerate(c.get("products") or []):
                product = Product(
                    system=system,
                    category=cat,
                    name=p.get("name"),
                    en_name=p.get("en_name"),
                    description=p.get("description"),
                    en_description=p.get("en_description"),
                    short_description=p.get("short_description"),
                    href=self._href(p.get("href")),
                    price=self._price(p.get("price")),
                    compare_price=self._price(p["compare_price"]) if p.get("compare_price") else None,
                    currency=p.get("currency") or "USD",
                    is_featured=p.get("is_featured", True),
                    in_stock=p.get("in_stock", True),
                    stock_count=p.get("stock_count"),
                    slug=self._uslug(p.get("slug") or p.get("name") or f"product-{ci}-{pi}", f"product-{ci}-{pi}"),
                )
                self._attach(product, "image", p.get("image"))
                product.save()
                n_item += 1
                for gi, g in enumerate(p.get("gallery") or []):
                    img = ProductImage(product=product, sort_order=gi)
                    self._attach(img, "image", g)
                    img.save()
        if categories:
            self.stdout.write(f"  Seeded {n_cat} product categories / {n_item} products")

    # ------------------------------------------------------------------ #
    # Catalog - services
    # ------------------------------------------------------------------ #

    def _seed_services(self, system: System, categories: list) -> None:
        n_cat = n_item = 0
        for ci, c in enumerate(categories):
            cat = ServiceCategory(
                system=system,
                name=c.get("name"),
                en_name=c.get("en_name"),
                description=c.get("description"),
                short_description=c.get("short_description"),
                slug=self._uslug(c.get("slug") or c.get("name") or f"category-{ci + 1}", f"scat-{ci + 1}"),
            )
            self._attach(cat, "image", c.get("image"))
            cat.save()
            n_cat += 1
            for si, s in enumerate(c.get("services") or []):
                service = Service(
                    system=system,
                    category=cat,
                    name=s.get("name"),
                    en_name=s.get("en_name"),
                    description=s.get("description"),
                    en_description=s.get("en_description"),
                    short_description=s.get("short_description"),
                    href=self._href(s.get("href")),
                    price=self._price(s.get("price")),
                    compare_price=self._price(s["compare_price"]) if s.get("compare_price") else None,
                    currency=s.get("currency") or "USD",
                    is_featured=s.get("is_featured", True),
                    duration=s.get("duration"),
                    modality=s.get("modality") or "in_person",
                    slug=self._uslug(s.get("slug") or s.get("name") or f"service-{ci}-{si}", f"service-{ci}-{si}"),
                )
                self._attach(service, "image", s.get("image"))
                service.save()
                n_item += 1
                for gi, g in enumerate(s.get("gallery") or []):
                    img = ServiceImage(service=service, sort_order=gi)
                    self._attach(img, "image", g)
                    img.save()
        if categories:
            self.stdout.write(f"  Seeded {n_cat} service categories / {n_item} services")

    # ------------------------------------------------------------------ #
    # Catalog - menu (food)
    # ------------------------------------------------------------------ #

    def _seed_menu(self, system: System, categories: list) -> None:
        n_cat = n_item = n_ing = n_opt = 0
        # The brief lists ingredients inline per dish; create one reusable
        # Ingredient per distinct name and reference it, so a "butter" shared by
        # two dishes is the same catalog row. `nutrition_basis_quantity` is set to
        # the first portion so the seeded calories read back at face value.
        ingredient_cache: dict[str, Ingredient] = {}

        def _get_ingredient(ing: dict) -> Ingredient:
            name = (ing.get("name") or "ingredient").strip()
            key = name.lower()
            cached = ingredient_cache.get(key)
            if cached is not None:
                return cached
            qty = self._price(ing["quantity"]) if ing.get("quantity") is not None else None
            # `slug` is globally unique and `_uslug` is deterministic per host, so
            # a blind create is an IntegrityError as soon as a row survives from
            # an earlier run - a seed without `--reset`, a reset that left an
            # ingredient a dish still uses, or two names that slugify the same.
            obj, _ = Ingredient.objects.get_or_create(
                slug=self._uslug(name, "ingredient"),
                defaults={
                    "system": system,
                    "name": name,
                    "en_name": ing.get("en_name"),
                    "unit": ing.get("unit") or "g",
                    "nutrition_basis_quantity": qty if qty else Decimal("1"),
                    "calories": ing.get("calories"),
                },
            )
            ingredient_cache[key] = obj
            return obj

        for ci, c in enumerate(categories):
            cat = MenuCategory(
                system=system,
                name=c.get("name"),
                en_name=c.get("en_name"),
                description=c.get("description"),
                short_description=c.get("short_description"),
                slug=self._uslug(c.get("slug") or c.get("name") or f"category-{ci + 1}", f"mcat-{ci + 1}"),
            )
            self._attach(cat, "image", c.get("image"))
            cat.save()
            n_cat += 1
            for mi, m in enumerate(c.get("menu_items") or []):
                item = MenuItem(
                    system=system,
                    category=cat,
                    name=m.get("name"),
                    en_name=m.get("en_name"),
                    description=m.get("description"),
                    en_description=m.get("en_description"),
                    short_description=m.get("short_description"),
                    en_short_description=m.get("en_short_description"),
                    href=self._href(m.get("href")),
                    price=self._price(m.get("price")),
                    compare_price=self._price(m["compare_price"]) if m.get("compare_price") else None,
                    currency=m.get("currency") or "USD",
                    is_featured=m.get("is_featured", True),
                    is_available=m.get("is_available", True),
                    eta_minutes=m.get("eta_minutes"),
                    spice_level=m.get("spice_level"),
                    portions=m.get("portions"),
                    is_organic=m.get("is_organic", False),
                    is_vegetarian=m.get("is_vegetarian", False),
                    is_vegan=m.get("is_vegan", False),
                    is_gluten_free=m.get("is_gluten_free", False),
                    allergens=m.get("allergens"),
                    slug=self._uslug(m.get("slug") or m.get("name") or f"menu-item-{ci}-{mi}", f"menu-item-{ci}-{mi}"),
                )
                self._attach(item, "image", m.get("image"))
                item.save()
                n_item += 1
                for gi, g in enumerate(m.get("gallery") or []):
                    img = MenuItemImage(menu_item=item, sort_order=gi)
                    self._attach(img, "image", g)
                    img.save()
                for ii, ing in enumerate(m.get("ingredients") or []):
                    row = MenuItemIngredient.objects.create(
                        menu_item=item,
                        ingredient=_get_ingredient(ing),
                        group_name=ing.get("group_name"),
                        group_en_name=ing.get("group_en_name"),
                        quantity=self._price(ing["quantity"]) if ing.get("quantity") is not None else None,
                        unit=ing.get("unit"),
                        price=self._price(ing.get("price", 0)),
                        is_removable=ing.get("is_removable", False),
                        max_quantity=ing.get("max_quantity", 1),
                        number_of_free_portions=ing.get("number_of_free_portions", 0),
                        default_quantity=ing.get("default_quantity", 0),
                        sort_order=ing.get("sort_order", ii),
                    )
                    n_ing += 1
                    # A single-select choice group: the row above is the *default*
                    # option and these are the alternatives the customer may swap
                    # in (see MenuItemIngredient's docstring). Each option is an
                    # `Ingredient` in its own right, so it goes through the same
                    # cache and a "Familiar 40 cm" shared by 41 pizzas is one row.
                    for oi, opt in enumerate(ing.get("options") or []):
                        MenuItemIngredientOption.objects.create(
                            menu_item_ingredient=row,
                            ingredient=_get_ingredient(opt),
                            price=self._price(opt.get("price", 0)),
                            sort_order=opt.get("sort_order", oi),
                        )
                        n_opt += 1
        if categories:
            self.stdout.write(
                f"  Seeded {n_cat} menu categories / {n_item} menu items / "
                f"{n_ing} ingredients / {n_opt} choice options"
            )
