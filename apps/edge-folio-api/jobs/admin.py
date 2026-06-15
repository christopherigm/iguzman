from django.contrib import admin
from django.core.cache import cache

from .models import JobPosting, UserApiCredential


def _invalidate_feed(user_id):
    cache.delete(f'jobs:feed:{user_id}')


def _invalidate_credentials(user_id):
    cache.delete(f'jobs:credentials:{user_id}')


@admin.register(JobPosting)
class JobPostingAdmin(admin.ModelAdmin):
    list_display = (
        'job_title', 'company_name', 'provider', 'country', 'location',
        'is_private', 'owner', 'expires_at', 'created',
    )
    list_filter = ('provider', 'country', 'is_private', 'salary_currency')
    search_fields = ('job_title', 'company_name', 'location', 'provider_uid')
    raw_id_fields = ('owner',)
    readonly_fields = ('dedup_hash', 'provider_uid', 'raw', 'fetched_at', 'created', 'modified')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # A shared posting affects every user's feed; a private one only its owner.
        if obj.is_private and obj.owner_id:
            _invalidate_feed(obj.owner_id)
        else:
            cache.clear()

    def delete_model(self, request, obj):
        owner_id = obj.owner_id
        is_private = obj.is_private
        super().delete_model(request, obj)
        if is_private and owner_id:
            _invalidate_feed(owner_id)
        else:
            cache.clear()


@admin.register(UserApiCredential)
class UserApiCredentialAdmin(admin.ModelAdmin):
    list_display = ('provider', 'user', 'label', 'is_active', 'created')
    list_filter = ('provider', 'is_active')
    search_fields = ('user__email', 'label')
    raw_id_fields = ('user',)
    readonly_fields = ('encrypted_key', 'created', 'modified')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_credentials(obj.user_id)

    def delete_model(self, request, obj):
        user_id = obj.user_id
        _invalidate_credentials(user_id)
        super().delete_model(request, obj)
