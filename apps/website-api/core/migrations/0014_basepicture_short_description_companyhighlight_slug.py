# Generated migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_alter_companyhighlight_image_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyhighlight',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='companyhighlight',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='companyhighlight',
            name='slug',
            field=models.SlugField(blank=True, max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='companyhighlightitem',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='companyhighlightitem',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='successstory',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='successstory',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='successstoryimage',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='successstoryimage',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
    ]
