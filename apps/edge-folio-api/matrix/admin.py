from django.contrib import admin

from .models import BulletPoint, Skill


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ('name', 'proficiency', 'user', 'created')
    list_filter = ('proficiency',)
    search_fields = ('name', 'user__email')
    raw_id_fields = ('user',)


@admin.register(BulletPoint)
class BulletPointAdmin(admin.ModelAdmin):
    list_display = ('text_preview', 'category', 'source', 'is_approved', 'order', 'user', 'created')
    list_filter = ('category', 'source', 'is_approved')
    search_fields = ('text', 'user__email')
    raw_id_fields = ('user',)
    filter_horizontal = ('skills',)

    @admin.display(description='Text')
    def text_preview(self, obj):
        return obj.text[:60] + ('…' if len(obj.text) > 60 else '')
