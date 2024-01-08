from django.db import models
from common.models import CommonFields
from django_resized import ResizedImageField
from common.tools import set_media_url

def picture(instance, filename):
    return set_media_url('companies', filename)

class Company(CommonFields):
    name=models.CharField(
        max_length=64,
        null=False,
        blank=False
    )
    img_picture = ResizedImageField (
        null=True,
        blank=True,
        size=[512, 512],
        quality=90,
        upload_to=picture
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name = "Company"
