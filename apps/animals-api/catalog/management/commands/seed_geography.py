"""Seed the geography lookups: the countries, states and counties a place is filed under.

The third seed command, and the one the other two do not depend on -
``seed_reference`` creates the containers and ``seed_species`` fills them, while
this fills the *other* half of the catalog: where a sighting happened.

    python manage.py seed_geography
    python manage.py seed_geography --country mexico
    python manage.py seed_geography --without-counties
    python manage.py seed_geography --update      # also refresh existing rows
    python manage.py seed_geography --dry-run

**Idempotent by slug**, exactly like the other two, and with the same default:
re-running it creates nothing that already exists and does not touch a row an
author has since edited. ``--update`` opts into refreshing the seeded fields, and
is the flag to use when this data set itself has been corrected.

What is in the data file
------------------------
``catalog/data/geography.json`` carries **two countries, 83 states and 244
counties**:

* Both countries this journal covers - the United States and Mexico - with their
  ISO 3166-1 alpha-2 codes.
* Every US state, plus the District of Columbia (51 rows), and all 32 Mexican
  federal entities.
* Counties for the six regions the species data covers, and only those:
  Colorado (64), California (58), Washington (39), New York (62), Mexico City's
  16 alcaldías and Baja California Sur's 5 municipios. The other 77 states are
  seeded without counties on purpose - a county list nobody files against is 3,000
  rows of picker noise, and adding one later is a data change, not a code change.

Where the data comes from
-------------------------
State and county names come from Wikipedia's per-state county lists and from
INEGI's official names of Mexico's federal entities. The Spanish names of the US
states follow **FundéuRAE**'s adapted list, which is why this file says "Hawái",
"Míchigan" and "Pensilvania" rather than the English spellings.

Two conventions that will look like omissions and are not
---------------------------------------------------------
* **``en_name`` is blank wherever no distinct English form exists.** "Colorado",
  "Jalisco" and "Zapopan" are spelled identically in both languages, so only the
  Spanish column is filled and the frontend falls back to it for every locale
  (``apps/animals/lib/i18n-field.ts``). The twin *is* filled where a real English
  form differs - Nueva York/New York, Ciudad de México/Mexico City. This is the
  same rule ``catalog/admin.py`` states on the Location form.
* **County slugs carry their state's abbreviation** - ``jefferson-co``,
  ``jefferson-wa``, ``jefferson-ny``. ``County.slug`` is unique across the whole
  table and US county names repeat heavily: there are three Jeffersons and two
  San Juans in these six regions alone, so an unsuffixed slug would silently
  collapse them into one row filed under the wrong state.

⚠ **A county's state and a state's country are both required and PROTECT**, so
the three passes below run parents-first and a state whose country is missing is
reported rather than guessed at.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import Country, County, State

DATA_FILE = Path(__file__).resolve().parents[2] / 'data' / 'geography.json'

# The fields each pass owns, listed once so `--update` refreshes exactly what the
# seed file is the source of truth for. `enabled` is never here: whether a row is
# published is an author's decision, not this file's.
COUNTRY_FIELDS = ['name', 'en_name', 'code', 'sort_order']
STATE_FIELDS = ['name', 'en_name', 'sort_order']
COUNTY_FIELDS = ['name', 'en_name', 'sort_order']


class Command(BaseCommand):
    help = 'Seed the countries, states and counties a location is filed under.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--country',
            action='append',
            dest='countries',
            help='Only seed this country and what sits under it, by slug '
                 '(united-states, mexico). Repeatable; default is all.',
        )
        parser.add_argument(
            '--without-counties',
            action='store_true',
            help='Seed only the countries and states, no counties.',
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='Also refresh the seeded fields on rows that already exist. Off '
                 'by default so an author\'s edits survive a re-run.',
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

        wanted = set(options['countries'] or [])
        known = {row['slug'] for row in payload['countries']}
        unknown = wanted - known
        if unknown:
            raise CommandError(
                f"Unknown country slug(s): {', '.join(sorted(unknown))}. "
                f"Known: {', '.join(sorted(known))}"
            )

        try:
            with transaction.atomic():
                counts = self._seed(
                    payload,
                    wanted or known,
                    options['without_counties'],
                    options['update'],
                )
                if options['dry_run']:
                    # Raise to unwind the transaction; caught just below so the
                    # command still exits 0 and prints its report.
                    raise _Rollback(counts)
        except _Rollback as rollback:
            counts = rollback.counts
            self.stdout.write(self.style.WARNING('Dry run - rolled back.'))

        for label in ('Countries', 'States', 'Counties'):
            row = counts[label.lower()]
            self.stdout.write(
                f'{label + ":":<11}{row["created"]:>5} created, '
                f'{row["updated"]} updated, {row["skipped"]} left alone'
            )
        if counts['orphans']:
            self.stdout.write(self.style.WARNING(
                'Skipped rows whose parent is absent from this run: '
                + ', '.join(sorted(counts['orphans']))
            ))
        self.stdout.write(self.style.SUCCESS('Geography seeded.'))

    def _seed(self, payload, countries, without_counties, update):
        counts = {
            'countries': {'created': 0, 'updated': 0, 'skipped': 0},
            'states': {'created': 0, 'updated': 0, 'skipped': 0},
            'counties': {'created': 0, 'updated': 0, 'skipped': 0},
            'orphans': set(),
        }

        # Parents first, in all three passes: `State.country` and `County.state`
        # are both required and PROTECT, so a child has nowhere to land until its
        # parent row exists.
        for row in payload['countries']:
            if row['slug'] not in countries:
                continue
            self._upsert(Country, row, COUNTRY_FIELDS, {}, counts['countries'], update)

        country_ids = {c.slug: c for c in Country.objects.all()}

        for row in payload['states']:
            if row['country'] not in countries:
                continue
            parent = country_ids.get(row['country'])
            if parent is None:
                counts['orphans'].add(f"state:{row['slug']}")
                continue
            self._upsert(
                State, row, STATE_FIELDS, {'country': parent}, counts['states'], update
            )

        if without_counties:
            return counts

        state_ids = {s.slug: s for s in State.objects.all()}
        seeded_states = {row['slug'] for row in payload['states'] if row['country'] in countries}

        for row in payload['counties']:
            if row['state'] not in seeded_states:
                continue
            parent = state_ids.get(row['state'])
            if parent is None:
                counts['orphans'].add(f"county:{row['slug']}")
                continue
            self._upsert(
                County, row, COUNTY_FIELDS, {'state': parent}, counts['counties'], update
            )

        return counts

    @staticmethod
    def _upsert(model, row, fields, relations, counts, update):
        """Create the row, or refresh the seeded fields on it when ``--update``.

        The relation is re-applied on an update as well as on a create, so a
        correction that moves a county to another state actually lands - it is the
        one seeded value that is a foreign key rather than a column.
        """
        values = {name: row.get(name) for name in fields}
        existing = model.objects.filter(slug=row['slug']).first()

        if existing is None:
            model.objects.create(slug=row['slug'], **values, **relations)
            counts['created'] += 1
        elif update:
            for name, value in {**values, **relations}.items():
                setattr(existing, name, value)
            existing.save(update_fields=[*fields, *relations, 'modified'])
            counts['updated'] += 1
        else:
            counts['skipped'] += 1


class _Rollback(Exception):
    """Unwinds the seed transaction for ``--dry-run``, carrying the report out."""

    def __init__(self, counts):
        super().__init__('dry run')
        self.counts = counts
