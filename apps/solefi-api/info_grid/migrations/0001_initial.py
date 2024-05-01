# Generated by Django 3.0.6 on 2021-05-06 05:34

import colorfield.fields
import common.models.picture
from django.db import migrations, models
import django.db.models.deletion
import django_resized.forms
import tinymce.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='InfoGrid',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(blank=True, max_length=64, null=True)),
                ('sub_title', models.CharField(blank=True, max_length=64, null=True)),
                ('link', models.URLField(blank=True, null=True)),
                ('button_text', models.CharField(blank=True, max_length=32, null=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='InfoGridItem',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(blank=True, max_length=64, null=True)),
                ('description', tinymce.models.HTMLField(blank=True, null=True)),
                ('href', models.URLField(blank=True, null=True)),
                ('img_picture', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=90, size=[1920, 1080], upload_to=common.models.picture.picture)),
                ('color', colorfield.fields.ColorField(blank=True, default='#42a5f5', max_length=18, null=True)),
                ('order', models.PositiveIntegerField(blank=True, default=1, null=True)),
                ('icon', models.CharField(blank=True, max_length=32, null=True)),
                ('info_grid', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='info_grid_item', to='info_grid.InfoGrid')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]