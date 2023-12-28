from django.db import models
from colorfield.fields import ColorField

class Theme(models.Model):
    primary_color=ColorField(
        null=False,
        blank=False,
        default='#42a5f5'
    )
    primary_light_1_color=ColorField(
        null=False,
        blank=False,
        default='#64b5f6'
    )
    primary_light_2_color=ColorField(
        null=False,
        blank=False,
        default='#90caf9'
    )
    secondary_color=ColorField(
        null=False,
        blank=False,
        default='#405490'
    )
    secondary_light_1_color=ColorField(
        null=False,
        blank=False,
        default='#405490'
    )
    secondary_light_2_color=ColorField(
        null=False,
        blank=False,
        default='#405490'
    )

    class Meta:
        abstract=True