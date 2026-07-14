"""
export_site - serialize a customer System's content into a portable JSON payload.

This is the local (dev) half of **publishing a site to production**: once a site
has been seeded (`seed_site`) and verified locally, `export_site` reads its
`System` + success stories + highlights + product/service catalog out of the
current database into a brief-shaped JSON document (with real slugs; image files
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
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.models import System
from core.site_payload import serialize_system


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
