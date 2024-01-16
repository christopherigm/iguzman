from django.db import models
# from django.contrib.auth.models import User
from users.models import User
from common.models import CommonFields

class UserSchool(CommonFields):
    user=models.ForeignKey(
        'users.User',
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )
    school=models.ForeignKey(
        'resume.School',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    degree=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    field_of_study=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    currently_studiying_here=models.BooleanField (
        blank=False,
        default=False
    )
    start_date=models.DateField (
        null=False
    )
    end_date=models.DateField (
        null=True,
        blank=True
    )
    city=models.ForeignKey(
        'common.City',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    description=models.TextField(
        null=True,
        blank=True
    )
    school_url=models.URLField(
        null=True,
        blank=True
    )

    def __str__(self):
        return self.school.name

    class JSONAPIMeta:
        resource_name = "UserSchool"
