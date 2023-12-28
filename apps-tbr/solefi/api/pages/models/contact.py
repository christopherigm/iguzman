from django.db import models
from common.validators import ModelValidators
from common.models import Address

class PageAddress(Address):
    page=models.ForeignKey (
        'pages.Page',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    local_region = models.CharField(
        null = True,
        blank = True,
        max_length = 64,
        validators = [
            ModelValidators.name
        ]
    )
    city=models.ForeignKey (
        'common.City',
        related_name='page_address_city',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )

    def __str__(self):
        return self.alias

    class JSONAPIMeta:
        resource_name="PageAddress"

class Contact(models.Model):
    address=models.ForeignKey (
        PageAddress,
        related_name='page_main_address',
        null=True,
        blank=True,
        on_delete=models.CASCADE
    )
    branches=models.ManyToManyField (
        PageAddress,
        related_name='page_branches_address',
        blank=True
    )
    main_phone=models.CharField (
        null=True,
        blank=True,
        max_length=10,
        validators=[
            ModelValidators.phone
        ]
    )
    email=models.EmailField (
        null=True,
        blank=True
    )

    class Meta:
        abstract=True
