# Generated by Django 4.1.9 on 2023-06-22 05:41

from django.db import migrations, models
import django_resized.forms
import records.models


class Migration(migrations.Migration):

    dependencies = [
        ('records', '0011_remove_measurement_ram_usage_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlantControllerType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=64)),
                ('slug', models.SlugField(blank=True, max_length=64, null=True, unique=True)),
                ('min_cpu_temperature', models.SmallIntegerField(blank=True, default=-40, null=True)),
                ('max_cpu_temperature', models.SmallIntegerField(blank=True, default=85, null=True)),
                ('total_ram_capacity', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('total_storage_capacity', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('img_picture', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=90, scale=None, size=[1920, 1080], upload_to=records.models.mc_picture)),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
