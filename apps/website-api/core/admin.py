from django.contrib import admin
from django.core.cache import cache

from .models import Brand, System


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "enabled", "modified")
    list_filter = ("enabled",)
    search_fields = ("name",)
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ("created", "modified", "version")


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
        ("Branding", {
            "fields": (
                "primary_color", "secondary_color",
                "img_logo", "img_logo_hero", "img_favicon",
                "img_manifest_1080", "img_manifest_512", "img_manifest_256", "img_manifest_128",
            ),
        }),
        ("Media", {
            "fields": ("video_link", "img_about"),
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
