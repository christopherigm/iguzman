# Generated by Django 5.0.6 on 2024-06-26 19:18

import colorfield.fields
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('stand', '0006_alter_standphone_unique_together'),
    ]

    operations = [
        migrations.AlterField(
            model_name='category',
            name='color',
            field=colorfield.fields.ColorField(blank=True, default='#42a5f5', image_field=None, max_length=25, null=True, samples=None),
        ),
    ]
