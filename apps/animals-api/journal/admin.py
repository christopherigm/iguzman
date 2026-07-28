"""The journal half of the CMS - where an outing is typed up.

As in ``catalog/admin.py``: this is the authoring surface (the frontend has no
admin of its own), and cache invalidation is handled by ``signals.py`` rather
than by ``save_model``/``delete_model`` overrides.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import Sighting, SightingMedia


class SightingMediaInline(admin.TabularInline):
    model = SightingMedia
    extra = 0
    fields = ('kind', 'image', 'file', 'url', 'poster', 'name', 'duration_seconds', 'sort_order', 'enabled')
    # A gallery is arranged by hand; newest-first would fight the sort_order the
    # author is setting.
    ordering = ('sort_order', 'id')


@admin.register(Sighting)
class SightingAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'thumb', 'date', 'location', 'season', 'weather', 'media_count', 'is_featured', 'enabled')
    list_filter = ('enabled', 'is_featured', 'season', 'weather', 'species__category__kind', 'location')
    search_fields = ('name', 'slug', 'description', 'species__name', 'species__scientific_name')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('species', 'location')
    date_hierarchy = 'date'
    inlines = [SightingMediaInline]

    fieldsets = (
        ('Subject', {
            'fields': ('species', 'name', 'slug'),
            'description': 'The title is optional - left blank, the site shows the species name.',
        }),
        ('When', {
            'fields': ('date', 'time', 'season'),
            'description': 'Leave the season blank and it is filled from the date '
                           '(using each season\'s months).',
        }),
        ('Where', {
            'fields': ('location', 'latitude', 'longitude'),
            'description': 'Coordinates are the exact spot. Left blank, the API falls '
                           'back to the location\'s own coordinates.',
        }),
        ('Conditions', {'fields': ('weather', 'temperature_c', 'individuals')}),
        ('Story', {'fields': ('short_description', 'description', 'href')}),
        ('Cover image', {'fields': ('image', 'fit', 'background_color')}),
        ('Display', {'fields': ('is_featured', 'enabled')}),
        ('Metadata', {'fields': ('version', 'created', 'modified'), 'classes': ('collapse',)}),
    )

    @admin.display(description='')
    def thumb(self, obj):
        if not obj.image:
            return '-'
        return format_html(
            '<img src="{}" style="height:48px;width:48px;object-fit:cover;border-radius:4px" />',
            obj.image.url,
        )

    @admin.display(description='Media')
    def media_count(self, obj):
        return obj.media.count()


@admin.register(SightingMedia)
class SightingMediaAdmin(admin.ModelAdmin):
    """Registered on its own as well as inline, so a large gallery can be
    searched and re-ordered without loading its whole sighting form."""

    list_display = ('__str__', 'sighting', 'kind', 'sort_order', 'enabled')
    list_filter = ('kind', 'enabled')
    search_fields = ('name', 'description', 'sighting__slug', 'sighting__species__name')
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('sighting',)
