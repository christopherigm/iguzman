from django.db import migrations, models


class Migration(migrations.Migration):
    """Where a custom basemap's credit links.

    A field rather than a constant because the frontend used to anchor *every*
    credit to openstreetmap.org/copyright - correct for the built-in OSM and
    CARTO styles, wrong the moment the tiles come from anyone else. Blank is a
    real answer (the credit renders as plain text), so nothing is back-filled.
    """

    dependencies = [
        ('core', '0004_system_map_attribution_system_map_style_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='system',
            name='map_attribution_url',
            field=models.URLField(
                blank=True,
                default='',
                help_text=(
                    "Only used when the style is 'Custom'. Where the credit links - "
                    'most providers require it to point back at them, e.g. '
                    'https://www.maptiler.com/copyright/ . Left blank, the credit '
                    'is drawn as plain text.'
                ),
                max_length=300,
            ),
        ),
    ]
