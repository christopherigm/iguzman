from django.contrib import admin
from django.core.cache import cache

from .models import Brand, CompanyHighlight, CompanyHighlightItem, SuccessStory, SuccessStoryImage, System


def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass


class CompanyHighlightItemInline(admin.TabularInline):
    model = CompanyHighlightItem
    extra = 0
    fields = ("name", "en_name", "description", "icon", "image", "href", "sort_order", "enabled")
    readonly_fields = ("created", "modified", "version")


@admin.register(CompanyHighlight)
class CompanyHighlightAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "system", "category", "sort_order", "enabled", "modified")
    list_filter = ("enabled", "system")
    search_fields = ("name", "en_name", "category")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created", "modified", "version")
    inlines = [CompanyHighlightItemInline]
    fieldsets = (
        ("Identity", {
            "fields": ("system", "enabled", "size", "slug", "sort_order", "version", "created", "modified"),
        }),
        ("Category", {
            "fields": ("category", "en_category"),
        }),
        ("Content (ES)", {
            "fields": ("name", "short_description", "description"),
        }),
        ("Content (EN)", {
            "fields": ("en_name", "en_short_description", "en_description"),
        }),
        ("Media", {
            "fields": ("image", "icon", "fit", "background_color", "href"),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"core:highlight:{obj.pk}")
        cache.delete(f"core:highlight_items:{obj.pk}")
        _invalidate_pattern("core:highlight_item:*")
        _invalidate_pattern("core:highlights:*")

    def delete_model(self, request, obj):
        cache.delete(f"core:highlight:{obj.pk}")
        cache.delete(f"core:highlight_items:{obj.pk}")
        _invalidate_pattern("core:highlight_item:*")
        _invalidate_pattern("core:highlights:*")
        super().delete_model(request, obj)


class SuccessStoryImageInline(admin.TabularInline):
    model = SuccessStoryImage
    extra = 0
    fields = ("image", "name", "sort_order", "enabled")
    readonly_fields = ("created", "modified")


@admin.register(SuccessStory)
class SuccessStoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "system", "enabled", "modified")
    list_filter = ("enabled", "system")
    search_fields = ("name", "en_name", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created", "modified", "version")
    inlines = [SuccessStoryImageInline]
    fieldsets = (
        ("Identity", {
            "fields": ("system", "enabled", "slug", "version", "created", "modified"),
        }),
        ("Content (ES)", {
            "fields": ("name", "short_description", "description"),
        }),
        ("Content (EN)", {
            "fields": ("en_name", "en_short_description", "en_description"),
        }),
        ("Media", {
            "fields": ("image", "fit", "background_color", "href"),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"core:success_story:{obj.pk}")
        cache.delete(f"core:success_story_images:{obj.pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")

    def delete_model(self, request, obj):
        cache.delete(f"core:success_story:{obj.pk}")
        cache.delete(f"core:success_story_images:{obj.pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")
        super().delete_model(request, obj)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "system", "enabled", "modified")
    list_filter = ("enabled", "system")
    search_fields = ("name",)
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ("created", "modified", "version")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"core:brand:{obj.pk}")
        _invalidate_pattern("core:brands:*")

    def delete_model(self, request, obj):
        cache.delete(f"core:brand:{obj.pk}")
        _invalidate_pattern("core:brands:*")
        super().delete_model(request, obj)


@admin.register(System)
class SystemAdmin(admin.ModelAdmin):
    list_display = ("site_name", "host", "primary_color", "secondary_color", "enabled", "modified")
    list_filter = ("enabled",)
    search_fields = ("site_name", "host")
    readonly_fields = ("created", "modified", "version")

    fieldsets = (
        ("Identity", {
            "fields": ("site_name", "host", "enabled", "version", "created", "modified"),
        }),
        ("Site Description", {
            "fields": ("site_description", "en_site_description"),
        }),
        ("Branding", {
            "fields": (
                "primary_color", "secondary_color",
                "img_logo", "img_logo_hero", "img_favicon",
                "img_manifest_1080", "img_manifest_512", "img_manifest_256", "img_manifest_192", "img_manifest_128",
            ),
        }),
        ("Media", {
            "fields": ("video_link", "slogan", "img_hero", "img_about"),
        }),
        ("Company Highlights Section", {
            "fields": (
                "highlights_bg",
                "highlights_title", "en_highlights_title",
                "highlights_subtitle", "en_highlights_subtitle",
            ),
        }),
        ("Catalog Items Section", {
            "fields": ("catalog_items_bg",),
        }),
        ("Content (ES)", {
            "fields": ("about", "mission", "vision"),
            "classes": ("collapse",),
        }),
        ("Content (EN)", {
            "fields": ("en_about", "en_mission", "en_vision"),
            "classes": ("collapse",),
        }),
        ("Legal (ES)", {
            "fields": ("privacy_policy", "terms_and_conditions", "user_data"),
            "classes": ("collapse",),
        }),
        ("Legal (EN)", {
            "fields": ("en_privacy_policy", "en_terms_and_conditions", "en_user_data"),
            "classes": ("collapse",),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"system:host:{obj.host}")

    def delete_model(self, request, obj):
        cache.delete(f"system:host:{obj.host}")
        super().delete_model(request, obj)
