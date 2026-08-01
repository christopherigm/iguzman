"""The journal half of the CMS - where an outing is typed up.

As in ``catalog/admin.py``: this is the authoring surface (the frontend has no
admin of its own), and cache invalidation is handled by ``signals.py`` rather
than by ``save_model``/``delete_model`` overrides.
"""

from django.contrib import admin
from django.utils.html import format_html

from catalog.admin import CONTENT_FIELDS, TRANSLATION_HELP

from .models import Sighting, SightingMedia


class SightingMediaInline(admin.TabularInline):
    model = SightingMedia
    extra = 0
    fields = ('kind', 'image', 'file', 'url', 'poster', 'name', 'en_name',
              'duration_seconds', 'sort_order', 'enabled')
    # A gallery is arranged by hand; newest-first would fight the sort_order the
    # author is setting.
    ordering = ('sort_order', 'id')


@admin.register(Sighting)
class SightingAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'thumb', 'date', 'location', 'season', 'weather', 'media_count', 'is_featured', 'enabled')
    list_filter = ('enabled', 'is_featured', 'season', 'weather', 'species__category__kind', 'location')
    search_fields = ('name', 'en_name', 'slug', 'description', 'en_description',
                     'species__name', 'species__en_name', 'species__scientific_name')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('species', 'location')
    date_hierarchy = 'date'
    inlines = [SightingMediaInline]

    fieldsets = (
        ('Subject', {
            'fields': ('species', 'name', 'en_name', 'slug'),
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
        ('Story', {'fields': CONTENT_FIELDS + ('href',), 'description': TRANSLATION_HELP}),
        # No `image` field: an entry has no cover column - its cover is the first
        # photo in the Media inline below (see `journal.0009_drop_main_image`).
        # What is left here is how that cover is *displayed*, not which one it is.
        ('Cover display', {'fields': ('fit', 'background_color')}),
        ('Display', {'fields': ('is_featured', 'enabled')}),
        ('Metadata', {'fields': ('version', 'created', 'modified'), 'classes': ('collapse',)}),
    )

    @admin.display(description='')
    def thumb(self, obj):
        """The entry's cover, resolved the way the API resolves it.

        `journal.serializers.sighting_cover_url` in miniature: the first *photo*
        among the media rows, skipping the clips, which have no frame to borrow.
        Reading a column here (as this did before `0009_drop_main_image`) would
        now be an AttributeError; reading `media.first()` would show a video row's
        empty image for an entry whose clip sorts ahead of its photographs.
        """
        photo = obj.media.filter(kind='image').exclude(image='').first()
        if not photo:
            return '-'
        return format_html(
            '<img src="{}" style="height:48px;width:48px;object-fit:cover;border-radius:4px" />',
            photo.image.url,
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
    search_fields = ('name', 'en_name', 'description', 'en_description',
                     'sighting__slug', 'sighting__species__name')
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('sighting',)
