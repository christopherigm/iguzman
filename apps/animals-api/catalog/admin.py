"""The catalog half of the CMS.

The `animals` frontend has no admin UI of its own - it is a public journal - so
**the Django admin is where content is authored**. These classes are the
authoring surface, not a debugging convenience: fieldsets, prepopulated slugs
and inlines are all there to make a field entry quick to type up.

Cache invalidation is handled by the receivers in ``signals.py``, which fire on
``post_save``/``post_delete`` and therefore cover admin saves, single deletes and
bulk-action deletes alike - no ``save_model``/``delete_model`` overrides needed.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import Category, Location, Season, Species, SpeciesImage, WeatherCondition


# Every content form pairs each authored text field with its English twin, laid
# out one after the other so the author sees the two languages side by side while
# typing. The bare field is Spanish; see core.models.TRANSLATED_FIELDS.
#
# Repeated as a shared constant rather than typed into six fieldsets, so adding a
# translated field is one edit here instead of six that can silently disagree.
CONTENT_FIELDS = ('short_description', 'en_short_description', 'description', 'en_description')

# The help text that explains the pairing once, on the Content fieldset of every
# form. Authors will not read the model docstring.
TRANSLATION_HELP = (
    'The plain fields are Spanish; each "En " field is its English translation. '
    'Readers on /es get the Spanish; every other locale (en, de, fr, pt) gets the '
    'English, falling back to the Spanish when a translation is blank.'
)


def _thumb(image, size=48):
    if not image:
        return '-'
    return format_html(
        '<img src="{}" style="height:{}px;width:{}px;object-fit:cover;border-radius:4px" />',
        image.url, size, size,
    )


class SpeciesImageInline(admin.TabularInline):
    model = SpeciesImage
    extra = 0
    fields = ('image', 'name', 'en_name', 'description', 'en_description', 'sort_order', 'enabled')


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'kind', 'slug', 'species_count', 'is_featured', 'enabled', 'modified')
    list_filter = ('kind', 'enabled', 'is_featured')
    search_fields = ('name', 'en_name', 'slug', 'scientific_name')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    list_editable = ('is_featured',)
    ordering = ('kind', 'sort_order', 'name')

    fieldsets = (
        ('Identity', {
            'fields': ('kind', 'name', 'en_name', 'slug', 'scientific_name'),
        }),
        ('Content', {
            'fields': CONTENT_FIELDS + ('href',),
            'description': TRANSLATION_HELP,
        }),
        ('Media', {
            'fields': ('image', 'icon', 'fit', 'background_color'),
        }),
        ('Display', {
            'fields': ('is_featured', 'sort_order', 'enabled'),
        }),
        ('Metadata', {
            'fields': ('version', 'created', 'modified'),
            'classes': ('collapse',),
        }),
    )

    @admin.display(description='Species')
    def species_count(self, obj):
        return obj.species.count()


@admin.register(Species)
class SpeciesAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'thumb', 'category', 'branch', 'scientific_name', 'sighting_count', 'enabled')
    list_filter = ('category__kind', 'category', 'enabled', 'is_featured')
    search_fields = ('name', 'en_name', 'slug', 'scientific_name', 'family')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('category',)
    inlines = [SpeciesImageInline]

    fieldsets = (
        ('Identity', {
            'fields': ('category', 'name', 'en_name', 'slug'),
        }),
        ('Taxonomy', {
            # Deliberately untranslated: a scientific name and a family are Latin
            # binomials, identical in every locale.
            'fields': ('scientific_name', 'family'),
        }),
        ('Content', {
            'fields': CONTENT_FIELDS + ('href', 'video_link'),
            'description': TRANSLATION_HELP,
        }),
        ('Media', {
            'fields': ('image', 'icon', 'fit', 'background_color'),
        }),
        ('Display', {
            'fields': ('is_featured', 'sort_order', 'enabled'),
        }),
        ('Metadata', {
            'fields': ('version', 'created', 'modified'),
            'classes': ('collapse',),
        }),
    )

    @admin.display(description='')
    def thumb(self, obj):
        return _thumb(obj.image)

    @admin.display(description='Branch')
    def branch(self, obj):
        return obj.category.get_kind_display() if obj.category_id else '-'

    @admin.display(description='Sightings')
    def sighting_count(self, obj):
        return obj.sightings.count()


@admin.register(Season)
class SeasonAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'thumb', 'months', 'sort_order', 'enabled')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')

    fieldsets = (
        ('Identity', {
            'fields': ('name', 'en_name', 'slug', 'months'),
            'description': 'Months are the numbers this season covers, e.g. [9, 10, 11]. '
                           'A sighting with no season picked is filed by its date using these.',
        }),
        ('Content', {'fields': CONTENT_FIELDS + ('href',), 'description': TRANSLATION_HELP}),
        ('Media', {'fields': ('image', 'icon', 'fit', 'background_color')}),
        ('Display', {'fields': ('sort_order', 'enabled')}),
        ('Metadata', {'fields': ('version', 'created', 'modified'), 'classes': ('collapse',)}),
    )

    @admin.display(description='')
    def thumb(self, obj):
        return _thumb(obj.image)


@admin.register(WeatherCondition)
class WeatherConditionAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'thumb', 'sort_order', 'enabled')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')

    fieldsets = (
        ('Identity', {'fields': ('name', 'en_name', 'slug')}),
        ('Content', {'fields': CONTENT_FIELDS + ('href',), 'description': TRANSLATION_HELP}),
        ('Media', {'fields': ('image', 'icon', 'fit', 'background_color')}),
        ('Display', {'fields': ('sort_order', 'enabled')}),
        ('Metadata', {'fields': ('version', 'created', 'modified'), 'classes': ('collapse',)}),
    )

    @admin.display(description='')
    def thumb(self, obj):
        return _thumb(obj.image)


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'place_type', 'parent', 'region', 'country', 'sighting_count', 'hide_precise_location', 'enabled')
    list_filter = ('place_type', 'country', 'enabled', 'is_featured', 'hide_precise_location')
    search_fields = ('name', 'en_name', 'slug', 'region', 'country')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('parent',)

    fieldsets = (
        ('Identity', {
            'fields': ('name', 'en_name', 'slug', 'parent', 'place_type'),
            'description': 'Most place names are proper nouns that do not translate - leave '
                           '"En name" blank for those and every locale shows the one name. '
                           'Fill it only where a real English form exists ("Bosque de '
                           'Chapultepec" / "Chapultepec Forest").',
        }),
        ('Content', {'fields': CONTENT_FIELDS, 'description': TRANSLATION_HELP}),
        ('Geography', {
            'fields': ('latitude', 'longitude', 'region', 'country', 'map_link'),
        }),
        ('Privacy', {
            'fields': ('hide_precise_location',),
            'description': 'On: the API rounds this place\'s coordinates - and those of '
                           'every sighting filed here - to about a kilometre. Use it for '
                           'nesting sites and anything else that should not be findable.',
        }),
        ('Display', {'fields': ('is_featured', 'sort_order', 'enabled')}),
        ('Metadata', {'fields': ('version', 'created', 'modified'), 'classes': ('collapse',)}),
    )

    @admin.display(description='Sightings')
    def sighting_count(self, obj):
        return obj.sightings.count()
