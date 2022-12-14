# Generated by Django 3.1.5 on 2021-08-03 07:31

import common.models.country
import common.validators
from django.db import migrations, models
import django.db.models.deletion
import django_resized.forms


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Country',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True, help_text='Define si este registro estará habilitado', verbose_name='Registro habilitado')),
                ('order', models.PositiveIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=32, unique=True, validators=[common.validators.ModelValidators.name])),
                ('code', models.CharField(max_length=2, unique=True)),
                ('phone_code', models.CharField(max_length=2, unique=True)),
                ('img_flag', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=100, size=[128, 128], upload_to=common.models.country.picture)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='State',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True, help_text='Define si este registro estará habilitado', verbose_name='Registro habilitado')),
                ('order', models.PositiveIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=32, unique=True, validators=[common.validators.ModelValidators.name])),
                ('code', models.CharField(max_length=4, unique=True)),
                ('country', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='common.country')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='City',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True, help_text='Define si este registro estará habilitado', verbose_name='Registro habilitado')),
                ('order', models.PositiveIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=32, unique=True, validators=[common.validators.ModelValidators.name])),
                ('state', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='common.state')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
