from django.contrib import admin
from django.core.cache import cache

from .models import BulletPoint, Skill


def _invalidate_skill(user_id, pk=None):
    cache.delete(f'matrix:skills:{user_id}')
    cache.delete(f'matrix:bullets:{user_id}')
    if pk is not None:
        cache.delete(f'matrix:skill:{user_id}:{pk}')


def _invalidate_bullet(user_id, pk=None):
    cache.delete(f'matrix:bullets:{user_id}')
    if pk is not None:
        cache.delete(f'matrix:bullet:{user_id}:{pk}')


@admin.register(Skill)
class SkillAdmin(admin.ModelAdmin):
    list_display = ('name', 'proficiency', 'user', 'created')
    list_filter = ('proficiency',)
    search_fields = ('name', 'user__email')
    raw_id_fields = ('user',)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_skill(obj.user_id, obj.pk)

    def delete_model(self, request, obj):
        _invalidate_skill(obj.user_id, obj.pk)
        super().delete_model(request, obj)


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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_bullet(obj.user_id, obj.pk)

    def delete_model(self, request, obj):
        _invalidate_bullet(obj.user_id, obj.pk)
        super().delete_model(request, obj)
