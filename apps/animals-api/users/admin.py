from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from core.permissions import is_site_admin

from .models import UserProfile, PasskeyCredential


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = ('profile_picture', 'is_admin')


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)
    # `is_admin` lives on the profile, so it is surfaced here as a column - the
    # user list is where an operator looks to see who can edit the site, and the
    # flag is otherwise two clicks down inside each account.
    list_display = BaseUserAdmin.list_display + ('is_site_admin',)

    @admin.display(boolean=True, description='Site admin')
    def is_site_admin(self, obj):
        return is_site_admin(obj)


@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ('user', 'name', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__email', 'name')
    readonly_fields = ('credential_id', 'sign_count', 'created_at')

admin.site.unregister(User)
admin.site.register(User, UserAdmin)
