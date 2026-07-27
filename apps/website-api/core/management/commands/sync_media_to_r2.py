"""Copy stored media into the bucket - and the path - it is *supposed* to live in.

The CLI front end for ``core.media_sync``; that module carries the reasoning and
the invariants, and the CMS button on ``/admin/system`` runs the same code, so
there is one implementation and it cannot drift from what an operator sees.

    # the production flip for one site: local media volume -> its R2 bucket
    python manage.py sync_media_to_r2 --system santofishrestaurant.iguzman.com.mx

    # a tenant that has connected its own R2: platform bucket -> that bucket
    python manage.py sync_media_to_r2 --system elpanbueno.com --source platform

    # everything, every tenant
    python manage.py sync_media_to_r2

Two things worth knowing before running it:

* **It writes to the database.** A file whose path does not already name its
  tenant (everything uploaded before ``core.tenant_paths`` landed) is copied to
  ``t/<system_id>/<old path>`` and the column repointed - which is the only way
  an own-domain customer's existing media ends up in their *own* bucket rather
  than the platform's. Use ``--dry-run`` first.
* **Idempotent, and never destructive.** A file already at the destination is
  skipped, so it is safe to re-run after a partial failure and safe to run again
  later to pick up whatever was uploaded in between. Nothing is ever deleted
  from the source.
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.media_sync import (
    COPIED,
    FAILED,
    FOREIGN,
    MAX_LIMIT,
    MISSING,
    SKIPPED,
    SOURCE_LOCAL,
    SOURCE_PLATFORM,
    build_plan,
    run_batch,
)
from core.models import System


class Command(BaseCommand):
    help = "Copy stored media to the R2 bucket and path each file now resolves to."

    def add_arguments(self, parser):
        parser.add_argument(
            "--system",
            help=(
                "Limit to one tenant, by host (e.g. elpanbueno.com). Without it "
                "every tenant's files are considered."
            ),
        )
        parser.add_argument(
            "--source",
            choices=(SOURCE_LOCAL, SOURCE_PLATFORM),
            default=SOURCE_LOCAL,
            help=(
                "Where the files are now: 'local' = MEDIA_ROOT on disk (the "
                "production flip), 'platform' = the platform R2 bucket (a tenant "
                "moving to its own). Default: local."
            ),
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Re-copy files that already exist at the destination.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be copied without writing anything.",
        )

    def handle(self, *args, **options):
        if not getattr(settings, "R2_ACCOUNT_ID", ""):
            raise CommandError(
                "R2_ACCOUNT_ID is not set, so there is no bucket to copy into. "
                "This command is for production; development keeps its files in "
                "MEDIA_ROOT and needs no migration."
            )

        if options["system"]:
            system = System.objects.filter(host=options["system"]).first()
            if system is None:
                raise CommandError(f"No System with host '{options['system']}'.")
            systems = [system]
        else:
            systems = list(System.objects.order_by("host"))

        totals = {COPIED: 0, SKIPPED: 0, MISSING: 0, FAILED: 0, FOREIGN: 0}
        repathed = 0

        for system in systems:
            self.stdout.write(self.style.MIGRATE_HEADING(f"{system.host}"))
            plan = build_plan(system)
            if not plan:
                self.stdout.write("  no files\n")
                continue

            # Batched for the same reason the API is: it keeps memory flat and
            # gives the operator a running count on a catalog of any size.
            offset = 0
            while offset < len(plan):
                result = run_batch(
                    system,
                    source=options["source"],
                    offset=offset,
                    limit=MAX_LIMIT,
                    overwrite=options["overwrite"],
                    dry_run=options["dry_run"],
                    plan=plan,
                )
                self._report(result)
                for status, count in result["counts"].items():
                    totals[status] += count
                repathed += result["repathed"]
                offset = result["next_offset"]

        verb = "Would copy" if options["dry_run"] else "Copied"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {totals[COPIED]} ({repathed} re-pathed to their tenant); "
                f"{totals[SKIPPED]} already present; "
                f"{totals[MISSING]} missing at source; "
                f"{totals[FAILED]} failed; {totals[FOREIGN]} skipped as foreign."
            )
        )
        if totals[MISSING]:
            self.stdout.write(
                "Missing files are rows pointing at a file that is not in the "
                "source - deleted by hand, or already migrated from elsewhere. "
                "They are reported, never cleared: the row is the only record "
                "that the file was ever meant to exist."
            )
        if totals[FOREIGN]:
            self.stdout.write(
                self.style.WARNING(
                    "Foreign files are rows whose stored path names a *different* "
                    "tenant. Nothing was copied for them - that path can only come "
                    "from a bug or a hand-edited row, and moving it would spread "
                    "the mistake. Investigate them before re-running."
                )
            )

    def _report(self, result):
        for entry in result["entries"]:
            status = entry["status"]
            if status == SKIPPED:
                continue
            arrow = f"  {entry['name']}"
            if entry["target"] != entry["name"]:
                arrow += f" -> {entry['target']}"
            line = f"  {status:<8}{arrow}"
            if entry["detail"]:
                line += f"  ({entry['detail']})"
            if status in (FAILED, FOREIGN):
                self.stderr.write(self.style.ERROR(line))
            else:
                self.stdout.write(line)
