# Generated by Django 4.1.9 on 2023-05-31 06:51

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('records', '0008_plantcontroller_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='planttype',
            name='minutes_to_upload_sensor_data',
            field=models.SmallIntegerField(blank=True, default=10, null=True),
        ),
    ]