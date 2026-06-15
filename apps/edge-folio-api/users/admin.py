from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import PasskeyCredential, UserProfile


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = (
        'profile_picture', 'job_title', 'years_of_experience', 'preferred_stack',
        'job_search_include_title', 'job_search_extra_text', 'job_search_bilingual',
        'job_search_include_tn_profession', 'job_search_include_education',
        'job_search_include_years', 'job_search_include_stack', 'job_search_include_location',
        'job_search_generated_query',
    )


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ('user', 'name', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__email', 'name')
    readonly_fields = ('credential_id', 'sign_count', 'created_at')


admin.site.unregister(User)
admin.site.register(User, UserAdmin)
