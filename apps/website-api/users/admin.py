from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import EmailVerificationToken, PasskeyCredential, PasswordResetToken, UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = "Profile"
    fields = ("system", "is_admin", "profile_picture")


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "system", "is_admin", "profile_picture")
    list_filter = ("system", "is_admin")
    search_fields = ("user__username", "user__email")
    raw_id_fields = ("user",)


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "token", "created_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("token", "created_at")


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "token", "created_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("token", "created_at")


@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ("user", "system", "name", "created_at")
    list_filter = ("system",)
    search_fields = ("user__username", "user__email", "name")
    readonly_fields = ("credential_id", "public_key", "sign_count", "transports", "created_at")
    raw_id_fields = ("user",)
