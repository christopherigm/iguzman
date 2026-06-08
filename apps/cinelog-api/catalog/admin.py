from django.contrib import admin

from .models import Actor, Category, Movie, ScanQueue


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug']
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ['name']


@admin.register(Actor)
class ActorAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ['title', 'director', 'year', 'format', 'barcode', 'created']
    list_filter = ['format', 'genres']
    search_fields = ['title', 'director', 'barcode', 'tmdb_id']
    filter_horizontal = ['genres', 'cast']
    readonly_fields = ['created', 'modified']


@admin.register(ScanQueue)
class ScanQueueAdmin(admin.ModelAdmin):
    list_display = ['barcode', 'status', 'extracted_title', 'retry_count', 'created']
    list_filter = ['status']
    search_fields = ['barcode', 'extracted_title']
    readonly_fields = ['created', 'modified']
