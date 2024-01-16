from django.db import models
from common.models import CommonFields
# from django.contrib.auth.models import User
from users.models import User
from enum import Enum

class TaskType(Enum):
    BACK_END='back-end'
    FRONT_END='front-end'
    SERVER='server'
    CI_CD='ci-cd'
    DESIGN='design'
    DOCUMENTATION='documentation'
    CHANGE='change'
    IMRPOVEMENT='improvement'
    BUGFIX='bugfix'
    INTEGRATION='integration'
    TESTING='testing'

class Sprint(CommonFields):
    name=models.CharField(
        verbose_name="Sprint Name",
        max_length=256,
        null=False,
        blank=False
    )
    price_per_hour=models.PositiveSmallIntegerField(
        null=False,
        blank=False,
        default=300
    )
    discount=models.PositiveSmallIntegerField(
        null=False,
        blank=False,
        default=0
    )
    tasks=models.ManyToManyField(
        "common.ChangeLog",
        related_name="sprint_tasks",
        verbose_name="Tasks",
        blank=True
    )
    comments=models.TextField(
        null=True,
        blank=True
    )
    date_start=models.DateField(
        null=False
    )
    date_end=models.DateField(
        null=False
    )

    def __str__(self):
        return self.name

    class JSONAPIMeta:
        resource_name="Sprint"


class ChangeLog(CommonFields):
    task_name=models.CharField(
        max_length=256,
        null=False,
        blank=False
    )
    task_type=models.CharField(
        null=True,
        blank=True,
        max_length=32,
        choices=[(i.value, i.value) for i in TaskType],
        default='front-end'
    )
    user=models.ForeignKey(
        User,
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    hours=models.PositiveSmallIntegerField(
        verbose_name="Development time (hours)",
        null=False,
        blank=False,
        default=1
    )
    description=models.TextField(
        null=False,
        blank=False
    )

    def __str__(self):
        return self.task_name

    class JSONAPIMeta:
        resource_name="ChangeLog"
