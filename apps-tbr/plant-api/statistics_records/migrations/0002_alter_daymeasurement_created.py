# Generated by Django 4.1.9 on 2023-06-04 08:46

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('statistics_records', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='daymeasurement',
            name='created',
            field=models.DateTimeField(),
        ),
    ]
