from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import UserProfile, PasskeyCredential, TvDeviceCode, S3Bucket


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ('user', 'name', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__email', 'name')
    readonly_fields = ('credential_id', 'sign_count', 'created_at')

@admin.register(TvDeviceCode)
class TvDeviceCodeAdmin(admin.ModelAdmin):
    list_display = ('user_code', 'status', 'user', 'created_at', 'expires_at')
    list_filter = ('status', 'created_at')
    search_fields = ('user_code', 'user__email')
    readonly_fields = ('user_code', 'device_code', 'created_at')


@admin.register(S3Bucket)
class S3BucketAdmin(admin.ModelAdmin):
    list_display = ('label', 'user', 'bucket_name', 'endpoint_url', 'created')
    list_filter = ('created',)
    search_fields = ('label', 'bucket_name', 'user__email')
    # The encrypted secret is never editable/viewable in the admin.
    exclude = ('secret_access_key_encrypted',)
    readonly_fields = ('created',)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)
