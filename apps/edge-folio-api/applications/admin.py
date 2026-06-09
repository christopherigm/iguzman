from django.contrib import admin
from django.core.cache import cache

from .models import JobApplication


def _invalidate_application(user_id, pk=None):
    cache.delete(f'applications:applications:{user_id}')
    if pk is not None:
        cache.delete(f'applications:application:{user_id}:{pk}')


@admin.register(JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):
    list_display = ('job_title', 'company_name', 'status', 'user', 'created')
    list_filter = ('status',)
    search_fields = ('job_title', 'company_name', 'user__email')
    raw_id_fields = ('user',)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_application(obj.user_id, obj.pk)

    def delete_model(self, request, obj):
        _invalidate_application(obj.user_id, obj.pk)
        super().delete_model(request, obj)
