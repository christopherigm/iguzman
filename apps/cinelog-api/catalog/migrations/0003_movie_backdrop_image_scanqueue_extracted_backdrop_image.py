from django.db import migrations, models

import catalog.models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0002_scanqueue_extracted_genres_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='movie',
            name='backdrop_image',
            field=models.ImageField(blank=True, null=True, upload_to=catalog.models._movie_backdrop_path),
        ),
        migrations.AddField(
            model_name='scanqueue',
            name='extracted_backdrop_image',
            field=models.ImageField(blank=True, null=True, upload_to=catalog.models._scan_backdrop_path),
        ),
    ]
