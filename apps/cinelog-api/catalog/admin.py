from django.contrib import admin

from .models import (
    Actor,
    AudioFormat,
    Barcode,
    Category,
    Format,
    HdrFormat,
    Movie,
    MovieOwnership,
    ScanCandidate,
    ScanQueue,
    SpokenLanguage,
    SubtitleLanguage,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name']


@admin.register(Actor)
class ActorAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']


@admin.register(Format)
class FormatAdmin(admin.ModelAdmin):
    list_display = ['code', 'label']


@admin.register(AudioFormat)
class AudioFormatAdmin(admin.ModelAdmin):
    list_display = ['code', 'label']


@admin.register(HdrFormat)
class HdrFormatAdmin(admin.ModelAdmin):
    list_display = ['code', 'label']


@admin.register(SpokenLanguage)
class SpokenLanguageAdmin(admin.ModelAdmin):
    list_display = ['code', 'name']
    search_fields = ['code', 'name']


@admin.register(SubtitleLanguage)
class SubtitleLanguageAdmin(admin.ModelAdmin):
    list_display = ['code', 'name']
    search_fields = ['code', 'name']


class BarcodeInline(admin.TabularInline):
    model = Barcode
    extra = 0
    fields = ['code', 'format']


class MovieOwnershipInline(admin.TabularInline):
    model = MovieOwnership
    extra = 0
    fields = ['user', 'barcode', 'created']
    readonly_fields = ['created']
    autocomplete_fields = ['user']


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ['title', 'director', 'year', 'created']
    list_filter = ['formats', 'genres', 'audio_formats', 'hdr_formats']
    search_fields = ['title', 'director', 'barcodes__code', 'tmdb_id']
    filter_horizontal = [
        'formats', 'genres', 'cast',
        'audio_formats', 'hdr_formats', 'spoken_languages', 'subtitle_languages',
    ]
    readonly_fields = ['created', 'modified']
    inlines = [BarcodeInline, MovieOwnershipInline]


@admin.register(Barcode)
class BarcodeAdmin(admin.ModelAdmin):
    list_display = ['code', 'movie', 'format']
    search_fields = ['code', 'movie__title']
    autocomplete_fields = ['movie']


class ScanCandidateInline(admin.TabularInline):
    model = ScanCandidate
    extra = 0
    fields = ['sort_order', 'title', 'year', 'tmdb_id', 'cover_url']
    ordering = ['sort_order']


@admin.register(ScanQueue)
class ScanQueueAdmin(admin.ModelAdmin):
    list_display = ['barcode', 'status', 'scanned_by', 'extracted_title', 'retry_count', 'created']
    list_filter = ['status']
    search_fields = ['barcode', 'extracted_title']
    readonly_fields = ['created', 'modified']
    inlines = [ScanCandidateInline]
