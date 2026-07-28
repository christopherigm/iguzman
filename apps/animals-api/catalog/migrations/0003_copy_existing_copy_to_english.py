"""Move the catalog's existing (English) copy into the new `en_*` columns.

Every row written before the bilingual pairs landed was authored in **English** -
`seed_reference` created "Autumn", "Overcast", "Deer" - while the bare field is
now defined as the **Spanish** one. So the bare fields hold English text sitting
in a Spanish column.

Copying them across is what makes that recoverable. Without it, the first time an
author rewrites `name` in Spanish the English wording is simply gone, with
nothing to restore it from; with it, the English is already parked in `en_name`
and the rewrite is a pure gain. Nothing is blanked here - the bare field keeps
its English text until someone re-authors it, so a Spanish reader sees English
rather than an empty card in the meantime.

Only blank `en_*` fields are filled, which makes the migration idempotent and
means it can never overwrite a translation that already exists.

Irreversible on purpose: the reverse would have to blank `en_*` columns that may
by then hold real, hand-written translations. Rolling back the schema migration
drops the columns anyway.
"""

from django.db import migrations

from core.models import TRANSLATED_FIELDS

# Every catalog model that carries the pairs.
MODELS = ('Category', 'Species', 'SpeciesImage', 'Season', 'WeatherCondition', 'Location')


def copy_to_english(apps, schema_editor):
    for model_name in MODELS:
        model = apps.get_model('catalog', model_name)
        rows = []
        for row in model.objects.all():
            changed = False
            for field in TRANSLATED_FIELDS:
                # Only fill a blank twin, so re-running cannot clobber a real
                # translation. `or ''` covers both NULL and ''.
                if (getattr(row, f'en_{field}') or '').strip():
                    continue
                value = getattr(row, field)
                if value:
                    setattr(row, f'en_{field}', value)
                    changed = True
            if changed:
                rows.append(row)
        if rows:
            model.objects.bulk_update(rows, [f'en_{f}' for f in TRANSLATED_FIELDS])


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0002_translations'),
    ]

    operations = [
        migrations.RunPython(copy_to_english, migrations.RunPython.noop),
    ]
