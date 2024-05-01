# Generated by Django 3.0.6 on 2021-07-17 07:57

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0010_pageaddress_local_region'),
    ]

    operations = [
        migrations.AddField(
            model_name='page',
            name='company_video',
            field=models.FileField(blank=True, null=True, upload_to=''),
        ),
        migrations.AddField(
            model_name='page',
            name='company_video_title',
            field=models.CharField(default='Mira nuestro video corporativo', max_length=128),
        ),
    ]