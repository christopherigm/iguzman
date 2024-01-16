from django.db import models
# from django.contrib.auth.models import User
from users.models import User
from common.models import CommonFields

class UserJob(CommonFields):
    user=models.ForeignKey(
        'users.User',
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )
    company=models.ForeignKey(
        'resume.Company',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    full_time=models.BooleanField (
        blank=False,
        default=True
    )
    contractor=models.BooleanField (
        blank=False,
        default=False
    )
    job_title=models.CharField(
        max_length=32,
        null=False,
        blank=False
    )
    currently_working_here=models.BooleanField (
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
    job_url=models.URLField(
        null=True,
        blank=True
    )
    job_promotions=models.ManyToManyField(
        'resume.UserJobPromotion',
        related_name='job_promotions',
        blank=True
    )

    def __str__(self):
        return self.job_title

    class JSONAPIMeta:
        resource_name = "UserJob"
