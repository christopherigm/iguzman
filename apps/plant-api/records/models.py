from django.db import models
from django.apps import apps
from common.models import CommonFields
from common.tools import get_unique_slug
from django_resized import ResizedImageField
from common.tools import set_media_url

import math
from datetime import datetime
from django.conf import settings
import zoneinfo
from django.utils import timezone


def mc_picture(instance, filename):
    return set_media_url('controller', filename)

def picture(instance, filename):
    return set_media_url('plants', filename)

# Create your models here.

class PlantControllerType(CommonFields):
    name=models.CharField(
        max_length=64,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    min_cpu_temperature=models.SmallIntegerField(
        blank=True,
        null=True,
        default=-40,
    )
    max_cpu_temperature=models.SmallIntegerField(
        blank=True,
        null=True,
        default=85,
    )
    total_ram_capacity=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    total_storage_capacity=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    img_picture = ResizedImageField (
        null=True,
        blank=True,
        quality=90,
        upload_to=mc_picture
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                self.name,
                PlantType
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="PlantControllerType"


class PlantController(CommonFields):
    name=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    plant_controller_type=models.ForeignKey(
        'records.PlantControllerType',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    city=models.ForeignKey(
        'common.City',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    zip_code=models.CharField(
        blank=True,
        null=True,
        max_length=10
    )
    cpu_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    ram_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    storage_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    img_picture = ResizedImageField (
        null=True,
        blank=True,
        quality=90,
        upload_to=mc_picture
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                self.name,
                PlantType
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="PlantMicroController"


class PlantType(CommonFields):
    name=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    min_soil_humidity=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    max_soil_humidity=models.SmallIntegerField(
        blank=True,
        null=True,
        default=100,
    )
    min_ambient_temperature=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    max_ambient_temperature=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    min_ambient_humidity=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    max_ambient_humidity=models.SmallIntegerField(
        blank=True,
        null=True,
        default=100,
    )
    min_light_value=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    max_light_value=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    min_hours_of_direct_light=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    max_hours_of_direct_light=models.SmallIntegerField(
        blank=True,
        null=True,
        default=24
    )
    minutes_to_upload_sensor_data=models.SmallIntegerField(
        blank=True,
        null=True,
        default=10
    )
    img_picture = ResizedImageField (
        null=True,
        blank=True,
        quality=90,
        upload_to=picture
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                self.name,
                PlantType
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="PlantType"


class Plant(CommonFields):
    name=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )
    plant_type=models.ForeignKey(
        'records.PlantType',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    plant_controller=models.ForeignKey(
        'records.PlantController',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    user=models.ForeignKey(
        'users.User',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    img_picture = ResizedImageField (
        null=True,
        blank=True,
        quality=90,
        upload_to=picture
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                self.name,
                Plant
            )
        super().save(*args, **kwargs)


    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="Plant"


class Measurement(CommonFields):
    plant=models.ForeignKey(
        'records.Plant',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    initial_measurement=models.BooleanField(
        default=False
    )
    ldr=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    soil_moisture=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    humidity=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    is_day=models.BooleanField(
        default=False
    )
    pump_triggered=models.BooleanField(
        default=False
    )
    cpu_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    ram_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    storage_allocated=models.DecimalField(
        blank=True,
        null=True,
        max_digits=9,
        decimal_places=3,
    )
    debug_measurment_data=models.TextField(
        blank=True,
        null=True,
    )

    def __str__(self):
        return self.plant.name

    def save(self, *args, **kwargs):
        self.plant.plant_controller.cpu_temperature=self.cpu_temperature
        self.plant.plant_controller.ram_allocated=self.ram_allocated
        self.plant.plant_controller.storage_allocated=self.storage_allocated
        self.plant.plant_controller.save()

        DayMeasurement = apps.get_model(
            app_label='statistics_records',
            model_name='DayMeasurement'
        )
        
        minutes_to_upload_sensor_data = self.plant.plant_type.minutes_to_upload_sensor_data
        today = timezone.make_aware(datetime.now())
        today.replace(tzinfo=zoneinfo.ZoneInfo(settings.TIME_ZONE))
        yesterday=today
        next_measurement=today
        next_measurement=datetime.fromtimestamp(
            next_measurement.timestamp() + (minutes_to_upload_sensor_data*60),
            tz=zoneinfo.ZoneInfo(settings.TIME_ZONE)
        )

        if today.day != next_measurement.day:
            newDayMeasurement = DayMeasurement.objects.create(
                created=today,
                plant=self.plant
            )
            newDayMeasurement.save()

        yesterday=datetime.fromtimestamp(
            yesterday.timestamp() - (24*60*60),
            tz=zoneinfo.ZoneInfo(settings.TIME_ZONE)
        )
        # print("yesterday", yesterday)
        yesterdays_day_measurement=DayMeasurement.objects.filter(
            plant=self.plant,
            created__day=yesterday.day,
            created__month=yesterday.month,
            created__year=yesterday.year
        )
        # print("yesterdays_day_measurement", len(yesterdays_day_measurement))
        
        if len(yesterdays_day_measurement) == 0:
            newDayMeasurement = DayMeasurement.objects.create(
                created=yesterday,
                plant=self.plant
            )
            newDayMeasurement.save()

        super().save(*args, **kwargs)

    class JSONAPIMeta:
        resource_name="Measurement"
