"""Write the QR code for orders that do not have one.

Order QR codes are generated at checkout (`orders.views._open_order`), so this
exists for the two populations that route never covered:

* every order placed **before** the field existed, and
* the occasional order whose write failed - `attach_order_qr` is best-effort by
  design, because a slow bucket must never cost a sale.

Safe to re-run: an order that already has a code is skipped unless `--force`.
Scope it to one tenant with `--host` before running it against a database that
holds several, since every write is a round-trip to that tenant's own bucket.

    python manage.py backfill_order_qr
    python manage.py backfill_order_qr --host elpanbueno.com
    python manage.py backfill_order_qr --host elpanbueno.com --force --dry-run
"""

from django.core.management.base import BaseCommand, CommandError

from core.models import System
from orders.models import Order
from orders.services.qr import attach_order_qr, order_detail_url


class Command(BaseCommand):
    help = "Generate the stored QR code for orders that are missing one."

    def add_arguments(self, parser):
        parser.add_argument(
            "--host",
            help="Only orders of the System with this host (e.g. elpanbueno.com).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Rewrite the code even for orders that already have one.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be written without touching storage.",
        )

    def handle(self, *args, **options):
        orders = Order.objects.select_related("system").order_by("pk")

        host = options.get("host")
        if host:
            system = System.objects.filter(host=host).first()
            if system is None:
                raise CommandError(f"No System with host {host!r}.")
            orders = orders.filter(system=system)

        force = options["force"]
        if not force:
            # `""` and NULL are both "no file": ImageField writes an empty string
            # on a row saved without one, while a NULL is what the column default
            # leaves on rows that predate the field.
            orders = orders.filter(qr_code__in=["", None])

        dry_run = options["dry_run"]
        written = failed = 0

        for order in orders.iterator():
            if dry_run:
                self.stdout.write(f"would write {order.pk} -> {order_detail_url(order)}")
                written += 1
                continue
            # Never raises - a failure is logged inside and reported as False, so
            # one unwritable order does not abandon the rest of the backlog.
            if attach_order_qr(order, force=force):
                written += 1
            else:
                failed += 1
                self.stderr.write(self.style.WARNING(f"order {order.pk}: no code written"))

        verb = "would write" if dry_run else "wrote"
        self.stdout.write(self.style.SUCCESS(f"{verb} {written} QR code(s)"))
        if failed:
            self.stdout.write(self.style.WARNING(f"{failed} order(s) failed - see the log"))
