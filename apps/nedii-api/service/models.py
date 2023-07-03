from django.db import models
from common.models import (
    CommonFields,
    MediumPicture,
    RegularPicture,
)
from common.tools import get_unique_slug

class ServiceClassification(MediumPicture):
    stand=models.ForeignKey(
        'stand.Stand',
        related_name='stand_service_classification',
        verbose_name='Empresa',
        null=False,
        blank=False,
        help_text='Empresa al que pertenece este registro',
        on_delete=models.CASCADE
    )
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
                ServiceClassification
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name='Categoría de servicio'
        verbose_name_plural='Categorías de servicios'

    class JSONAPIMeta:
        resource_name='ServiceClassification'


class ServiceFeature(CommonFields):
    stand=models.ForeignKey(
        'stand.Stand',
        related_name='stand_service_feature',
        verbose_name='Empresa',
        null=False,
        blank=False,
        help_text='Empresa al que pertenece este registro',
        on_delete=models.CASCADE
    )
    name=models.CharField (
        max_length=64,
        null=False,
        blank=False,
        unique=True
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name='Caracteristica del servicio'
        verbose_name_plural='Caracteristicas de los servicios'

    class JSONAPIMeta:
        resource_name='ServiceFeature'


class ServicePicture(MediumPicture):
    stand=models.ForeignKey (
        'stand.Stand',
        verbose_name='Empresa',
        null=True,
        blank=False,
        help_text='Empresa al que pertenece este registro',
        on_delete=models.CASCADE
    )
    service=models.ForeignKey(
        'service.Service',
        verbose_name='Servicio',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )

    def __str__(self):
        name=self.name or 'picture'
        return '{} - {}'.format(
            self.service.name,
            name
        )

    class Meta:
        verbose_name='Foto del servicio'
        verbose_name_plural='Fotos de los servicios'

    class JSONAPIMeta:
        resource_name='ServicePicture'


class Service(RegularPicture):
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
    classification=models.ForeignKey(
        'service.ServiceClassification',
        verbose_name='Clasificación',
        null=True,
        blank=False,
        help_text='Clasificación al que pertenece este registro',
        on_delete=models.CASCADE
    )
    stand=models.ForeignKey(
        'stand.Stand',
        related_name='stand_service',
        verbose_name='Empresa',
        null=True,
        blank=False,
        help_text='Empresa al que pertenece este registro',
        on_delete=models.CASCADE
    )
    publish_on_the_wall=models.BooleanField(
        verbose_name='Publicar en el muro',
        blank=False,
        default=False
    )
    price=models.DecimalField(
        verbose_name='Precio del servicio',
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=5,
        help_text='Precio del servicio'
    )
    discount=models.PositiveSmallIntegerField(
        verbose_name='Descuento',
        null=True,
        blank=True,
        default=0,
        help_text='Descuento de 1% a 99%'
    )
    final_price=models.DecimalField(
        verbose_name='Precio final',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        default=0
    )
    short_description=models.CharField(
        verbose_name='Descripción corta',
        max_length=90,
        null=True,
        blank=True,
        help_text='Descripción corta (90 carácteres)'
    )
    features=models.ManyToManyField(
        'service.ServiceFeature',
        related_name='service_features',
        verbose_name='Caractarísticas del servicio',
        blank=True
    )
    service_pictures=models.ManyToManyField(
        'service.ServicePicture',
        related_name='service_pictures',
        verbose_name='Fotos',
        blank=True,
        help_text='Fotos del servicio'
    )
    related=models.ManyToManyField(
        'service.Service',
        related_name='related_services',
        verbose_name='Servicios relacionados',
        blank=True,
    )
    video_link=models.CharField(
        verbose_name='Link del vídeo',
        max_length=512,
        null=True,
        blank=True,
        help_text='Link del vídeo de youtube'
    )
    support_email=models.EmailField(
        verbose_name='Correo de soporte',
        max_length=128,
        null=True,
        blank=True,
        help_text='Correo electrónico de soporte'
    )
    support_info=models.CharField(
        verbose_name='Información de soporte',
        max_length=256,
        null=True,
        blank=True,
        help_text='Información de soporte'
    )
    support_phone=models.CharField(
        verbose_name='Teléfono de soporte',
        max_length=12,
        null=True,
        blank=True,
        help_text='Teléfono de soporte'
    )
    warranty_days=models.PositiveSmallIntegerField(
        verbose_name='Días de garantía',
        null=False,
        blank=True,
        default=0,
        help_text='Días de garantía del servicio'
    )
    times_selled=models.PositiveSmallIntegerField(
        verbose_name='Cantidad de veces vendido',
        null=False,
        blank=True,
        default=0
    )
    views=models.PositiveSmallIntegerField(
        verbose_name='Cantidad de veces visto',
        null=False,
        blank=True,
        default=0
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug=get_unique_slug(
                '{}-{}'.format(
                    self.stand.slug,
                    self.name
                ),
                Service
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

        if self.final_price > self.stand.services_max_price:
            self.stand.services_max_price = self.final_price
            self.stand.save()

        super().save(*args, **kwargs)

    def __str__(self):
        return '{} - {}'.format(
            self.stand.name,
            self.name
        )

    class Meta:
        verbose_name='Servicio'
        verbose_name_plural='Servicios'

    class JSONAPIMeta:
        resource_name='Service'
