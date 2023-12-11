from django.db import models

class Social(models.Model):
    facebook=models.URLField (
        null=True,
        blank=True
    )
    whatsapp=models.CharField (
        null=True,
        blank=True,
        max_length=10
    )
    twitter=models.URLField (
        null=True,
        blank=True
    )
    youtube=models.URLField (
        null=True,
        blank=True
    )
    instagram=models.URLField (
        null=True,
        blank=True
    )
    linkedin=models.URLField (
        null=True,
        blank=True
    )

    class Meta:
        abstract=True
