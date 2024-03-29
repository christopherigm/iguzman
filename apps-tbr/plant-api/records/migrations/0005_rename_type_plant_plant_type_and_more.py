# Generated by Django 4.1.9 on 2023-05-25 22:03

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('records', '0004_planttype_alter_measurement_version_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='plant',
            old_name='type',
            new_name='plant_type',
        ),
        migrations.RemoveField(
            model_name='planttype',
            name='max_ambient_humidity',
        ),
        migrations.AddField(
            model_name='planttype',
            name='hours_of_direct_light',
            field=models.SmallIntegerField(blank=True, null=True),
        ),
    ]
