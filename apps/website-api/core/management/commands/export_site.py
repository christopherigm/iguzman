"""
export_site - serialize a customer System's content into a portable JSON payload.

This is the local (dev) half of **publishing a site to production**: once a site
has been seeded (`seed_site`) and verified locally, `export_site` reads its
`System` + success stories + highlights + product/service/menu catalog out of
the current database into a brief-shaped JSON document (with real slugs; image files
omitted - the customer uploads real images in the prod CMS). The `pnpm
publish-site` script feeds that payload to the production `/api/publish-site/`
endpoint, which upserts it.

Usage:
    python manage.py export_site acme.com                       # print JSON to stdout
    python manage.py export_site acme.com --output out.json     # write to a file

See core/site_payload.py and apps/website/sites/CLAUDE.md ("Publishing to
production").
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from core.models import System
from core.site_payload import media_names, serialize_system


class Command(BaseCommand):
    help = "Serialize a System's content (stories, highlights, catalog) into a portable JSON payload."

    def add_arguments(self, parser):
        parser.add_argument("host", help="System.host to export (e.g. acme.com).")
        parser.add_argument(
            "--output",
            "-o",
            default=None,
            help="Write the payload to this path instead of stdout.",
        )
        parser.add_argument(
            "--images",
            default=None,
            help=(
                "Also write every referenced image into this zip, so the publish "
                "can fill empty image fields on the target. Omit to publish text "
                "only (the historical behaviour)."
            ),
        )

    def handle(self, *args, **opts):
        host = (opts["host"] or "").strip().lower()
        try:
            system = System.objects.get(host=host)
        except System.DoesNotExist:
            raise CommandError(
                f"No System with host '{host}'. Seed it first (see /seed-site)."
            )

        payload = serialize_system(system)
        text = json.dumps(payload, indent=2, ensure_ascii=False)

        if opts["images"]:
            self._write_images(payload, Path(opts["images"]).expanduser())

        output = opts["output"]
        if output:
            path = Path(output).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text + "\n", encoding="utf-8")
            self.stderr.write(self.style.SUCCESS(f"Wrote payload for '{host}' to {path}"))
        else:
            # Payload to stdout (machine-readable); status to stderr.
            self.stdout.write(text)
            self.stderr.write(self.style.SUCCESS(f"Serialized System '{host}'."))

    def _write_images(self, payload: dict, path: Path) -> None:
        """Zip every image the payload references, keyed by its storage name.

        Streamed member by member rather than read into a list first: a catalog
        of a few hundred photos is far more than a command should hold in
        memory, which is the same call `core/backup.py` makes.

        A file the storage cannot produce is **skipped with a warning, not
        raised**. Storage is remote in production and the row could have been
        written before the file finished uploading; a publish that carries 58 of
        60 photos and says so beats one that refuses to run.
        """
        names = sorted(media_names(payload))
        if not names:
            self.stderr.write("No images referenced; skipping the archive.")
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        written = 0
        with zipfile.ZipFile(
            path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True
        ) as archive:
            for name in names:
                try:
                    with default_storage.open(name, "rb") as src:
                        archive.writestr(name, src.read())
                    written += 1
                except Exception as exc:  # noqa: BLE001 - see the docstring
                    self.stderr.write(
                        self.style.WARNING(f"  image {name} skipped ({exc})")
                    )
        self.stderr.write(
            self.style.SUCCESS(f"Wrote {written}/{len(names)} image(s) to {path}")
        )
