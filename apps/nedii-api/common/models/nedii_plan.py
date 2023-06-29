from django.db import models
from common.models import CommonFields
from common.validators import ModelValidators
from enum import Enum

class Exposure(Enum):
    BASIC='basic'
    MEDIUM='medium'
    HIGH='high'
    FULL='full'

class NediiPlan(CommonFields):
    name=models.CharField (
        max_length=32,
        null=False,
        blank=False,
        unique=True,
        validators=[
            ModelValidators.name,
        ]
    )
    unlimited_items=models.BooleanField (
        verbose_name="Anuncios ilimitados?",
        blank=False,
        default=False
    )
    number_of_items=models.PositiveSmallIntegerField(
        verbose_name="Numero de anuncios",
        null=True,
        blank=True,
        default=4
    )
    advertising_days=models.PositiveSmallIntegerField(
        verbose_name="Numero de dias de publicidad",
        null=True,
        blank=True,
        default=5
    )
    stand_enabled=models.BooleanField (
        verbose_name="Stand habilitado?",
        blank=False,
        default=True
    )
    digital_card=models.BooleanField (
        verbose_name="Terjeta digital habilitada?",
        blank=False,
        default=True
    )
    billed_monthly=models.BooleanField (
        verbose_name="Cobrado mensualmente?",
        blank=False,
        default=True
    )
    exposure=models.CharField(
        null=True,
        blank=True,
        max_length=8,
        choices=[(i.value, i.value) for i in Exposure]
    )
    price=models.DecimalField(
        verbose_name="Precio del plan",
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=0,
        help_text="Precio del plan"
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="NediiPlan"
