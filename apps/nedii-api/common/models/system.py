from django.db import models
from common.models import CommonFields
from common.tools import set_media_url
from django_resized import ResizedImageField

def picture(instance, filename):
    return set_media_url( "CommonPicture", filename)

class System(CommonFields):
    site_name=models.CharField (
        max_length=32,
        null=False,
        blank=False,
        default="My CV API"
    )
    img_logo=ResizedImageField (
        null=True,
        blank=True,
        size=[512, 512],
        quality=95,
        upload_to=picture
    )
    home_pictures=models.ManyToManyField(
        "common.HomePicture",
        related_name="home_pictures",
        blank=True
    )
    privacy_policy=models.TextField(
        null=True,
        blank=True
    )
    terms_and_conditions=models.TextField(
        null=True,
        blank=True
    )
    user_data=models.TextField(
        null=True,
        blank=True
    )

    def __str__(self):
        return self.site_name

    class JSONAPIMeta:
        resource_name="System"
