"""``Country`` joins the geography chain above ``State``.

The chain becomes ``Country -> State -> County -> Location``, with the same two
rules it already had one level down: the FK is **required and PROTECT** (a state
with no country is the ambiguity the chain exists to remove, and deleting a
country still in use is refused rather than orphaning every state under it), and
nothing below re-stores what it can walk up to.

The field lands in three steps rather than one because a required FK cannot be
added to a table that might already hold rows:

1. add ``State.country`` nullable,
2. give every existing state a country - see ``assign_default_country``,
3. tighten the column to ``NOT NULL``.

Step 2 is a guard, not a data migration anyone is expected to need: this landed
while the geography tables were still empty on every deployment. It exists so
that a database which *had* typed some states by hand comes through with a
plausible row rather than a failed migration - the operator then edits it.

``State`` and ``County`` also change ``ordering`` here, so both group under the
country before anything else. That is cosmetic in the schema and load-bearing in
a picker, which reads as the tree it is rather than as two countries' states
interleaved alphabetically.
"""

import django.db.models.deletion
from django.db import migrations, models

# What an existing state with no country gets. The United States rather than
# Mexico only because a state typed before this migration was overwhelmingly
# likely to be one of the four US regions this journal covers; the point is that
# the row is *visible and editable*, not that the guess is right.
FALLBACK = {
    'name': 'Estados Unidos',
    'en_name': 'United States',
    'slug': 'united-states',
    'code': 'US',
    'sort_order': 0,
}


def assign_default_country(apps, schema_editor):
    """Point every country-less state at a fallback row, creating it if needed."""
    State = apps.get_model('catalog', 'State')
    orphans = State.objects.filter(country__isnull=True)
    if not orphans.exists():
        return
    Country = apps.get_model('catalog', 'Country')
    country, _ = Country.objects.get_or_create(slug=FALLBACK['slug'], defaults=FALLBACK)
    orphans.update(country=country)


def noop(apps, schema_editor):
    """Reversing only widens the column again - the fallback row is left alone.

    Deleting it here would take any state an operator has since filed under it,
    which a *reverse* migration has no business doing.
    """


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0008_species_created_by_species_is_contribution_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Country',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(max_length=255)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('slug', models.SlugField(max_length=255, unique=True)),
                ('code', models.CharField(blank=True, help_text='ISO 3166-1 alpha-2 code (US, MX). Optional, but unique when set.', max_length=2, null=True, unique=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'verbose_name': 'Country',
                'verbose_name_plural': 'Countries',
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.AlterModelOptions(
            name='state',
            options={
                'ordering': ['country__sort_order', 'country__name', 'sort_order', 'name'],
                'verbose_name': 'State',
                'verbose_name_plural': 'States',
            },
        ),
        migrations.AlterModelOptions(
            name='county',
            options={
                'ordering': [
                    'state__country__sort_order', 'state__country__name',
                    'state__sort_order', 'state__name', 'sort_order', 'name',
                ],
                'verbose_name': 'County',
                'verbose_name_plural': 'Counties',
            },
        ),
        # Nullable first: the column cannot be NOT NULL until every existing row
        # has a value, and `null=True` is the only way to add it to a table that
        # might hold some.
        migrations.AddField(
            model_name='state',
            name='country',
            field=models.ForeignKey(
                help_text='The country this state belongs to. A location reaches its country through here, two tables further up.',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='states',
                to='catalog.country',
            ),
        ),
        migrations.RunPython(assign_default_country, noop),
        migrations.AlterField(
            model_name='state',
            name='country',
            field=models.ForeignKey(
                help_text='The country this state belongs to. A location reaches its country through here, two tables further up.',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='states',
                to='catalog.country',
            ),
        ),
    ]
