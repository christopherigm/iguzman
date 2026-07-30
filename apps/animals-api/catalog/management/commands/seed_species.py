"""Seed the catalog with the common species of the regions this journal covers.

Companion to ``seed_reference``, which creates the seasons, weather conditions
and the sub-categories themselves. This one fills those sub-categories with
species: what is actually observable in Colorado, California, New York,
Washington, Mexico City and Baja California Sur.

    python manage.py seed_species
    python manage.py seed_species --kind animal --kind plant
    python manage.py seed_species --update      # also refresh existing rows
    python manage.py seed_species --dry-run

**Idempotent by slug**, exactly like ``seed_reference``: re-running it creates
nothing that already exists and, by default, does not touch a row an author has
since edited. That default is the important half - the whole point of the CMS is
that a person rewrites this copy, and a seed command that overwrote their work on
every deploy would be worse than no seed command at all. ``--update`` opts into
refreshing the seeded fields on rows that already exist, and is the flag to use
when this file itself has been corrected.

Where the data comes from
-------------------------
``catalog/data/species.json`` is generated, not hand-typed. The species in it and
their order are taken from iNaturalist's research-grade observation counts for
the six regions above, queried per region so each one gets an equal vote - a
species common in Colorado *and* Mexico City outranks one that is merely
abundant in California, which has far more observers than the rest. Scientific
names, families and the Spanish common names come from the same source;
``sort_order`` is that popularity ranking, so the top of every category is what
an author is most likely to file first.

The descriptions are written for this project. Nothing here is copied from
Wikipedia or any other source, deliberately: the site publishes this text under
its own name, and a share-alike licence would follow it into every payload.

Bilingual columns
-----------------
``name`` is Spanish and ``en_name`` English (``core.models.TRANSLATED_FIELDS``).
The Spanish common name is real where iNaturalist had one. The **prose is English
in both halves**, which is the same state as every row written before the
bilingual fields landed - it keeps ``/es`` readable instead of blank, and leaves
``/api/ai/translate/`` an English source to translate from. Translating it is a
content task for the CMS, not a code task.

Images are left empty. A photograph belongs to whoever took it, so the gallery is
something an author uploads; see the "first photo is the record's cover" note in
this app's CLAUDE.md.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import KIND_VALUES, Category, Species

DATA_FILE = Path(__file__).resolve().parents[2] / 'data' / 'species.json'

# The fields this command owns. Listed once so `--update` refreshes exactly what
# the seed file is the source of for, and never touches `enabled`, `is_featured`,
# `image`, `icon`, `href` or `video_link` - all of which are an author's to set.
SEEDED_FIELDS = [
    'name', 'en_name', 'scientific_name', 'family', 'short_description',
    'en_short_description', 'description', 'en_description', 'sort_order',
]


class Command(BaseCommand):
    help = 'Seed the catalog with the common species of the journal\'s regions.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--kind',
            action='append',
            choices=KIND_VALUES,
            dest='kinds',
            help='Only seed categories in this branch. Repeatable; default is all.',
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='Also refresh the seeded fields on species that already exist. '
                 'Off by default so an author\'s edits survive a re-run.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change and roll back.',
        )

    def handle(self, *args, **options):
        if not DATA_FILE.exists():
            raise CommandError(f'Data file missing: {DATA_FILE}')

        with DATA_FILE.open() as fh:
            payload = json.load(fh)

        kinds = set(options['kinds'] or KIND_VALUES)
        update = options['update']
        dry_run = options['dry_run']

        try:
            with transaction.atomic():
                counts = self._seed(payload, kinds, update)
                if dry_run:
                    # Raise to unwind the transaction; caught just below so the
                    # command still exits 0 and prints its report.
                    raise _Rollback(counts)
        except _Rollback as rollback:
            counts = rollback.counts
            self.stdout.write(self.style.WARNING('Dry run - rolled back.'))

        self.stdout.write(
            f'Categories: {counts["categories_created"]} created, '
            f'{counts["categories_existing"]} already present'
        )
        self.stdout.write(
            f'Species:    {counts["created"]} created, '
            f'{counts["updated"]} updated, {counts["skipped"]} left alone'
        )
        if counts['unknown_categories']:
            self.stdout.write(self.style.WARNING(
                'Skipped species in categories that do not exist (run '
                '`seed_reference --with-categories` first): '
                + ', '.join(sorted(counts['unknown_categories']))
            ))
        self.stdout.write(self.style.SUCCESS('Species seeded.'))

    def _seed(self, payload, kinds, update):
        counts = {
            'categories_created': 0, 'categories_existing': 0, 'created': 0,
            'updated': 0, 'skipped': 0, 'unknown_categories': set(),
        }

        # The five categories this data set adds. `seed_reference` predates them,
        # so they are created here rather than there - a database seeded before
        # this landed would otherwise have nowhere to file a coyote.
        for row in payload.get('categories', []):
            if row['kind'] not in kinds:
                continue
            _, created = Category.objects.get_or_create(
                slug=row['slug'],
                defaults={
                    'name': row['name'],
                    'en_name': row['en_name'],
                    'kind': row['kind'],
                    'scientific_name': row.get('scientific_name'),
                    'sort_order': row.get('sort_order', 0),
                },
            )
            counts['categories_created' if created else 'categories_existing'] += 1

        categories = {c.slug: c for c in Category.objects.all()}

        for row in payload['species']:
            category = categories.get(row['category'])
            if category is None:
                counts['unknown_categories'].add(row['category'])
                continue
            if category.kind not in kinds:
                continue

            fields = {name: row.get(name) for name in SEEDED_FIELDS}
            existing = Species.objects.filter(slug=row['slug']).first()

            if existing is None:
                Species.objects.create(
                    slug=row['slug'], category=category, **fields
                )
                counts['created'] += 1
            elif update:
                for name, value in fields.items():
                    setattr(existing, name, value)
                existing.category = category
                existing.save(update_fields=[*SEEDED_FIELDS, 'category', 'modified'])
                counts['updated'] += 1
            else:
                counts['skipped'] += 1

        return counts


class _Rollback(Exception):
    """Unwinds the seed transaction for ``--dry-run``, carrying the report out."""

    def __init__(self, counts):
        super().__init__('dry run')
        self.counts = counts
