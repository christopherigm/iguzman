from django.db import models
from common.models import RegularPicture
from common.tools import set_media_url

def picture(instance, filename):
    return set_media_url('user_pictures', filename)

class UserPicture(RegularPicture):
    user=models.ForeignKey(
        'users.User',
        null = False,
        blank = False,
        on_delete = models.CASCADE
    )

    def __str__(self):
        return self.user.username

    class JSONAPIMeta:
        resource_name = "UserPicture"
