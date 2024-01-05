from django.db import models
from django_resized import ResizedImageField
from tinymce.models import HTMLField
from common.models import CommonFields
from common.tools import set_media_url
from pages.models import (
    Social,
    Contact,
    SEOInfo
)

def logo(instance, filename):
    return set_media_url( 'Page', filename)

class Page (
        CommonFields,
        Social,
        Contact,
        SEOInfo
    ):
    slogan=models.CharField (
        null=True,
        blank=True,
        max_length=128
    )
    img_logo=ResizedImageField (
        null=True,
        blank=False,
        size=[512, 512],
        quality=100,
        upload_to=logo
    )
    platform_title=models.CharField (
        null=False,
        blank=False,
        max_length=32,
        default='Plataforma'
    )
    platform_description = HTMLField (
        null=False,
        blank=False,
        default='Todo lo que necesitas para tu empresa en un sólo lugar.'
    )
    platform_link=models.URLField(
        null=False,
        blank=False,
        default='https://www.listo.mx/entrar'
    )
    platform_promo_link=models.URLField(
        null=False,
        blank=False,
        default='https://listo.mx/registro?cobranding_id=6'
    )
    img_platform=ResizedImageField (
        null=True,
        blank=False,
        size=[1024, 1024],
        quality=93,
        upload_to=logo
    )
    company_video_title=models.CharField (
        null=False,
        blank=False,
        max_length=128,
        default='Mira nuestro video corporativo'
    )
    company_video=models.FileField (
        null=True,
        blank=True
    )
    views=models.PositiveIntegerField (
        default=1,
        blank=False,
        null=False
    )

    def __str__(self):
        return self.og_title

    class JSONAPIMeta:
        resource_name="Page"
