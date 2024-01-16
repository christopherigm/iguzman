import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django_resized import ResizedImageField
from common.tools import set_media_url
from common.models import CommonFields
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
    open_to_work=models.BooleanField (
        blank=False,
        default=False
    )
    listening_offers=models.BooleanField (
        blank=False,
        default=False
    )
    willing_to_comute=models.BooleanField (
        blank=False,
        default=True
    )
    public=models.BooleanField (
        blank=False,
        default=False
    )
    listed=models.BooleanField (
        blank=False,
        default=False
    )
    published=models.BooleanField (
        blank=False,
        default=False
    )
    display_email=models.BooleanField (
        blank=False,
        default=False
    )
    headline=models.CharField(
        max_length=32,
        null=False,
        blank=False,
        default='Engineer / Doctor / Architech'
    )
    biography=models.TextField(
        null=True,
        blank=True
    )
    legal_name=models.CharField(
        max_length=64,
        null=False,
        blank=True
    )
    phone_number=models.CharField(
        max_length=10,
        null=True,
        blank=True
    )
    birthday=models.DateField(
        null=True,
        blank=True
    )
    city=models.ForeignKey(
        'common.City',
        null=True,
        blank=True,
        on_delete=models.CASCADE
    )
    linkedin=models.URLField(
        null=True,
        blank=True
    )
    github=models.URLField(
        null=True,
        blank=True
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
    categories=models.ManyToManyField(
        'resume.SkillCategory',
        related_name='user_categories',
        blank=True
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

    def save(self, *args, **kwargs):
        if not self.legal_name:
            self.legal_name = "{} {}".format(
                self.first_name,
                self.last_name
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return self.username

    class JSONAPIMeta:
        resource_name = "User"
