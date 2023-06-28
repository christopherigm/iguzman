from django.db import models
from django.apps import apps
from django.conf import settings
import zoneinfo
from django.utils import timezone
from datetime import date
from common.models import CommonFields


# Create your models here.

class DayMeasurement(CommonFields):
    created=models.DateTimeField (
        null=False
    )
    plant=models.ForeignKey(
        'records.Plant',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    min_ldr=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    max_ldr=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    average_ldr=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    min_soil_moisture=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    max_soil_moisture=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    average_soil_moisture=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    min_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    max_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    average_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    min_humidity=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    max_humidity=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    average_humidity=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    min_cpu_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    max_cpu_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    average_cpu_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    initial_ram_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    final_ram_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    initial_storage_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    final_storage_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    hours_of_direct_light=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    times_the_pump_was_triggered=models.PositiveSmallIntegerField(
        blank=True,
        null=True,
        default=0,
    )
    debug_data=models.TextField(
        blank=True,
        null=True,
    )

    def __str__(self):
        return self.plant.name


    def save(self, *args, **kwargs):
        today = date.today()
        date_to_record = today if self.created is None else self.created
        Measurement = apps.get_model(
            app_label='records',
            model_name='Measurement'
        )
        measurements = Measurement.objects.filter(
            plant=self.plant,
            created__day=date_to_record.day,
            created__month=date_to_record.month,
            created__year=date_to_record.year,
        )
        if len(measurements) > 0:
            min_ldr = measurements[0].ldr
            max_ldr = 0
            average_ldr = 0
            num_of_average_ldr = 0

            min_soil_moisture =  measurements[0].soil_moisture
            max_soil_moisture = 0
            average_soil_moisture = 0

            min_temperature =  measurements[0].temperature
            max_temperature = 0
            average_temperature = 0

            min_humidity =  measurements[0].humidity
            max_humidity = 0
            average_humidity = 0

            min_cpu_temperature =  measurements[0].cpu_temperature
            max_cpu_temperature = 0
            average_cpu_temperature = 0

            min_light = 0
            max_light = 0
            minutes_to_upload_sensor_data = 0
            if (self.plant is not None and
                self.plant.plant_type is not None and
                self.plant.plant_type.min_light_value is not None and
                self.plant.plant_type.max_light_value is not None
            ):
                min_light = self.plant.plant_type.min_light_value
                max_light = self.plant.plant_type.max_light_value
                minutes_to_upload_sensor_data = self.plant.plant_type.minutes_to_upload_sensor_data

            hours_of_direct_light = 0
            times_the_pump_was_triggered = 0
            self.debug_data = ''

            for i in measurements:
                created_fixed = timezone.make_naive(
                    i.created
                )
                created_fixed.replace(tzinfo=zoneinfo.ZoneInfo(settings.TIME_ZONE))
                if (i.ldr is not None and
                    created_fixed.hour > 7 and
                    created_fixed.hour < 19
                ):
                    self.debug_data = self.debug_data + "Created: {0}\nTime: {1}:{2} hrs\nLDR: {3}\n".format(
                        created_fixed,
                        created_fixed.hour,
                        created_fixed.minute,
                        i.ldr
                    )
                    average_ldr = average_ldr + i.ldr
                    self.debug_data = self.debug_data + "average_ldr: {}\n".format(average_ldr)
                    num_of_average_ldr = num_of_average_ldr + 1
                    self.debug_data = self.debug_data + "num_of_average_ldr: {}\n\n".format(num_of_average_ldr)
                if i.ldr is not None:
                    if i.ldr < min_ldr:
                        min_ldr = i.ldr
                    if i.ldr > max_ldr:
                        max_ldr = i.ldr

                if i.soil_moisture is not None:
                    average_soil_moisture = average_soil_moisture + i.soil_moisture
                    if i.soil_moisture < min_soil_moisture:
                        min_soil_moisture = i.soil_moisture
                    if i.soil_moisture > max_soil_moisture:
                        max_soil_moisture = i.soil_moisture

                if i.temperature is not None:
                    average_temperature = average_temperature + i.temperature
                    if i.temperature < min_temperature:
                        min_temperature = i.temperature
                    if i.temperature > max_temperature:
                        max_temperature = i.temperature


                if i.humidity is not None:
                    average_humidity = average_humidity + i.humidity
                    if i.humidity < min_humidity:
                        min_humidity = i.humidity
                    if i.humidity > max_humidity:
                        max_humidity = i.humidity

                if i.cpu_temperature is not None:
                    average_cpu_temperature = average_cpu_temperature + i.cpu_temperature
                    if i.cpu_temperature < min_cpu_temperature:
                        min_cpu_temperature = i.cpu_temperature
                    if i.cpu_temperature > max_cpu_temperature:
                        max_cpu_temperature = i.cpu_temperature

                if (
                    i.ldr is not None and
                    min_light != 0 and max_light != 0 and
                    i.ldr >= min_light and i.ldr <= max_light
                ):
                    hours_of_direct_light = hours_of_direct_light + 1
                if i.pump_triggered is True:
                    times_the_pump_was_triggered = times_the_pump_was_triggered + 1

            self.debug_data = self.debug_data + '\nFinal sum average_ldr: {}\n'.format(average_ldr)
            self.debug_data = self.debug_data + 'Num_of_average_ldr: {}\n'.format(num_of_average_ldr)
            if num_of_average_ldr > 0:
                average_ldr = average_ldr / num_of_average_ldr
            self.min_ldr = min_ldr
            self.max_ldr = max_ldr
            self.average_ldr = average_ldr
            self.debug_data = self.debug_data + '\nFinal average_ldr: {}\n'.format(self.average_ldr)

            average_soil_moisture = average_soil_moisture / len(measurements)
            self.min_soil_moisture = min_soil_moisture
            self.max_soil_moisture = max_soil_moisture
            self.average_soil_moisture = average_soil_moisture

            average_temperature = average_temperature / len(measurements)
            self.min_temperature = min_temperature
            self.max_temperature = max_temperature
            self.average_temperature = average_temperature

            average_humidity = average_humidity / len(measurements)
            self.min_humidity = min_humidity
            self.max_humidity = max_humidity
            self.average_humidity = average_humidity

            average_cpu_temperature = average_cpu_temperature / len(measurements)
            self.min_cpu_temperature = min_cpu_temperature
            self.max_cpu_temperature = max_cpu_temperature
            self.average_cpu_temperature = average_cpu_temperature

            if (hours_of_direct_light > 0 and minutes_to_upload_sensor_data > 0):
                a = hours_of_direct_light
                b = int(minutes_to_upload_sensor_data)
                hours_of_direct_light = round(((a*b) / 60), 2)
            self.hours_of_direct_light = hours_of_direct_light

            self.times_the_pump_was_triggered = times_the_pump_was_triggered

            #self.initial_ram_capacity = measurements[0].total_ram_capacity
            self.initial_ram_allocated = measurements[0].ram_allocated
            #self.final_ram_capacity = measurements[len(measurements)-1].total_ram_capacity
            self.final_ram_allocated = measurements[len(measurements)-1].ram_allocated

            #self.initial_storage_capacity = measurements[0].total_storage_capacity
            self.initial_storage_allocated = measurements[0].storage_allocated
            #self.final_storage_capacity = measurements[len(measurements)-1].total_storage_capacity
            self.final_storage_allocated = measurements[len(measurements)-1].storage_allocated

        super().save(*args, **kwargs)

    class JSONAPIMeta:
        resource_name="DayMeasurement"
