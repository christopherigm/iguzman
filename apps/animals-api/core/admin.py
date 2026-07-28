"""Django admin for the site-wide models.

The CMS in ``apps/animals`` is where these are normally edited - this exists so
an operator can reach them without the frontend, and to make the settings row
visible at all (nothing else in Django would show that it exists).
"""

from django.contrib import admin

from .models import SiteBackup, System


@admin.register(System)
class SystemAdmin(admin.ModelAdmin):
    list_display = ('site_name', 'contact_email', 'enabled', 'modified')

    fieldsets = (
        ('Identity', {
            'fields': ('site_name', 'site_description', 'en_site_description', 'enabled'),
        }),
        ('Contact', {
            'fields': ('contact_email', 'social_links'),
        }),
        ('Brand images', {
            'fields': (
                'img_logo', 'img_logo_hero', 'img_favicon', 'img_brandmark',
                'img_about', 'img_hero',
            ),
        }),
        ('Manifest icons', {
            'classes': ('collapse',),
            'description': 'Normally generated from the logo in the CMS rather than uploaded by hand.',
            'fields': (
                'img_manifest_1080', 'img_manifest_512', 'img_manifest_256',
                'img_manifest_192', 'img_manifest_128',
            ),
        }),
        ('Palette & typography', {
            'fields': (
                'primary_color', 'secondary_color',
                'google_font_url', 'font_display', 'font_body',
                'hero_text_frame',
            ),
        }),
        ('Watermark & background', {
            'fields': (
                'watermark_enabled', 'watermark_show_logo', 'watermark_show_brandmark',
                'watermark_rotation', 'watermark_intercalated',
                'watermark_size', 'watermark_spacing', 'watermark_opacity',
                'background_light', 'background_dark',
            ),
        }),
    )

    def has_add_permission(self, request):
        # Exactly one row exists, created on demand by `System.load()`. A second
        # would be invisible to every reader and silently ignored.
        return not System.objects.exists()

    def has_delete_permission(self, request, obj=None):
        # Deleting it would take the site's name, palette and logo with it.
        return False


@admin.register(SiteBackup)
class SiteBackupAdmin(admin.ModelAdmin):
    list_display = ('name', 'created', 'size_bytes', 'total_records', 'media_files', 'created_by')
    list_filter = ('created',)
    readonly_fields = ('sections', 'size_bytes', 'total_records', 'media_files', 'created', 'created_by')

    def has_add_permission(self, request):
        # A backup is *built* (core/backup.py), never typed in - an empty row
        # here would be a restore point with no archive behind it.
        return False
