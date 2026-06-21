from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0003_movie_backdrop_image_scanqueue_extracted_backdrop_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='movie',
            name='synopsis',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='movie',
            name='trailer_url',
            field=models.URLField(blank=True, max_length=500),
        ),
    ]
