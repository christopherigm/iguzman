from django.db import models
from common.models import CommonFields

class Font(CommonFields):
    name = models.CharField (
        null = False,
        blank = False,
        max_length = 32
    )
    family = models.CharField (
        null = False,
        blank = False,
        max_length = 128
    )
    css = models.CharField (
        null = False,
        blank = False,
        max_length = 32
    )

    def __str__(self):
        return self.name
