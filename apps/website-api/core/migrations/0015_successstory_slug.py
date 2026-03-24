# Generated migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_basepicture_short_description_companyhighlight_slug'),
    ]

    operations = [
        migrations.AddField(
            model_name='successstory',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
    ]
