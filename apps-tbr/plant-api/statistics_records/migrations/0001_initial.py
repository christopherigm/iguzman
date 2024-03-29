# Generated by Django 4.1.9 on 2023-06-04 07:34

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('records', '0011_remove_measurement_ram_usage_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='DayMeasurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('min_ldr', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('max_ldr', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('average_ldr', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('min_soil_moisture', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('max_soil_moisture', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('average_soil_moisture', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('min_temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('max_temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('average_temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('min_humidity', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('max_humidity', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('average_humidity', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('min_cpu_temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('max_cpu_temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('average_cpu_temperature', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('initial_ram_capacity', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('initial_ram_allocated', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('final_ram_capacity', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('final_ram_allocated', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('initial_storage_capacity', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('initial_storage_allocated', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('final_storage_capacity', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('final_storage_allocated', models.DecimalField(blank=True, decimal_places=3, max_digits=9, null=True)),
                ('hours_of_direct_light', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('times_the_pump_was_triggered', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('debug_data', models.TextField(blank=True, null=True)),
                ('plant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='records.plant')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
