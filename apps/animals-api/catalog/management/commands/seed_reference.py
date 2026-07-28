"""Seed the reference data a fresh database needs before anything can be filed.

Seasons in particular are not optional decoration: ``Sighting.save()`` fills a
blank season by matching the date against ``Season.months``, so with no seasons
in the table every entry is filed with none and the seasons section is empty.

Idempotent - every row is matched by slug, so re-running it after adding a
season updates nothing that already exists. Images and icons are left blank for
the author to upload in the admin.

    python manage.py seed_reference
    python manage.py seed_reference --hemisphere south
    python manage.py seed_reference --with-categories
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import Category, Season, WeatherCondition

# Northern hemisphere by meteorological convention (whole months, not solstices -
# a season boundary mid-month would file two sightings from the same weekend
# differently).
NORTHERN_SEASONS = [
    ('Spring', 'spring', [3, 4, 5]),
    ('Summer', 'summer', [6, 7, 8]),
    ('Autumn', 'autumn', [9, 10, 11]),
    ('Winter', 'winter', [12, 1, 2]),
]

SOUTHERN_SEASONS = [
    ('Spring', 'spring', [9, 10, 11]),
    ('Summer', 'summer', [12, 1, 2]),
    ('Autumn', 'autumn', [3, 4, 5]),
    ('Winter', 'winter', [6, 7, 8]),
]

WEATHER_CONDITIONS = [
    ('Clear', 'clear'),
    ('Sunny', 'sunny'),
    ('Partly cloudy', 'partly-cloudy'),
    ('Overcast', 'overcast'),
    ('Fog', 'fog'),
    ('Light rain', 'light-rain'),
    ('Rain', 'rain'),
    ('Storm', 'storm'),
    ('Snow', 'snow'),
    ('Windy', 'windy'),
]

# A starter set of sub-categories, one branch at a time. Deliberately behind a
# flag: what an author actually watches is personal, and an unwanted category
# cannot be deleted once a species references it (PROTECT).
STARTER_CATEGORIES = [
    ('animal', [
        ('Deer', 'deer'), ('Squirrels', 'squirrels'), ('Rodents', 'rodents'),
        ('Birds', 'birds'), ('Raptors', 'raptors'), ('Waterfowl', 'waterfowl'),
        ('Small mammals', 'small-mammals'), ('Reptiles', 'reptiles'),
        ('Amphibians', 'amphibians'), ('Insects', 'insects'),
    ]),
    ('plant', [
        ('Trees', 'trees'), ('Flowers', 'flowers'), ('Shrubs', 'shrubs'),
        ('Grasses', 'grasses'), ('Ferns', 'ferns'), ('Mosses', 'mosses'),
    ]),
    ('fungus', [
        ('Mushrooms', 'mushrooms'), ('Bracket fungi', 'bracket-fungi'),
        ('Lichens', 'lichens'),
    ]),
    ('season', [('Seasons', 'seasons')]),
    ('weather', [('Skies', 'skies'), ('Storms', 'storms')]),
]


class Command(BaseCommand):
    help = 'Seed seasons, weather conditions and (optionally) starter categories.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hemisphere',
            choices=['north', 'south'],
            default='north',
            help='Which hemisphere the season months follow (default: north).',
        )
        parser.add_argument(
            '--with-categories',
            action='store_true',
            help='Also create a starter set of sub-categories in each branch.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        seasons = SOUTHERN_SEASONS if options['hemisphere'] == 'south' else NORTHERN_SEASONS

        created, existing = 0, 0
        for order, (name, slug, months) in enumerate(seasons):
            _, was_created = Season.objects.get_or_create(
                slug=slug, defaults={'name': name, 'months': months, 'sort_order': order},
            )
            created += was_created
            existing += not was_created
        self.stdout.write(f'Seasons:   {created} created, {existing} already present')

        created, existing = 0, 0
        for order, (name, slug) in enumerate(WEATHER_CONDITIONS):
            _, was_created = WeatherCondition.objects.get_or_create(
                slug=slug, defaults={'name': name, 'sort_order': order},
            )
            created += was_created
            existing += not was_created
        self.stdout.write(f'Weather:   {created} created, {existing} already present')

        if options['with_categories']:
            created, existing = 0, 0
            for kind, rows in STARTER_CATEGORIES:
                for order, (name, slug) in enumerate(rows):
                    _, was_created = Category.objects.get_or_create(
                        slug=slug,
                        defaults={'name': name, 'kind': kind, 'sort_order': order},
                    )
                    created += was_created
                    existing += not was_created
            self.stdout.write(f'Categories: {created} created, {existing} already present')

        self.stdout.write(self.style.SUCCESS('Reference data seeded.'))
