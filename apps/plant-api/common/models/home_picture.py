from django.db import models
from common.models import LargePicture
from enum import Enum

class Positions(Enum):
    CENTER='center'
    TOP='top'
    RIGHT='right'
    BOTTOM='bottom'
    LEFT='left'
    BOTTOM_RIGHT='bottom_right'
    BOTTOM_LEFT='bottom_left'


class HomePicture(LargePicture):
    system=models.ForeignKey (
        "common.System",
        null=True,
        blank=False,
        on_delete=models.CASCADE
    )
    position=models.CharField(
        null=True,
        blank=True,
        max_length=16,
        choices=[(i.value, i.value) for i in Positions],
        default='center'
    )

    def __str__(self):
        name=self.name or 'picture'
        return "{} - {}".format(
            self.system.site_name,
            name
        )

    class JSONAPIMeta:
        resource_name="HomePicture"
