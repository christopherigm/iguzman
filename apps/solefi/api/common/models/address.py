from django.db import models
from common.models import CommonFields
from common.validators import ModelValidators

class Address(CommonFields):
    alias = models.CharField (
        max_length = 32,
        null = False,
        blank = False
    )
    receptor_name = models.CharField(
        null = True,
        blank = True,
        max_length = 64,
        validators = [
            ModelValidators.name
        ]
    )
    phone = models.CharField (
        null = True,
        blank = True,
        max_length = 10,
        validators = [
            ModelValidators.phone
        ]
    )
    zip_code = models.CharField (
        max_length = 5,
        null = True,
        blank = True,
        validators = [
            ModelValidators.zip_code
        ]
    )
    street = models.CharField (
        max_length = 32,
        null = False,
        blank = False
    )
    ext_number = models.CharField (
        max_length = 5,
        null=True,
        blank=True
    )
    int_number = models.CharField (
        max_length=5,
        null=True,
        blank=True
    )
    reference = models.CharField (
        max_length = 128,
        null = True,
        blank = True
    )

    class Meta:
        abstract = True
