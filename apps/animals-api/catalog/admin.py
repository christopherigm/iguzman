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

from .models import (
    Category,
    CategoryImage,
    County,
    Location,
    LocationImage,
    Season,
    SeasonImage,
    Species,
    SpeciesImage,
    State,
    WeatherCondition,
    WeatherConditionImage,
)


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


def _cover(obj):
    """The record's cover file - its own ``image``, else its first gallery photo.

    The list columns have to resolve it the same way the API does
    (``core.serializers.gallery_image_url``), or every row authored through the
    CMS - which uploads into the gallery and never writes ``image`` - would show
    an empty thumbnail here while the public site shows a photo.
    """
    image = getattr(obj, 'image', None)
    if image:
        return image
    first = next((row for row in obj.images.all() if row.image), None)
    return first.image if first else None


def _thumb(image, size=48):
    if not image:
        return '-'
    return format_html(
        '<img src="{}" style="height:{}px;width:{}px;object-fit:cover;border-radius:4px" />',
        image.url, size, size,
    )


# Every record's photographs live in a gallery table with the same columns, so
# one inline base covers all five. ⚠ `sort_order` is not cosmetic here: the API
# publishes the record's `image` as its own column if set and **otherwise the
# first gallery row**, so re-ordering these picks the cover for a record with no
# image of its own - which is every record authored through the CMS.
class GalleryImageInline(admin.TabularInline):
    extra = 0
    fields = ('image', 'name', 'en_name', 'description', 'en_description', 'sort_order', 'enabled')


class CategoryImageInline(GalleryImageInline):
    model = CategoryImage


class SpeciesImageInline(GalleryImageInline):
    model = SpeciesImage


class SeasonImageInline(GalleryImageInline):
    model = SeasonImage


class WeatherConditionImageInline(GalleryImageInline):
    model = WeatherConditionImage


class LocationImageInline(GalleryImageInline):
    model = LocationImage


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'thumb', 'kind', 'slug', 'species_count', 'is_featured', 'enabled', 'modified')
    list_filter = ('kind', 'enabled', 'is_featured')
    search_fields = ('name', 'en_name', 'slug', 'scientific_name')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    list_editable = ('is_featured',)
    ordering = ('kind', 'sort_order', 'name')
    inlines = [CategoryImageInline]

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

    @admin.display(description='')
    def thumb(self, obj):
        return _thumb(_cover(obj))

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
        return _thumb(_cover(obj))

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
    inlines = [SeasonImageInline]

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
        return _thumb(_cover(obj))


@admin.register(WeatherCondition)
class WeatherConditionAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'thumb', 'sort_order', 'enabled')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [WeatherConditionImageInline]

    fieldsets = (
        ('Identity', {'fields': ('name', 'en_name', 'slug')}),
        ('Content', {'fields': CONTENT_FIELDS + ('href',), 'description': TRANSLATION_HELP}),
        ('Media', {'fields': ('image', 'icon', 'fit', 'background_color')}),
        ('Display', {'fields': ('sort_order', 'enabled')}),
        ('Metadata', {'fields': ('version', 'created', 'modified'), 'classes': ('collapse',)}),
    )

    @admin.display(description='')
    def thumb(self, obj):
        return _thumb(_cover(obj))


@admin.register(State)
class StateAdmin(admin.ModelAdmin):
    """A lookup table, so a plain form - no fieldsets, no media, no content tab."""

    list_display = ('name', 'en_name', 'slug', 'county_count', 'sort_order', 'enabled')
    search_fields = ('name', 'en_name', 'slug')
    list_filter = ('enabled',)
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    fields = ('name', 'en_name', 'slug', 'sort_order', 'enabled', 'version', 'created', 'modified')

    @admin.display(description='Counties')
    def county_count(self, obj):
        return obj.counties.count()


@admin.register(County)
class CountyAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'state', 'slug', 'location_count', 'sort_order', 'enabled')
    search_fields = ('name', 'en_name', 'slug', 'state__name')
    list_filter = ('state', 'enabled')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    # `state` is required and PROTECT: deleting one still in use is refused
    # rather than orphaning the counties filed under it.
    autocomplete_fields = ('state',)
    fields = ('name', 'en_name', 'slug', 'state', 'sort_order', 'enabled',
              'version', 'created', 'modified')

    @admin.display(description='Locations')
    def location_count(self, obj):
        return obj.locations.count()


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'en_name', 'thumb', 'place_type', 'parent', 'county', 'state', 'sighting_count', 'hide_precise_location', 'enabled')
    list_filter = ('place_type', 'county__state', 'county', 'enabled', 'is_featured', 'hide_precise_location')
    search_fields = ('name', 'en_name', 'slug', 'county__name', 'county__state__name')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    autocomplete_fields = ('parent', 'county')
    inlines = [LocationImageInline]

    fieldsets = (
        ('Identity', {
            'fields': ('name', 'en_name', 'slug', 'parent', 'place_type'),
            'description': 'Most place names are proper nouns that do not translate - leave '
                           '"En name" blank for those and every locale shows the one name. '
                           'Fill it only where a real English form exists ("Bosque de '
                           'Chapultepec" / "Chapultepec Forest").',
        }),
        ('Content', {'fields': CONTENT_FIELDS, 'description': TRANSLATION_HELP}),
        # A place has no `image` column - its photographs are the inline below,
        # and the first of them is its cover. This is only the map-pin glyph.
        ('Media', {'fields': ('icon',)}),
        ('Geography', {
            'fields': ('latitude', 'longitude', 'county'),
            'description': 'The state is not stored here - it is read from the county, so '
                           'the two can never disagree. A place whose county is unknown '
                           'carries no state either. There is no map-link field: the '
                           'coordinates above are what every map on the site is drawn from.',
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

    @admin.display(description='')
    def thumb(self, obj):
        return _thumb(_cover(obj))

    @admin.display(description='Sightings')
    def sighting_count(self, obj):
        return obj.sightings.count()
