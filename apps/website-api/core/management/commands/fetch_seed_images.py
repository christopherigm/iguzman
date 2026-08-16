"""
fetch_seed_images - fill a `/seed-site` brief with real photography from a free
stock bank, so a freshly seeded landing can be shown to a customer the same day.

`seed_site` on its own round-robins eight generic `placeholder-*` files, which
is fine for checking a layout and useless for a proposal: a taquería's landing
shows the same stock office desk under every dish. This command walks a brief,
searches Pexels (falling back to Pixabay) once per record, downloads what it
finds into the assets dir, and writes the filenames back into the brief - so the
subsequent `seed_site` run is unchanged, offline and re-runnable.

    python manage.py fetch_seed_images --brief seed_assets/briefs/acme.com.json
    python manage.py fetch_seed_images --brief <path> --force      # refetch all
    python manage.py fetch_seed_images --brief <path> --dry-run    # print queries

**The search term comes from the brief, not from the record's name.** Every
record may carry an `image_query`, which the `/seed-site` skill fills during the
interview. That indirection is the whole accuracy mechanism: a dish called
"La Chapulina" or a highlight called "Nuestro Compromiso" has no searchable term
in its name, but the interview already established that the first is a grilled
steak taco and the second is about same-day delivery. A record with no
`image_query` falls back to its name and warns, because that is the case that
produces an off-subject photo.

⚠ **Write queries in English.** Both banks index their libraries in English and
answer a Spanish query with a much thinner, more literal result set - so a
Spanish-language site still gets its photos searched in English. The credit
stored alongside is language-neutral.

Two files are written per brief, both under `<assets-dir>/fetched/<host>/`:

  * the images themselves, named after the record's slug; and
  * `credits.json`, mapping each image back to the credit it is owed.

`seed_site` reads that sidecar and copies the credit onto every record's
`attribution` / `attribution_url`, which is what lets the images survive
`publish-site` and go live on the customer's real site - see
`core/stock_images.py` for what the stored credit then drives.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify

from core.services.image_banks import (
    PEXELS,
    PIXABAY,
    configured_banks,
    download,
    search_photo,
)

FETCHED_DIRNAME = "fetched"
CREDITS_NAME = "credits.json"

# The two System images that are ever a photograph; the logos are the customer's
# own mark. Mirrors `core.stock_images.SYSTEM_ATTRIBUTION_FIELDS`.
SYSTEM_IMAGE_FIELDS = ("img_hero", "img_about")

# A hero is a wide banner and a catalog card is a squarish tile; asking the bank
# for the right shape avoids a portrait photo cropped to a letterbox strip.
_HERO_ORIENTATION = "landscape"
_DEFAULT_ORIENTATION = "landscape"


class Plan:
    """One image to fetch: where it goes in the brief, and what to search for."""

    __slots__ = ("label", "query", "orientation", "stem", "setter", "current")

    def __init__(self, label, query, orientation, stem, setter, current):
        self.label = label
        self.query = query
        self.orientation = orientation
        self.stem = stem
        self.setter = setter
        self.current = current


class Command(BaseCommand):
    help = "Fetch stock photos for a seed brief and write them back into it."

    def add_arguments(self, parser):
        parser.add_argument("--brief", required=True, help="Path to the brief JSON.")
        parser.add_argument(
            "--assets-dir",
            default=None,
            help="Override the seed assets dir (default: <app>/seed_assets).",
        )
        parser.add_argument(
            "--bank",
            choices=[PEXELS, PIXABAY],
            default=None,
            help="Use only this bank (default: Pexels, falling back to Pixabay).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Refetch records that already point at an image.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the queries that would be run; touch no network, write nothing.",
        )

    # ------------------------------------------------------------------ #

    def handle(self, *args, **opts):
        brief_path = Path(opts["brief"]).expanduser()
        if not brief_path.is_file():
            raise CommandError(f"Brief not found: {brief_path}")
        try:
            brief = json.loads(brief_path.read_text())
        except json.JSONDecodeError as exc:
            raise CommandError(f"Brief is not valid JSON: {exc}") from exc

        host = (brief.get("system") or {}).get("host")
        if not host:
            raise CommandError("Brief has no system.host - cannot name the output dir.")

        assets_dir = (
            Path(opts["assets_dir"]).expanduser()
            if opts["assets_dir"]
            else Path(settings.BASE_DIR) / "seed_assets"
        )
        if not assets_dir.is_dir():
            raise CommandError(f"Assets dir not found: {assets_dir}")

        banks = [opts["bank"]] if opts["bank"] else configured_banks()
        dry_run = opts["dry_run"]
        if not banks and not dry_run:
            raise CommandError(
                "No image bank is configured. Set PEXELS_API_KEY (and/or "
                "PIXABAY_API_KEY) in apps/website-api/.env - both are free and "
                "instant: https://www.pexels.com/api/ , "
                "https://pixabay.com/api/docs/"
            )

        plans = list(self._plan(brief))
        if not plans:
            self.stdout.write("Nothing to fetch - every record already has an image.")
            return

        if not opts["force"]:
            plans = [p for p in plans if not p.current]

        if dry_run:
            self._print_plan(plans)
            return

        out_dir = assets_dir / FETCHED_DIRNAME / host
        out_dir.mkdir(parents=True, exist_ok=True)
        credits = self._load_credits(out_dir)

        spent: set[str] = set()
        fetched = missed = 0
        for plan in plans:
            photo = search_photo(
                plan.query,
                orientation=plan.orientation,
                exclude=spent,
                banks=banks,
            )
            if photo is None:
                self.stderr.write(
                    self.style.WARNING(
                        f"  no result for {plan.label}: {plan.query!r} "
                        "(will fall back to the placeholder pool)"
                    )
                )
                missed += 1
                continue
            spent.add(photo.key)

            name = f"{plan.stem}.jpg"
            try:
                download(photo, out_dir / name)
            except Exception as exc:  # noqa: BLE001 - a bad download must not stop the run
                self.stderr.write(
                    self.style.WARNING(f"  download failed for {plan.label}: {exc}")
                )
                missed += 1
                continue

            rel = f"{FETCHED_DIRNAME}/{host}/{name}"
            plan.setter(rel)
            credits[rel] = {
                "attribution": photo.attribution,
                "attribution_url": photo.attribution_url,
                "bank": photo.bank,
                "query": plan.query,
                "alt": photo.alt,
            }
            fetched += 1
            self.stdout.write(f"  {plan.label:<44} {photo.attribution}")

        (out_dir / CREDITS_NAME).write_text(
            json.dumps(credits, indent=2, ensure_ascii=False) + "\n"
        )
        brief_path.write_text(
            json.dumps(brief, indent=2, ensure_ascii=False) + "\n"
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nFetched {fetched} image(s) into {out_dir}"
                + (f", {missed} fell back to the pool" if missed else "")
            )
        )
        self.stdout.write(
            f"Credits written to {out_dir / CREDITS_NAME}.\n"
            f"Brief updated: {brief_path}\n\n"
            "Next: python manage.py seed_site --brief "
            f"{brief_path} --reset"
        )

    # ------------------------------------------------------------------ #
    # Planning - walk the brief and decide one query per image
    # ------------------------------------------------------------------ #

    def _plan(self, brief: dict):
        system = brief.get("system") or {}
        assets = system.setdefault("assets", {})
        queries = system.get("image_queries") or {}

        for field in SYSTEM_IMAGE_FIELDS:
            query = queries.get(field)
            if not query:
                continue
            yield Plan(
                label=f"system.{field}",
                query=query,
                orientation=_HERO_ORIENTATION,
                stem=field.replace("_", "-"),
                setter=lambda rel, f=field: assets.__setitem__(f, rel),
                current=assets.get(field),
            )

        yield from self._plan_records(
            brief.get("success_stories") or [], "success_stories", "story"
        )
        for i, hl in enumerate(brief.get("highlights") or []):
            yield from self._plan_records([hl], "highlights", "highlight", start=i)
            yield from self._plan_records(
                hl.get("items") or [],
                f"highlights[{i}].items",
                "highlight-item",
            )

        for section, item_key, noun in (
            ("product_categories", "products", "product"),
            ("service_categories", "services", "service"),
            ("menu_categories", "menu_items", "menu-item"),
        ):
            for i, cat in enumerate(brief.get(section) or []):
                yield from self._plan_records([cat], section, f"{noun}-category", start=i)
                yield from self._plan_records(
                    cat.get(item_key) or [], f"{section}[{i}].{item_key}", noun
                )
                for item in cat.get(item_key) or []:
                    yield from self._plan_records(
                        [
                            ing
                            for ing in (item.get("ingredients") or [])
                            if ing.get("image_query")
                        ],
                        f"{section}[{i}].{item_key}[].ingredients",
                        "ingredient",
                    )

    def _plan_records(self, records: list, label: str, noun: str, start: int = 0):
        """Yield a Plan per record that wants an image."""
        for i, rec in enumerate(records):
            if not isinstance(rec, dict):
                continue
            n = start + i
            query = (rec.get("image_query") or "").strip()
            if not query:
                # The weak path this design exists to avoid - a made-up brand
                # name is not a searchable term. Say so loudly rather than
                # quietly fetching whatever it matches.
                name = (rec.get("name") or "").strip()
                if not name:
                    continue
                query = name
                self.stderr.write(
                    self.style.WARNING(
                        f"  {label}[{n}] has no image_query; falling back to its "
                        f"name {name!r} - check the result, or add an image_query."
                    )
                )
            stem = slugify(rec.get("slug") or rec.get("name") or f"{noun}-{n + 1}")
            stem = f"{noun}-{stem or n + 1}"
            yield Plan(
                label=f"{label}[{n}]",
                query=query,
                orientation=(rec.get("image_orientation") or _DEFAULT_ORIENTATION),
                stem=_unique_stem(stem),
                setter=lambda rel, r=rec: r.__setitem__("image", rel),
                current=rec.get("image"),
            )

    # ------------------------------------------------------------------ #

    def _print_plan(self, plans: list) -> None:
        self.stdout.write(f"{len(plans)} image(s) would be fetched:\n")
        for plan in plans:
            self.stdout.write(
                f"  {plan.label:<44} [{plan.orientation:<9}] {plan.query!r}"
            )
        self.stdout.write("\n(dry run - nothing downloaded, brief untouched)")

    @staticmethod
    def _load_credits(out_dir: Path) -> dict:
        path = out_dir / CREDITS_NAME
        if path.is_file():
            try:
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                pass
        return {}


_seen_stems: dict[str, int] = {}


def _unique_stem(stem: str) -> str:
    """Keep two records with the same name from overwriting each other's file."""
    stem = re.sub(r"-+", "-", stem).strip("-") or "image"
    _seen_stems[stem] = _seen_stems.get(stem, 0) + 1
    n = _seen_stems[stem]
    return stem if n == 1 else f"{stem}-{n}"
