"""Move the catalog's photographs from REGULAR (1200) to REGULAR_PLUS (2560/q90).

Covers the five records' own `image` column, their five gallery tables, and
`Location.image` - which is declared by hand rather than inherited, so it is the
one that a future tier change can silently miss.

Schema-only: `max_size` and `quality` live on the field instance, not in the
column, so this rewrites no rows and touches no file. **Existing images keep the
1200 px files they were stored as** - only a re-upload gets the new tier. The
`icon` fields stay at ICON and are deliberately absent here.
"""

import core.fields
import core.models
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0010_location_image'),
    ]

    operations = [
        migrations.AlterField(
            model_name='category',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='categoryimage',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='location',
            name='image',
            field=core.fields.ResizedImageField(blank=True, help_text="The place's main image. Leave empty to use the first photo below.", max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='locationimage',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='season',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='seasonimage',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='species',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='speciesimage',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='weathercondition',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='weatherconditionimage',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
    ]
