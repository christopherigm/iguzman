from django.db import models
from common.models import (
    CommonFields,
    MediumPicture,
    RegularPicture,
)
from common.tools import get_unique_slug
from enum import Enum

class RealEstateClassification(MediumPicture):
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
                RealEstateClassification
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Categoría del inmueble"
        verbose_name_plural="Categorías de inmuebles"

    class JSONAPIMeta:
        resource_name="RealEstateClassification"


class RealEstateFeature(CommonFields):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False,
        unique=True
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name="Caracteristica del inmueble"
        verbose_name_plural="Caracteristicas de los inmuebles"

    class JSONAPIMeta:
        resource_name="RealEstateFeature"


class RealEstatePicture(MediumPicture):
    stand=models.ForeignKey (
        "stand.Stand",
        verbose_name="Empresa",
        null=True,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    real_estate=models.ForeignKey(
        "real_estate.RealEstate",
        verbose_name="Inmueble",
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )

    def __str__(self):
        name=self.name or 'picture'
        return "{} - {}".format(
            self.real_estate.name,
            name
        )

    class Meta:
        verbose_name="Foto del inmueble"
        verbose_name_plural="Fotos de los inmuebles"

    class JSONAPIMeta:
        resource_name="RealEstatePicture"


class States(Enum):
    NEW='new'
    LIKE_NEW='like-new'
    USED='used'

class RealEstate(RegularPicture):
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False
    )
    slug=models.SlugField(
        max_length=64,
        null=False,
        blank=False,
        unique=True
    )
    stand=models.ForeignKey(
        "stand.Stand",
        related_name="stand_real_estate",
        verbose_name="Empresa",
        null=False,
        blank=False,
        help_text="Empresa al que pertenece este registro",
        on_delete=models.CASCADE
    )
    classification=models.ForeignKey(
        "real_estate.RealEstateClassification",
        verbose_name="Clasificación",
        null=False,
        blank=False,
        help_text="Clasificación al que pertenece este registro",
        on_delete=models.CASCADE
    )
    state=models.CharField(
        verbose_name="Estado del inmueble",
        null=True,
        blank=True,
        max_length=16,
        choices=[(i.value, i.value) for i in States],
        default='new'
    )
    year=models.PositiveSmallIntegerField(
        verbose_name="Anio del inmueble",
        null=True,
        blank=True,
        help_text="Anio del inmueble",
        default=2000,
    )
    area=models.PositiveSmallIntegerField(
        verbose_name="Area",
        null=True,
        blank=True,
        default=60
    )
    num_of_bedrooms=models.PositiveSmallIntegerField(
        verbose_name="Numero de recamaras",
        null=True,
        blank=True,
        default=1
    )
    num_of_bathrooms=models.PositiveSmallIntegerField(
        verbose_name="Numero de banios",
        null=True,
        blank=True,
        default=1
    )
    num_of_parking_spots=models.PositiveSmallIntegerField(
        verbose_name="Numero de cajones de estacionamiento",
        null=True,
        blank=True,
        default=1
    )
    publish_on_the_wall=models.BooleanField(
        verbose_name="Publicar en el muro",
        blank=False,
        default=False
    )
    price=models.DecimalField(
        verbose_name="Precio del inmueble",
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=5,
        help_text="Precio del inmueble"
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
        "real_estate.RealEstateFeature",
        related_name="real_estate_features",
        verbose_name="Caractarísticas del inmueble",
        blank=True
    )
    real_estate_pictures=models.ManyToManyField(
        "real_estate.RealEstatePicture",
        related_name="real_estate_pictures",
        verbose_name="Fotos",
        blank=True,
        help_text="Fotos del inmueble"
    )
    related=models.ManyToManyField(
        "real_estate.RealEstate",
        related_name="related_real_estates",
        verbose_name="Inmuebles relacionados",
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
                "{}-{}".format(
                    self.stand.slug,
                    self.name
                ),
                RealEstate
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

        if self.final_price > self.stand.real_state_max_price:
            self.stand.real_state_max_price = self.final_price
            self.stand.save()

        super().save(*args, **kwargs)

    def __str__(self):
        return "{} - {}".format(
            self.stand.name,
            self.name
        )

    class Meta:
        verbose_name="Inmueble"
        verbose_name_plural="Inmuebles"

    class JSONAPIMeta:
        resource_name="RealEstate"
