# Generated by Django 4.1.9 on 2023-06-22 06:58

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('records', '0013_remove_measurement_total_ram_capacity_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='plantcontroller',
            old_name='plant_constroller_type',
            new_name='plant_controller_type',
        ),
    ]
