import uuid
from django.db import models
from django.contrib.auth.models import User
from common.models import (
    CommonFields,
    Address,
    City
)

# Create your models here.

class UserAddress(Address):
    user = models.ForeignKey (
        User,
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )
    city = models.ForeignKey (
        City,
        related_name = 'user_city_address',
        null = True,
        blank = True,
        on_delete = models.CASCADE
    )

    def __str__(self):
        return self.alias

    class Meta:
        verbose_name = 'User address'
        verbose_name_plural = 'User address'

    class JSONAPIMeta:
        resource_name = 'UserAddress'

class UserProfile(CommonFields):
    user = models.ForeignKey (
        User,
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )
    token = models.UUIDField (
        null = True,
        blank = True,
        default=uuid.uuid4
    )
    newsletter = models.BooleanField (
        default=False,
        blank=False,
        null=False
    )
    promotions = models.BooleanField (
        default=False,
        blank=False,
        null=False
    )

    def __str__(self):
        return self.user.first_name

    class Meta:
        verbose_name = 'User profile'
        verbose_name_plural = 'User profiles'

    class JSONAPIMeta:
        resource_name = 'UserProfile'
