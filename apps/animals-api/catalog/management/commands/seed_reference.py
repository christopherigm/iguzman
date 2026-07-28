"""Seed the reference data a fresh database needs before anything can be filed.

Seasons in particular are not optional decoration: ``Sighting.save()`` fills a
blank season by matching the date against ``Season.months``, so with no seasons
in the table every entry is filed with none and the seasons section is empty.

Idempotent - every row is matched by slug, so re-running it after adding a
season updates nothing that already exists. Images and icons are left blank for
the author to upload in the admin.

Seeds both languages: `name` in Spanish, `en_name` in English. Note the
consequence of the idempotency on a database seeded **before** the bilingual
fields landed - those rows already exist, so re-running this changes nothing and
their Spanish names must be typed in the admin (the migration parked their
original English wording in `en_name`, so nothing was lost).

    python manage.py seed_reference
    python manage.py seed_reference --hemisphere south
    python manage.py seed_reference --with-categories
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import Category, Season, WeatherCondition

# Every row is `(name, en_name, slug, ...)`: the content is bilingual, the bare
# `name` is **Spanish** and `en_name` its English twin (core.models.TRANSLATED_FIELDS).
# Slugs stay English and unchanged - they are URLs and stable keys, and this
# command is idempotent by slug, so renaming one would create a duplicate row on
# every existing database rather than update anything.

# Northern hemisphere by meteorological convention (whole months, not solstices -
# a season boundary mid-month would file two sightings from the same weekend
# differently).
NORTHERN_SEASONS = [
    ('Primavera', 'Spring', 'spring', [3, 4, 5]),
    ('Verano', 'Summer', 'summer', [6, 7, 8]),
    ('Otoño', 'Autumn', 'autumn', [9, 10, 11]),
    ('Invierno', 'Winter', 'winter', [12, 1, 2]),
]

SOUTHERN_SEASONS = [
    ('Primavera', 'Spring', 'spring', [9, 10, 11]),
    ('Verano', 'Summer', 'summer', [12, 1, 2]),
    ('Otoño', 'Autumn', 'autumn', [3, 4, 5]),
    ('Invierno', 'Winter', 'winter', [6, 7, 8]),
]

WEATHER_CONDITIONS = [
    ('Despejado', 'Clear', 'clear'),
    ('Soleado', 'Sunny', 'sunny'),
    ('Parcialmente nublado', 'Partly cloudy', 'partly-cloudy'),
    ('Nublado', 'Overcast', 'overcast'),
    ('Niebla', 'Fog', 'fog'),
    ('Llovizna', 'Light rain', 'light-rain'),
    ('Lluvia', 'Rain', 'rain'),
    ('Tormenta', 'Storm', 'storm'),
    ('Nieve', 'Snow', 'snow'),
    ('Viento', 'Windy', 'windy'),
]

# A starter set of sub-categories, one branch at a time. Deliberately behind a
# flag: what an author actually watches is personal, and an unwanted category
# cannot be deleted once a species references it (PROTECT).
STARTER_CATEGORIES = [
    ('animal', [
        ('Venados', 'Deer', 'deer'), ('Ardillas', 'Squirrels', 'squirrels'),
        ('Roedores', 'Rodents', 'rodents'), ('Aves', 'Birds', 'birds'),
        ('Rapaces', 'Raptors', 'raptors'), ('Aves acuáticas', 'Waterfowl', 'waterfowl'),
        ('Mamíferos pequeños', 'Small mammals', 'small-mammals'),
        ('Reptiles', 'Reptiles', 'reptiles'), ('Anfibios', 'Amphibians', 'amphibians'),
        ('Insectos', 'Insects', 'insects'),
    ]),
    ('plant', [
        ('Árboles', 'Trees', 'trees'), ('Flores', 'Flowers', 'flowers'),
        ('Arbustos', 'Shrubs', 'shrubs'), ('Pastos', 'Grasses', 'grasses'),
        ('Helechos', 'Ferns', 'ferns'), ('Musgos', 'Mosses', 'mosses'),
    ]),
    ('fungus', [
        ('Hongos', 'Mushrooms', 'mushrooms'),
        ('Hongos de repisa', 'Bracket fungi', 'bracket-fungi'),
        ('Líquenes', 'Lichens', 'lichens'),
    ]),
    ('season', [('Estaciones', 'Seasons', 'seasons')]),
    ('weather', [('Cielos', 'Skies', 'skies'), ('Tormentas', 'Storms', 'storms')]),
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
        for order, (name, en_name, slug, months) in enumerate(seasons):
            _, was_created = Season.objects.get_or_create(
                slug=slug,
                defaults={'name': name, 'en_name': en_name, 'months': months, 'sort_order': order},
            )
            created += was_created
            existing += not was_created
        self.stdout.write(f'Seasons:   {created} created, {existing} already present')

        created, existing = 0, 0
        for order, (name, en_name, slug) in enumerate(WEATHER_CONDITIONS):
            _, was_created = WeatherCondition.objects.get_or_create(
                slug=slug,
                defaults={'name': name, 'en_name': en_name, 'sort_order': order},
            )
            created += was_created
            existing += not was_created
        self.stdout.write(f'Weather:   {created} created, {existing} already present')

        if options['with_categories']:
            created, existing = 0, 0
            for kind, rows in STARTER_CATEGORIES:
                for order, (name, en_name, slug) in enumerate(rows):
                    _, was_created = Category.objects.get_or_create(
                        slug=slug,
                        defaults={
                            'name': name,
                            'en_name': en_name,
                            'kind': kind,
                            'sort_order': order,
                        },
                    )
                    created += was_created
                    existing += not was_created
            self.stdout.write(f'Categories: {created} created, {existing} already present')

        self.stdout.write(self.style.SUCCESS('Reference data seeded.'))
