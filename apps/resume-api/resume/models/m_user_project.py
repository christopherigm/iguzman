from django.db import models
# from django.contrib.auth.models import User
from users.models import User
from common.models import CommonFields

class UserProject(CommonFields):
    title=models.CharField (
        max_length=32,
        null=False,
        blank=False
    )
    user=models.ForeignKey(
        'users.User',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    company=models.ForeignKey(
        'resume.Company',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    project_skills=models.ManyToManyField(
        'resume.Skill',
        related_name='project_skills',
        blank=True
    )
    active_project=models.BooleanField(
        blank=False,
        default=False
    )
    project_url=models.URLField(
        null=True,
        blank=True,
    )
    start_date=models.DateTimeField(
        null=False
    )
    end_date=models.DateTimeField(
        null=True,
        blank=True
    )
    description=models.TextField(
        null=True,
        blank=True
    )

    def __str__(self):
        return self.title

    class JSONAPIMeta:
        resource_name = "UserProject"
