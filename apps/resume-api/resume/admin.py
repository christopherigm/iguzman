from django.contrib import admin
from resume.models import (
  Company,
  School,
  Skill,
  SkillCategory,
  Theme,
  UserJob,
  UserProject,
  UserSchool,
  UserSkill,
  UserJobPromotion
)

# Register your models here.

class CompanyAdmin(admin.ModelAdmin):
    list_display = [
        'name',
    ]
    search_fields = ('name',)
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(Company, CompanyAdmin)

class SchoolAdmin(admin.ModelAdmin):
    list_display = [
        'name',
    ]
    search_fields = ('name',)
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(School, SchoolAdmin)

class SkillAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'category'
    ]
    search_fields = ('name',)
    list_filter = ('enabled', 'category')
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(Skill, SkillAdmin)

class SkillCategoryAdmin(admin.ModelAdmin):
    list_display = [
        'name',
    ]
    search_fields = ('name',)
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(SkillCategory, SkillCategoryAdmin)

class ThemeAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'primary_color'
    ]
    search_fields = ('name',)
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(Theme, ThemeAdmin)

class UserJobAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'company',
        'job_title',
        'currently_working_here',
        'start_date',
        'end_date'
    ]
    search_fields = ('user',)
    list_filter = ('user', 'currently_working_here' , 'company')
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(UserJob, UserJobAdmin)

class UserJobPromotionAdmin(admin.ModelAdmin):
    list_display = [
        'job_title',
        'start_date',
        'end_date'
    ]
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(UserJobPromotion, UserJobPromotionAdmin)

class UserProjectAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'company',
        'title',
        'active_project',
        'start_date',
        'end_date'
    ]
    search_fields = ('user',)
    list_filter = ('user', 'active_project' , 'company')
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(UserProject, UserProjectAdmin)

class UserSchoolAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'school',
        'degree',
        'field_of_study',
        'currently_studiying_here',
        'start_date',
        'end_date'
    ]
    search_fields = ('user',)
    list_filter = ('user', 'currently_studiying_here' , 'school', 'degree')
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(UserSchool, UserSchoolAdmin)

class UserSkillAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'skill',
        'percentage',
        'years_of_experience'
    ]
    search_fields = ('user',)
    list_filter = ('user', 'skill' , 'years_of_experience')
    readonly_fields=(
        'version',
        'order'
    )

admin.site.register(UserSkill, UserSkillAdmin)
