from django.db import models
from common.models import CommonFields
from common.validators import ModelValidators

class City(CommonFields):
    name = models.CharField (
        max_length = 32,
        null = False,
        blank = False,
        unique = True,
        validators = [
            ModelValidators.name
        ]
    )
    state = models.ForeignKey (
        'common.State',
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )

    def __str__(self):
        return '{0} - {1}'.format (
            self.name,
            self.state.name
        )

    class JSONAPIMeta:
        resource_name = 'City'
