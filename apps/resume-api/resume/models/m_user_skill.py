from django.db import models
# from django.contrib.auth.models import User
from users.models import User
from common.models import CommonFields

class UserSkill(CommonFields):
    user=models.ForeignKey(
        'users.User',
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )
    skill=models.ForeignKey(
        'resume.Skill',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    percentage=models.IntegerField(
        blank = True,
        null=True
    )
    years_of_experience=models.IntegerField(
        blank = True,
        null=True
    )

    def __str__(self):
        return self.user.first_name

    class JSONAPIMeta:
        resource_name = "UserSkill"
