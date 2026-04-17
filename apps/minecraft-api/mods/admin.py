from django.contrib import admin
from django.core.cache import cache

from .models import Mod


def _invalidate_pattern(pattern):
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass


@admin.register(Mod)
class ModAdmin(admin.ModelAdmin):
    list_display = ('mod_name', 'mod_id', 'user', 'status', 'llm_model', 'created')
    list_filter = ('status', 'llm_model', 'created')
    search_fields = ('mod_id', 'mod_name', 'prompt', 'user__email')
    readonly_fields = (
        'mod_id', 'mod_name', 'description', 'main_class',
        'generated_sources', 'status', 'build_log', 'error',
        'fabric_jar', 'neoforge_jar',
        'created', 'modified', 'version',
    )
    fieldsets = (
        ('Input', {'fields': ('user', 'prompt', 'llm_model')}),
        ('Generated', {'fields': ('mod_id', 'mod_name', 'description', 'main_class', 'generated_sources')}),
        ('Build', {'fields': ('status', 'build_log', 'error')}),
        ('Artifacts', {'fields': ('fabric_jar', 'neoforge_jar')}),
        ('Meta', {'fields': ('enabled', 'created', 'modified', 'version')}),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"mods:mod:{obj.pk}")

    def delete_model(self, request, obj):
        cache.delete(f"mods:mod:{obj.pk}")
        _invalidate_pattern("mods:mod:*")
        super().delete_model(request, obj)
