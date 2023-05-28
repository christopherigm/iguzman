# Generated by Django 4.1.9 on 2023-05-19 00:59

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Plant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=1)),
                ('name', models.CharField(max_length=32, verbose_name='Name')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Measurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=1)),
                ('ldr', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('soil_moisture', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('humidity', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('is_day', models.BooleanField(default=False)),
                ('plant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='records.plant')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
