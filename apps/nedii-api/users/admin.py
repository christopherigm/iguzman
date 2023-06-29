from django.contrib import admin
from users.models import User, UserPicture
from django.contrib.auth.admin import UserAdmin

# Register your models here.

# admin.site.register(User, UserAdmin)
class CustomUserAdmin(UserAdmin):
    fieldsets = None
    readonly_fields=(
        "token",
        "date_joined",
        "last_login"
    )

admin.site.register(User, CustomUserAdmin)

class UserPictureAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "img_picture"
    ]
    list_filter = ("enabled",)
    readonly_fields=(
        "version",
    )

admin.site.register(UserPicture, UserPictureAdmin)
