from django.contrib import admin

from .models import Education, WorkExperience
from .views import _invalidate_education, _invalidate_work_experience


@admin.register(WorkExperience)
class WorkExperienceAdmin(admin.ModelAdmin):
    list_display = ['user', 'company', 'title', 'employment_type', 'start_date', 'end_date', 'is_current']
    list_filter = ['employment_type', 'is_current']
    search_fields = ['user__email', 'company', 'title']
    readonly_fields = ['created', 'modified']
    fields = [
        'user', 'company', 'title', 'employment_type', 'location',
        'start_date', 'end_date', 'is_current', 'description',
        'enabled', 'created', 'modified',
    ]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_work_experience(obj.user_id, obj.pk)

    def delete_model(self, request, obj):
        _invalidate_work_experience(obj.user_id, obj.pk)
        super().delete_model(request, obj)


@admin.register(Education)
class EducationAdmin(admin.ModelAdmin):
    list_display = ['user', 'institution', 'degree', 'field_of_study', 'start_year', 'end_year', 'is_current']
    list_filter = ['degree', 'is_current']
    search_fields = ['user__email', 'institution', 'field_of_study']
    readonly_fields = ['created', 'modified']
    fields = [
        'user', 'institution', 'degree', 'field_of_study',
        'start_year', 'end_year', 'is_current', 'gpa', 'honors',
        'description', 'enabled', 'created', 'modified',
    ]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_education(obj.user_id, obj.pk)

    def delete_model(self, request, obj):
        _invalidate_education(obj.user_id, obj.pk)
        super().delete_model(request, obj)
