"""Geography becomes a catalog: ``State`` + ``County``, replacing three text columns.

``Location.region`` ("State, province or region"), ``Location.country`` and
``Location.map_link`` are **dropped, and their contents are not migrated
anywhere**. That is deliberate and it is destructive - run a backup first.

Why nothing is carried across:

* ``region`` and ``country`` were free text that had to be re-typed on every
  location, which is the duplication ``State``/``County`` exists to remove. The
  values that were there cannot be mapped onto the new pair without guessing:
  ``region`` held state-ish names and there is no country field to receive
  ``country`` at all, so an automatic conversion would create rows that are
  wrong in a way an author then has to find and undo.
* ``map_link`` is redundant now that every place carries coordinates and the CMS
  has a map picker to set them - the site draws its own map rather than linking
  out to someone else's.

Every location comes out of this with ``county = NULL``, and therefore no state,
until an author picks one.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0005_categoryimage'),
    ]

    operations = [
        migrations.CreateModel(
            name='County',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(max_length=255)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('slug', models.SlugField(max_length=255, unique=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'verbose_name': 'County',
                'verbose_name_plural': 'Counties',
                'ordering': ['state__sort_order', 'state__name', 'sort_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='State',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(max_length=255)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('slug', models.SlugField(max_length=255, unique=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'verbose_name': 'State',
                'verbose_name_plural': 'States',
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.RemoveField(
            model_name='location',
            name='country',
        ),
        migrations.RemoveField(
            model_name='location',
            name='map_link',
        ),
        migrations.RemoveField(
            model_name='location',
            name='region',
        ),
        migrations.AddField(
            model_name='location',
            name='county',
            field=models.ForeignKey(blank=True, help_text='The county this place is in. Its state is read from here.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='locations', to='catalog.county'),
        ),
        migrations.AddField(
            model_name='county',
            name='state',
            field=models.ForeignKey(help_text='The state this county belongs to. A location reaches its state through here.', on_delete=django.db.models.deletion.PROTECT, related_name='counties', to='catalog.state'),
        ),
    ]
