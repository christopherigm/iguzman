from django.contrib import admin
from django.core.cache import cache

from .cache import invalidate_pattern as _invalidate_pattern
from .models import (
    Branch,
    Brand,
    CompanyHighlight,
    CompanyHighlightItem,
    ContactMessage,
    SiteBackup,
    SocialPost,
    SuccessStory,
    SuccessStoryImage,
    System,
)


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


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "system", "is_main", "phone", "enabled", "modified")
    list_filter = ("enabled", "is_main", "system")
    search_fields = ("name", "en_name", "address", "phone")
    readonly_fields = ("created", "modified", "version")
    fieldsets = (
        ("Identity", {
            "fields": ("system", "is_main", "enabled", "sort_order", "version", "created", "modified"),
        }),
        ("Name", {
            "fields": ("name", "en_name"),
        }),
        ("Contact", {
            "fields": ("address", "phone", "whatsapp", "email"),
        }),
        ("Coordinates", {
            "fields": ("latitude", "longitude"),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f"core:branch:{obj.pk}")
        _invalidate_pattern("core:branches:*")

    def delete_model(self, request, obj):
        cache.delete(f"core:branch:{obj.pk}")
        _invalidate_pattern("core:branches:*")
        super().delete_model(request, obj)


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "system", "related_name", "is_read", "replied_at", "created")
    list_filter = ("is_read", "system", "related_kind")
    search_fields = ("name", "email", "subject", "message", "related_name")
    # The message is a customer record, not editable content; everything is
    # read-only except the read flag the inbox toggles. The reply is sent from the
    # CMS inbox (never composed here), so its fields are read-only too.
    readonly_fields = (
        "system", "user", "name", "email", "subject", "message",
        "related_kind", "related_id", "related_name",
        "reply_subject", "reply_body", "replied_at", "replied_by",
        "created", "modified", "version",
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_pattern("core:contact_messages:*")

    def delete_model(self, request, obj):
        _invalidate_pattern("core:contact_messages:*")
        super().delete_model(request, obj)


@admin.register(SocialPost)
class SocialPostAdmin(admin.ModelAdmin):
    list_display = ("name", "system", "related_kind", "related_id", "template_id", "format", "sort_order", "enabled", "modified")
    list_filter = ("enabled", "system", "related_kind", "format")
    search_fields = ("name", "prompt", "caption")
    readonly_fields = ("created", "modified", "version")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_pattern("core:social_posts:*")

    def delete_model(self, request, obj):
        _invalidate_pattern("core:social_posts:*")
        super().delete_model(request, obj)


@admin.register(System)
class SystemAdmin(admin.ModelAdmin):
    list_display = ("site_name", "host", "primary_color", "secondary_color", "enabled", "stripe_configured", "modified")
    list_filter = ("enabled", "stripe_enabled")
    search_fields = ("site_name", "host")
    readonly_fields = ("created", "modified", "version", "stripe_configured", "storage_configured")
    # Encrypted secrets are never editable or viewable here - the ciphertext
    # columns are excluded outright, and the plaintext only ever enters through
    # the CMS's write-only serializer fields. Same stance as cinelog-api's
    # S3BucketAdmin.
    exclude = (
        "stripe_secret_key_encrypted",
        "stripe_webhook_secret_encrypted",
        "storage_secret_access_key_encrypted",
    )

    fieldsets = (
        ("Identity", {
            "fields": ("site_name", "host", "enabled", "version", "created", "modified"),
        }),
        ("Site Description", {
            "fields": ("site_description", "en_site_description"),
        }),
        ("Contact", {
            "fields": ("contact_email", "social_links"),
            "description": (
                "Site-wide contact details for the contact page. 'Social links' is "
                'an ordered JSON list, e.g. [{"platform": "instagram", "url": '
                '"https://instagram.com/acme"}]. Physical locations are managed as '
                "Branches."
            ),
        }),
        ("Branding", {
            "fields": (
                "primary_color", "secondary_color",
                "img_logo", "img_logo_hero", "img_favicon", "img_brandmark",
                "img_manifest_1080", "img_manifest_512", "img_manifest_256", "img_manifest_192", "img_manifest_128",
            ),
        }),
        ("Media", {
            "fields": ("video_link", "slogan", "img_hero", "img_about"),
        }),
        ("Company Highlights Section", {
            "fields": (
                "highlights_bg",
                "highlights_top_divider", "highlights_bottom_divider",
                "highlights_title", "en_highlights_title",
                "highlights_subtitle", "en_highlights_subtitle",
            ),
            "description": (
                "The background band behind the Company Highlights, and the shape "
                "cut as a transparent notch out of its top and bottom edges so the "
                "page shows through. Normally set from the site's CMS, which "
                "previews the result live."
            ),
        }),
        ("Catalog Items Section", {
            "fields": (
                "catalog_items_bg",
                "catalog_top_divider", "catalog_bottom_divider",
            ),
        }),
        ("Spotlight Section", {
            "fields": (
                "spotlight_enabled",
                "spotlight_label", "en_spotlight_label",
                "spotlight_title", "en_spotlight_title",
                "spotlight_text", "en_spotlight_text",
                "spotlight_button_label", "en_spotlight_button_label",
                "spotlight_button_link", "spotlight_items",
            ),
            "description": (
                "A promo panel paired with up to three hand-picked catalog items, "
                "rendered by the Spotlight block on the landing. 'Items' is an "
                'ordered JSON list of refs, e.g. [{"kind": "product", "id": 12}].'
            ),
        }),
        ("Hero Video", {
            "fields": (
                "hero_video_layout",
                "hero_logo_background",
                "hero_logo_background_scale",
                "hero_logo_scale",
                "hero_overlay_style",
                "hero_overlay_opacity",
                "hero_overlay_extent",
                "hero_bottom_divider",
                "hero_bottom_divider_elevation",
                "hero_text_frame",
            ),
            "description": (
                "How the logo and text are composed over the hero video, on the "
                "landing page and on item detail pages that have one. The logo "
                "background shape (and its size) apply in either layout; 'None' "
                "draws the logo with no backing shape, and 'Logo silhouette' "
                "clips the backing to the logo's own shape (needs a transparent "
                "logo). The overlay is the dark layer between the background "
                "and the text; its style picks the shape and the opacity its "
                "strength (0 draws none)."
            ),
        }),
        ("Watermark & Background", {
            "fields": (
                "watermark_enabled", "watermark_rotation", "watermark_intercalated",
                "watermark_show_logo", "watermark_show_brandmark",
                "watermark_size", "watermark_spacing", "watermark_opacity",
                "background_light", "background_dark",
            ),
            "description": (
                "The site's logo tiled faintly behind every public page, and the "
                "page background it sits on. Normally set from the site's CMS, "
                "which previews the result live."
            ),
            "classes": ("collapse",),
        }),
        ("Typography", {
            "fields": ("google_font_url", "font_display", "font_body"),
            "description": (
                "The site's typefaces, loaded from Google Fonts. One stylesheet URL "
                "can carry both families (css2?family=A&family=B); the two name "
                "fields say which is used for headings and which for body text. "
                "Leave all three blank to keep the platform default font."
            ),
            "classes": ("collapse",),
        }),
        ("Payments (Stripe)", {
            "fields": ("stripe_enabled", "stripe_publishable_key", "stripe_configured"),
            "description": (
                "This site's own Stripe account. The secret key and webhook signing "
                "secret are set from the site's CMS and are encrypted at rest - they "
                "cannot be read back here or anywhere else. 'Stripe configured' shows "
                "whether both are present; checkout stays off until they are. The "
                "site's own webhook endpoint - the one it pastes into its Stripe "
                "dashboard - is shown to it in the CMS."
            ),
            "classes": ("collapse",),
        }),
        ("Storage (Cloudflare R2)", {
            "fields": (
                "storage_enabled", "storage_account_id", "storage_access_key_id",
                "storage_bucket_name", "storage_public_domain", "storage_configured",
            ),
            "description": (
                "This site's own Cloudflare R2 bucket, for sites on their own "
                "domain that want to host their images and backups themselves. "
                "The secret access key is set from the site's CMS and is "
                "encrypted at rest - it cannot be read back here or anywhere "
                "else. 'Storage configured' shows whether all of it is present; "
                "until it is, this site's uploads go to the platform bucket. "
                "Switching it on does not move files that already exist - only "
                "future uploads land in this bucket, and the existing files keep "
                "serving from the platform's."
            ),
            "classes": ("collapse",),
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


@admin.register(SiteBackup)
class SiteBackupAdmin(admin.ModelAdmin):
    """Restore points, read-mostly.

    Everything here except the label is written by `core.backup` when the archive
    is built, so the whole manifest side is read-only: editing `sections` or
    `record_counts` by hand would make the history lie about what a zip contains
    without changing the zip. Adding a row here is disallowed for the same reason
    - a SiteBackup with no archive behind it is not a restore point. Deleting one
    IS allowed, and the `post_delete` receiver in `core/signals.py` takes the file
    with it.
    """

    list_display = ("name", "system", "size_bytes", "media_files", "created_by", "created")
    list_filter = ("system", "include_images")
    search_fields = ("name",)
    readonly_fields = (
        "system", "file", "sections", "include_images",
        "size_bytes", "media_files", "record_counts",
        "created_by", "created", "modified", "version",
    )

    def has_add_permission(self, request):
        return False
