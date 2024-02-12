# Generated by Django 4.1.9 on 2023-06-28 17:29

import common.models.country
import common.models.picture
import common.models.system
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
            name='ChangeLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('task_name', models.CharField(max_length=256)),
                ('task_type', models.CharField(blank=True, choices=[('back-end', 'back-end'), ('front-end', 'front-end'), ('server', 'server'), ('ci-cd', 'ci-cd'), ('design', 'design'), ('documentation', 'documentation'), ('change', 'change'), ('improvement', 'improvement'), ('bugfix', 'bugfix'), ('integration', 'integration'), ('testing', 'testing')], default='front-end', max_length=32, null=True)),
                ('hours', models.PositiveSmallIntegerField(default=1, verbose_name='Development time (hours)')),
                ('description', models.TextField()),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Country',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=32, unique=True, validators=[common.validators.ModelValidators.name])),
                ('code', models.CharField(max_length=2, unique=True)),
                ('phone_code', models.CharField(max_length=2, unique=True)),
                ('img_flag', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=100, scale=None, size=[128, 128], upload_to=common.models.country.picture)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='HomePicture',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(blank=True, max_length=64, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('href', models.URLField(blank=True, null=True)),
                ('full_size', models.BooleanField(default=True)),
                ('img_picture', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=85, scale=None, size=[1920, 1920], upload_to=common.models.picture.picture)),
                ('position', models.CharField(blank=True, choices=[('center', 'center'), ('top', 'top'), ('right', 'right'), ('bottom', 'bottom'), ('left', 'left'), ('bottom_right', 'bottom_right'), ('bottom_left', 'bottom_left')], default='center', max_length=16, null=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='System',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('site_name', models.CharField(default='My CV API', max_length=32)),
                ('img_logo', django_resized.forms.ResizedImageField(blank=True, crop=None, force_format='JPEG', keep_meta=True, null=True, quality=95, scale=None, size=[512, 512], upload_to=common.models.system.picture)),
                ('privacy_policy', models.TextField(blank=True, null=True)),
                ('terms_and_conditions', models.TextField(blank=True, null=True)),
                ('user_data', models.TextField(blank=True, null=True)),
                ('home_pictures', models.ManyToManyField(blank=True, related_name='home_pictures', to='common.homepicture')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='State',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=32, unique=True, validators=[common.validators.ModelValidators.name])),
                ('country', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='common.country')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Sprint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=256, verbose_name='Sprint Name')),
                ('price_per_hour', models.PositiveSmallIntegerField(default=300)),
                ('discount', models.PositiveSmallIntegerField(default=0)),
                ('comments', models.TextField(blank=True, null=True)),
                ('date_start', models.DateField()),
                ('date_end', models.DateField()),
                ('tasks', models.ManyToManyField(blank=True, related_name='sprint_tasks', to='common.changelog', verbose_name='Tasks')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='homepicture',
            name='system',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='common.system'),
        ),
        migrations.CreateModel(
            name='City',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('name', models.CharField(max_length=32, unique=True, validators=[common.validators.ModelValidators.name])),
                ('state', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='common.state')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]