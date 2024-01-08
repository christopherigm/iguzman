from django.db import models
from common.models import CommonFields
from django_resized import ResizedImageField
from common.tools import set_media_url

def picture(instance, filename):
    return set_media_url('skills', filename)

class Skill(CommonFields):
    name=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    category=models.ForeignKey(
        'resume.SkillCategory',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[512, 512],
        quality=90,
        upload_to=picture
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name = "Skill"


class SkillCategory(CommonFields):
    name=models.CharField(
        max_length=64,
        null=False,
        blank=False
    )
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[512, 512],
        quality=90,
        upload_to=picture
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name = "SkillCategory"
