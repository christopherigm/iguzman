from django.db import models
from enum import Enum
from common.tools import set_media_url
from django_resized import ResizedImageField

class PageType(Enum):
    WebPage='Web Page'
    Article='Article'

def picture(instance, filename):
    return set_media_url( 'Page', filename)

class SEOInfo (models.Model):
    keywords=models.CharField (
        null=True,
        blank=True,
        max_length=64
    )
    og_type=models.CharField(
        max_length=32,
        choices=[(tag.value, tag.value) for tag in PageType],
        default='Web Page'
    )
    og_title=models.CharField (
        null=False,
        blank=False,
        max_length=64
    )
    og_site_name=models.CharField (
        null=False,
        blank=False,
        max_length=64
    )
    og_description= models.CharField (
        null=False,
        blank=False,
        max_length=128
    )
    img_og_image=ResizedImageField (
        null=True,
        blank=True,
        size=[512, 512],
        quality=90,
        upload_to=picture
    )

    class Meta:
        abstract=True
