"""Seed the places a sighting can be filed at, for the two regions with data.

Runs **after** ``seed_geography``: every location here names the county it sits
in, and a county that does not exist yet means the place is reported and skipped
rather than filed with no geography at all.

    python manage.py seed_locations
    python manage.py seed_locations --state colorado
    python manage.py seed_locations --place-type park --place-type reserve
    python manage.py seed_locations --update      # also refresh existing rows
    python manage.py seed_locations --dry-run

**Idempotent by slug**, like every other seed command here, and with the same
default: an author's rewrite of a description survives a re-run unless
``--update`` is passed.

What is in the data file
------------------------
``catalog/data/locations.json`` carries **149 places - 117 in Colorado and 32 in
Baja California Sur**, the two regions this data set covers. They are the popular
ones rather than a gazetteer, and they arrive in two layers:

* **The statewide icons** (``sort_order`` 0-61 in Colorado): the national parks
  and monuments, the state parks and wildlife refuges an observer actually visits,
  the national forests, the named lakes and reservoirs, the fourteeners and
  sierras, the well-known trails and the botanical gardens.
* **The Front Range local places** (``sort_order`` 62-116): the 55 city and county
  properties an observer within reach of **Longmont, Boulder, Denver, Loveland and
  Estes Park** actually walks weekly - municipal reservoirs and greenways, county
  open space, the Denver mountain parks, and the named lakes inside Rocky Mountain
  National Park. They sort *after* every statewide icon on purpose: they are the
  local layer, and ``Location.Meta.ordering`` leads with ``sort_order``.

Note that ``sort_order`` is ranked **per region**, so Colorado's 0-61 and Baja's
0-31 deliberately overlap - the number is a prominence hint within its own region,
not a global position.

Coordinates
-----------
Every coordinate is either the one Wikipedia publishes for that place through the
MediaWiki ``coordinates`` API, or an OpenStreetMap/Nominatim match on the named
feature. **Nothing is estimated off a map**, and a candidate whose only available
coordinate pointed at a namesake elsewhere was dropped rather than approximated -
which is what happened to Routt National Forest (whose article coordinate sits in
Wyoming, inside the combined Medicine Bow-Routt unit), to a "Lake Isabelle" that
resolved to Wisconsin, and - in the Front Range pass - to **Waterton Canyon**,
which has no coordinate in Wikipedia or Overpass at all and whose only Nominatim
match was a road in a *different* canyon fifteen miles away. Each row was checked
against a bounding box for its region before being written; that check is what
caught a "McIntosh Lake" article coordinate in Washington state and a "Mills Lake"
one in California.

**The county comes from the US Census geocoder**, not from either coordinate
source. Nominatim contradicted itself on the two places at the east edge of
Longmont - forward search said Weld, reverse said Boulder - and ``county`` is the
only geography column a ``Location`` stores, so getting it wrong silently misfiles
the place's state and country too (they are derived from it; see the model).
Union Reservoir and Sandstone Ranch really are in Weld.

Two conventions worth knowing
-----------------------------
* **The prose is English in both halves of each pair**, exactly as in
  ``seed_species``: it keeps ``/es`` readable instead of blank and leaves
  ``/api/ai/translate/`` an English source to translate from. ``name`` is the
  place's own name - English in Colorado, Spanish in Baja - and ``en_name`` is
  filled only where a real English form exists ("Laguna Ojo de Liebre" / "Ojo de
  Liebre Lagoon"), never as a copy of the Spanish.
* **No Baja California Sur row is a `lake`.** The state has no natural lakes; its
  still water is coastal lagoon and estuary (typed ``wetland``) and its fresh
  water is the spring-fed palm oases (typed ``forest``). Colorado covers the lake
  type with ten rows.

``parent`` is filled where a place genuinely sits inside another one already in
this file - Maroon Lake inside White River National Forest, Isla Coronados inside
Bahía de Loreto National Park, the ten Bear Lake/Glacier Gorge/Lumpy Ridge entries
inside Rocky Mountain National Park - and is resolved in a **second pass**, since a
child may be listed before its parent. It stays **one level deep**: Dream Lake is
parented to the national park, not to Bear Lake below it on the same trail, because
nothing in the schema enforces a depth limit (see ``Location.parent``).

Images are left empty. A photograph belongs to whoever took it, so the gallery is
something an author uploads; ``Location`` has no ``image`` column at all, so its
first uploaded photo simply *is* its cover.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import PLACE_TYPE_CHOICES, County, Location

DATA_FILE = Path(__file__).resolve().parents[2] / 'data' / 'locations.json'

PLACE_TYPE_VALUES = [value for value, _label in PLACE_TYPE_CHOICES]

# The fields this command owns. `--update` refreshes exactly these and never
# `enabled`, `is_featured`, `icon`, `hide_precise_location` or the gallery - all
# of which are an author's to set.
SEEDED_FIELDS = [
    'name', 'en_name', 'place_type', 'latitude', 'longitude',
    'short_description', 'en_short_description', 'description', 'en_description',
    'sort_order',
]


class Command(BaseCommand):
    help = 'Seed the popular places of Colorado and Baja California Sur.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--state',
            action='append',
            dest='states',
            help='Only seed places whose county belongs to this state, by slug '
                 '(colorado, baja-california-sur). Repeatable; default is all.',
        )
        parser.add_argument(
            '--place-type',
            action='append',
            choices=PLACE_TYPE_VALUES,
            dest='place_types',
            help='Only seed places of this type. Repeatable; default is all.',
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='Also refresh the seeded fields on places that already exist. Off '
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

        try:
            with transaction.atomic():
                counts = self._seed(
                    payload,
                    set(options['states'] or []),
                    set(options['place_types'] or PLACE_TYPE_VALUES),
                    options['update'],
                )
                if options['dry_run']:
                    raise _Rollback(counts)
        except _Rollback as rollback:
            counts = rollback.counts
            self.stdout.write(self.style.WARNING('Dry run - rolled back.'))

        self.stdout.write(
            f'Locations: {counts["created"]} created, {counts["updated"]} updated, '
            f'{counts["skipped"]} left alone'
        )
        self.stdout.write(f'Parents:   {counts["parents"]} linked')
        if counts['unknown_counties']:
            self.stdout.write(self.style.WARNING(
                'Skipped places whose county does not exist (run `seed_geography` '
                'first): ' + ', '.join(sorted(counts['unknown_counties']))
            ))
        if counts['unknown_parents']:
            self.stdout.write(self.style.WARNING(
                'Places whose parent was not in this run, left top-level: '
                + ', '.join(sorted(counts['unknown_parents']))
            ))
        self.stdout.write(self.style.SUCCESS('Locations seeded.'))

    def _seed(self, payload, states, place_types, update):
        counts = {
            'created': 0, 'updated': 0, 'skipped': 0, 'parents': 0,
            'unknown_counties': set(), 'unknown_parents': set(),
        }

        counties = {c.slug: c for c in County.objects.select_related('state').all()}
        chosen = []

        for row in payload['locations']:
            if row['place_type'] not in place_types:
                continue
            county = counties.get(row['county'])
            if county is None:
                counts['unknown_counties'].add(row['county'])
                continue
            # `--state` filters on the state read *through* the county, which is
            # the only path there is - a place stores no state of its own.
            if states and county.state.slug not in states:
                continue

            fields = {name: row.get(name) for name in SEEDED_FIELDS}
            # The JSON holds coordinates as numbers (every map library wants
            # them that way, and the read serializer publishes them as numbers
            # too), but they land in a DecimalField. Handing Django the *string*
            # is what makes `Decimal(str(x))` the conversion rather than a binary
            # float widened into a decimal - the same reasoning as core/backup.py's
            # `_encode`, where a float round-trip could move a coordinate.
            for axis in ('latitude', 'longitude'):
                if fields[axis] is not None:
                    fields[axis] = str(fields[axis])
            existing = Location.objects.filter(slug=row['slug']).first()

            if existing is None:
                Location.objects.create(slug=row['slug'], county=county, **fields)
                counts['created'] += 1
            elif update:
                for name, value in fields.items():
                    setattr(existing, name, value)
                existing.county = county
                existing.save(update_fields=[*SEEDED_FIELDS, 'county', 'modified'])
                counts['updated'] += 1
            else:
                counts['skipped'] += 1
                # A row left alone keeps whatever parent it has: re-linking it
                # would be an edit, which is exactly what the default forbids.
                continue
            chosen.append(row)

        # Second pass, because a child may be listed before its parent - and
        # because a `--place-type` run can legitimately exclude the parent, which
        # is reported rather than treated as an error.
        by_slug = {row['slug']: row for row in payload['locations']}
        for row in chosen:
            parent_slug = row.get('parent')
            if not parent_slug:
                continue
            if parent_slug not in by_slug:
                counts['unknown_parents'].add(row['slug'])
                continue
            parent = Location.objects.filter(slug=parent_slug).first()
            if parent is None:
                counts['unknown_parents'].add(row['slug'])
                continue
            child = Location.objects.get(slug=row['slug'])
            child.parent = parent
            # `save()` rather than a queryset `update()`: the receivers in
            # signals.py are what clear the cached location payloads, and a
            # queryset update fires no post_save at all.
            child.save(update_fields=['parent', 'modified'])
            counts['parents'] += 1

        return counts


class _Rollback(Exception):
    """Unwinds the seed transaction for ``--dry-run``, carrying the report out."""

    def __init__(self, counts):
        super().__init__('dry run')
        self.counts = counts
