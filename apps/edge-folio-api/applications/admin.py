from django.contrib import admin
from django.core.cache import cache

from .models import Company, JobApplication


def _invalidate_application(user_id, pk=None):
    cache.delete(f'applications:applications:{user_id}')
    if pk is not None:
        cache.delete(f'applications:application:{user_id}:{pk}')


def _invalidate_applications_for_company(company_id):
    for user_id, pk in JobApplication.objects.filter(company_id=company_id).values_list('user_id', 'pk'):
        cache.delete(f'applications:applications:{user_id}')
        cache.delete(f'applications:application:{user_id}:{pk}')


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'normalized_name', 'status', 'is_refreshing', 'retry_count', 'last_refreshed', 'created')
    list_filter = ('status', 'is_refreshing')
    search_fields = ('name', 'normalized_name')
    readonly_fields = ('normalized_name', 'processing_started_at', 'last_refreshed', 'retry_count', 'created', 'modified')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_applications_for_company(obj.pk)

    def delete_model(self, request, obj):
        _invalidate_applications_for_company(obj.pk)
        super().delete_model(request, obj)


@admin.register(JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):
    list_display = ('job_title', 'company_name', 'status', 'location', 'salary_min', 'salary_max', 'salary_currency', 'overall_match', 'technical_match', 'nafta_tn_likelihood', 'user', 'created')
    list_filter = ('status', 'salary_currency', 'us_citizen_or_pr_required')
    search_fields = ('job_title', 'company_name', 'user__email')
    raw_id_fields = ('user', 'company')
    readonly_fields = (
        'professional_summary', 'tailored_bullets', 'tailored_skills',
        'cover_letter', 'nafta_letter',
        'overall_match', 'technical_match', 'nafta_tn_likelihood',
        'created', 'modified',
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_application(obj.user_id, obj.pk)

    def delete_model(self, request, obj):
        _invalidate_application(obj.user_id, obj.pk)
        super().delete_model(request, obj)
