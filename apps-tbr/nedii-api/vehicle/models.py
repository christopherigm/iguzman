from django.db import models
from common.models import (
    CommonFields,
    MediumPicture,
    RegularPicture,
)
from common.tools import get_unique_slug
from enum import Enum

class VehicleClassification(MediumPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    slug=models.SlugField (
        max_length=64,
        null=True,
        blank=True,
        unique=True
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                self.name,
                VehicleClassification
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Categoría del vehiculo"
        verbose_name_plural="Categorías de vehiculos"

    class JSONAPIMeta:
        resource_name="VehicleClassification"


class VehicleFeature(CommonFields):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False,
        unique=True
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Caracteristica del vehiculo"
        verbose_name_plural="Caracteristicas de los vehiculos"

    class JSONAPIMeta:
        resource_name="VehicleFeature"


class VehiclePicture(MediumPicture):
    stand=models.ForeignKey (
        "stand.Stand",
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    vehicle=models.ForeignKey(
        "vehicle.Vehicle",
        verbose_name="Vehiculo",
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )

    def __str__(self):
        name=self.name or 'picture'
        return "{} - {}".format(
            self.vehicle.name,
            name
        )

    class Meta:
        verbose_name="Foto del vehiculo"
        verbose_name_plural="Fotos de los vehiculos"

    class JSONAPIMeta:
        resource_name="VehiclePicture"


class VehicleMake(MediumPicture):
    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Marca del vehiculo"
        verbose_name_plural="Marcas de los vehiculos"

    class JSONAPIMeta:
        resource_name="VehicleMake"


class VehicleModel(MediumPicture):
    make=models.ForeignKey(
        "vehicle.VehicleMake",
        verbose_name="Marca de vehiculo",
        null=True,
        blank=False,
        help_text="Marca del vehiculo al que pertenece este registro",
        on_delete=models.CASCADE
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Modelo del vehiculo"
        verbose_name_plural="Modelos de los vehiculos"

    class JSONAPIMeta:
        resource_name="VehicleModel"


class States(Enum):
    NEW='new'
    LIKE_NEW='like-new'
    USED='used'

class Vehicle(RegularPicture):
    slug=models.SlugField(
        max_length=64,
        null=False,
        blank=False,
        unique=True
    )
    stand=models.ForeignKey(
        "stand.Stand",
        related_name="stand_vehicle",
        verbose_name="Empresa",
        null=False,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    classification=models.ForeignKey(
        "vehicle.VehicleClassification",
        verbose_name="Clasificación",
        null=False,
        blank=False,
        help_text="Clasificación al que pertenece este registro",
        on_delete=models.CASCADE
    )
    state=models.CharField(
        verbose_name="Estado del vehiculo",
        null=True,
        blank=True,
        max_length=16,
        choices=[(i.value, i.value) for i in States],
        default='new'
    )
    model=models.ForeignKey(
        "vehicle.VehicleModel",
        verbose_name="Modelo de vehiculo",
        null=False,
        blank=False,
        help_text="Modelo del vehiculo al que pertenece este registro",
        on_delete=models.CASCADE
    )
    year=models.PositiveSmallIntegerField(
        verbose_name="Anio del vehiculo",
        null=False,
        blank=False,
        help_text="Anio del vehiculo",
        default=2000,
    )
    doors=models.PositiveSmallIntegerField(
        verbose_name="Numero de puertas",
        null=False,
        blank=False,
        help_text="Numero de puertas",
        default=4
    )
    gas=models.BooleanField(
        verbose_name="Gasolina",
        blank=False,
        default=True
    )
    diesel=models.BooleanField(
        verbose_name="Diesel",
        blank=False,
        default=False
    )
    electric=models.BooleanField(
        verbose_name="Electric",
        blank=False,
        default=False
    )
    automatic=models.BooleanField(
        verbose_name="Transmision automatica",
        blank=False,
        default=False
    )
    four_wd=models.BooleanField(
        verbose_name="4x4",
        blank=False,
        default=False
    )
    all_wd=models.BooleanField(
        verbose_name="Todo terreno",
        blank=False,
        default=False
    )
    publish_on_the_wall=models.BooleanField(
        verbose_name="Publicar en el muro",
        blank=False,
        default=False
    )
    price=models.DecimalField(
        verbose_name="Precio del vehiculo",
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=5,
        help_text="Precio del vehiculo"
    )
    discount=models.PositiveSmallIntegerField(
        verbose_name="Descuento",
        null=True,
        blank=True,
        default=0,
        help_text="Descuento de 1% a 99%"
    )
    final_price=models.DecimalField(
        verbose_name="Precio final",
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        default=0
    )
    short_description=models.CharField(
        verbose_name="Descripción corta",
        max_length=90,
        null=True,
        blank=True,
        help_text="Descripción corta (90 carácteres)"
    )
    features=models.ManyToManyField(
        "vehicle.VehicleFeature",
        related_name="vehicle_features",
        verbose_name="Caractarísticas del vehiculo",
        blank=True
    )
    vehicle_pictures=models.ManyToManyField(
        "vehicle.VehiclePicture",
        related_name="vehicle_pictures",
        verbose_name="Fotos",
        blank=True,
        help_text="Fotos del vehiculo"
    )
    related=models.ManyToManyField(
        "vehicle.Vehicle",
        related_name="related_vehicles",
        verbose_name="Vehiculos relacionados",
        blank=True,
    )
    video_link=models.CharField(
        verbose_name="Link del vídeo",
        max_length=512,
        null=True,
        blank=True,
        help_text="Link del vídeo de youtube"
    )
    support_email=models.EmailField(
        verbose_name="Correo de soporte",
        max_length=128,
        null=True,
        blank=True,
        help_text="Correo electrónico de soporte"
    )
    support_info=models.CharField(
        verbose_name="Información de soporte",
        max_length=256,
        null=True,
        blank=True,
        help_text="Información de soporte"
    )
    support_phone=models.CharField(
        verbose_name="Teléfono de soporte",
        max_length=12,
        null=True,
        blank=True,
        help_text="Teléfono de soporte"
    )
    warranty_days=models.PositiveSmallIntegerField(
        verbose_name="Días de garantía",
        null=False,
        blank=True,
        default=0,
        help_text="Días de garantía del vehiculo"
    )
    times_selled=models.PositiveSmallIntegerField(
        verbose_name="Cantidad de veces vendido",
        null=False,
        blank=True,
        default=0
    )
    views=models.PositiveSmallIntegerField(
        verbose_name="Cantidad de veces visto",
        null=False,
        blank=True,
        default=0
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                "{}-{}-{}-{}".format(
                    self.stand.slug,
                    self.year,
                    self.model.make.name,
                    self.model.name
                ),
                Vehicle
            )

        final_price=float(self.price)

        discount=0
        if self.discount is not None:
            discount=int(self.discount)

        if 99 > discount > 0:
            discount=discount / 100
            discount=discount * final_price
            final_price -= discount

        self.final_price=final_price

        if self.final_price > self.stand.vehicles_max_price:
            self.stand.vehicles_max_price = self.final_price
            self.stand.save()

        super().save(*args, **kwargs)

    def __str__(self):
        return "{} - {} {} {}".format(
            self.stand.name,
            self.year,
            self.model.make.name,
            self.model.name
        )

    class Meta:
        verbose_name="Vehiculo"
        verbose_name_plural="Vehiculos"

    class JSONAPIMeta:
        resource_name="Vehicle"
