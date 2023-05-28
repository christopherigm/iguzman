from django.db import models
from common.models import CommonFields
from common.tools import get_unique_slug
from django_resized import ResizedImageField
from common.tools import set_media_url

def picture(instance, filename):
    return set_media_url('plants', filename)

# Create your models here.

class PlantType(CommonFields):
    name=models.CharField(
        verbose_name="Name",
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
    min_light_value=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    max_light_value=models.SmallIntegerField(
        blank=True,
        null=True,
    )
    hours_of_direct_light=models.SmallIntegerField(
        blank=True,
        null=True,
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
        verbose_name="Name",
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
    cpu_temperature=models.DecimalField(
        blank=True,
        null=True,
        max_digits=5,
        decimal_places=2,
    )
    debug_measurment_data=models.TextField(
        blank=True,
        null=True,
    )

    def __str__(self):
        return self.plant.name

    class JSONAPIMeta:
        resource_name="Measurement"
