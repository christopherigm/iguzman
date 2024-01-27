from django.db import models
from common.models import CommonFields
from common.validators import ModelValidators
from common.tools import set_media_url
from django_resized import ResizedImageField

def picture(instance, filename):
    return set_media_url( 'State', filename)

class State(CommonFields):
    name=models.CharField(
        max_length=32,
        null=False,
        blank=False,
        unique=True,
        validators=[
        ModelValidators.name
        ]
    )
    country=models.ForeignKey(
        'common.Country',
        null=False, 
        blank=False,
        on_delete=models.CASCADE
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="State"
