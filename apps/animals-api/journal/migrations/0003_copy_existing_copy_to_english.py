"""Move the journal's existing (English) copy into the new `en_*` columns.

The journal half of ``catalog.migrations.0003_copy_existing_copy_to_english`` -
read that one for the reasoning. Same rule: fill only a blank `en_*` twin, blank
nothing, and do not offer a reverse.
"""

from django.db import migrations

from core.models import TRANSLATED_FIELDS

MODELS = ('Sighting', 'SightingMedia')


def copy_to_english(apps, schema_editor):
    for model_name in MODELS:
        model = apps.get_model('journal', model_name)
        rows = []
        for row in model.objects.all():
            changed = False
            for field in TRANSLATED_FIELDS:
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
        ('journal', '0002_translations'),
    ]

    operations = [
        migrations.RunPython(copy_to_english, migrations.RunPython.noop),
    ]
