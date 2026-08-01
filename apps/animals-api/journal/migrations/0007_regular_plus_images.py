"""Move the journal's photographs from REGULAR (1200) to REGULAR_PLUS (2560/q90).

Schema-only, and cheap: `max_size` and `quality` live on the field instance, not
in the column, so this rewrites no rows and touches no file. **It does not
re-render anything already uploaded** - an existing photo stays the 1200 px file
it was stored as, and only a re-upload gets the new tier.

`poster` on SightingMedia stays at MEDIUM and is deliberately absent here.
"""

import core.fields
import core.models
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('journal', '0006_sightingmedia_height_sightingmedia_processing_error_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sighting',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
        migrations.AlterField(
            model_name='sightingmedia',
            name='image',
            field=core.fields.ResizedImageField(blank=True, max_size=[2560, None], null=True, quality=90, upload_to=core.models.picture),
        ),
    ]
