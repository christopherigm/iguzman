import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django_resized import ResizedImageField
from common.tools import set_media_url
from colorfield.fields import ColorField
from django.db import models

def picture(instance, filename):
    return set_media_url('profile', filename)

class User(AbstractUser):
    token=models.UUIDField(
        null = True,
        blank = True,
        default=uuid.uuid4
    )
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[512, 512],
        quality=90,
        upload_to=picture
    )
    img_hero_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[1920, 1080],
        quality=90,
        upload_to=picture
    )
    theme=models.CharField(
        max_length=16,
        null=False,
        blank=False,
        default='default'
    )
    theme_color = ColorField(
        default='#FF0000'
    )
    profile_picture_shape=models.CharField(
        max_length=16,
        null=False,
        blank=False,
        default='default'
    )

    def __str__(self):
        return self.username

    class JSONAPIMeta:
        resource_name = "User"
