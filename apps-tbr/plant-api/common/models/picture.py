from django.db import models
from common.models import CommonFields
from common.tools import set_media_url
from django_resized import ResizedImageField

def picture(instance, filename):
    return set_media_url( "CommonPicture", filename)

class BasePicture(CommonFields):
    name=models.CharField(
        max_length=64,
        null=True,
        blank=True
    )
    description=models.TextField(
        null=True,
        blank=True
    )
    href=models.URLField(
        null=True,
        blank=True
    )
    full_size=models.BooleanField(
        blank=False,
        default=True
    )

    class Meta:
        abstract=True

class SmallPicture(BasePicture):
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[256, 256],
        quality=85,
        upload_to=picture
    )

    class Meta:
        abstract=True

class MediumPicture(BasePicture):
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[512, 512],
        quality=85,
        upload_to=picture
    )

    class Meta:
        abstract=True

class RegularPicture(BasePicture):
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[1080, 1080],
        quality=85,
        upload_to=picture
    )

    class Meta:
        abstract=True

class LargePicture(BasePicture):
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[1920, 1920],
        quality=85,
        upload_to=picture
    )

    class Meta:
        abstract=True
