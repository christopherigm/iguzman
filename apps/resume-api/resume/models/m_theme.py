from django.db import models
from common.models import CommonFields
from colorfield.fields import ColorField

class Theme(CommonFields):
    name=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    primary_color=ColorField(
        null=True,
        blank=True,
        default="#42a5f5"
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name = "Theme"
