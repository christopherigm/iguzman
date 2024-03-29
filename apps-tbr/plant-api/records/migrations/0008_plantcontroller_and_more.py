# Generated by Django 4.1.9 on 2023-05-30 21:45

from django.db import migrations, models
import django.db.models.deletion
import django_resized.forms
import records.models


class Migration(migrations.Migration):

    dependencies = [
        ('records', '0007_plant_img_picture_planttype_img_picture'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlantController',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=32)),
                ('slug', models.SlugField(blank=True, max_length=64, null=True, unique=True)),
                ('min_cpu_temperature', models.SmallIntegerField(blank=True, default=-40, null=True)),
                ('max_cpu_temperature', models.SmallIntegerField(blank=True, default=85, null=True)),
                ('ram_capacity', models.DecimalField(blank=True, decimal_places=2, max_digits=9, null=True)),
                ('storage_capacity', models.DecimalField(blank=True, decimal_places=2, max_digits=9, null=True)),
                ('img_picture', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=90, scale=None, size=[1920, 1080], upload_to=records.models.mc_picture)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.RenameField(
            model_name='planttype',
            old_name='hours_of_direct_light',
            new_name='min_hours_of_direct_light',
        ),
        migrations.AddField(
            model_name='measurement',
            name='initial_measurement',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='measurement',
            name='pump_triggered',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='measurement',
            name='ram_usage',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='measurement',
            name='storage_usage',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='planttype',
            name='max_ambient_humidity',
            field=models.SmallIntegerField(blank=True, default=100, null=True),
        ),
        migrations.AddField(
            model_name='planttype',
            name='max_hours_of_direct_light',
            field=models.SmallIntegerField(blank=True, default=24, null=True),
        ),
        migrations.AddField(
            model_name='planttype',
            name='max_soil_humidity',
            field=models.SmallIntegerField(blank=True, default=100, null=True),
        ),
        migrations.AlterField(
            model_name='plant',
            name='name',
            field=models.CharField(max_length=32),
        ),
        migrations.AlterField(
            model_name='planttype',
            name='name',
            field=models.CharField(max_length=32),
        ),
        migrations.AddField(
            model_name='plant',
            name='plant_controller',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='records.plantcontroller'),
        ),
    ]
