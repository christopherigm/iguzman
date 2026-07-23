import base64
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from rest_framework import serializers

from . import image_sizes
from .image_sizes import REGULAR, SMALL, MEDIUM, STANDARD, image_cfg
from .models import (
    Branch,
    Brand,
    CompanyHighlight,
    CompanyHighlightItem,
    ContactMessage,
    SuccessStory,
    SuccessStoryImage,
    System,
    validate_google_font_url,
)


def validate_social_links(value):
    """Normalise a `social_links` value to a list of {"platform", "url"} dicts.

    Shared by the System write serializer (and available to anything else that
    stores the same shape). Enforces the shape only - the platform is free-form
    and lowercased, so a new network needs no code change. Raises
    ``serializers.ValidationError`` on a malformed blob.
    """
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("Must be a list of social links.")
    if len(value) > 20:
        raise serializers.ValidationError("At most twenty social links are allowed.")
    cleaned = []
    for entry in value:
        if not isinstance(entry, dict):
            raise serializers.ValidationError("Each link must be an object.")
        platform = entry.get("platform")
        url = entry.get("url")
        if not platform or not isinstance(platform, str):
            raise serializers.ValidationError("Each link needs a platform.")
        if not url or not isinstance(url, str):
            raise serializers.ValidationError("Each link needs a url.")
        cleaned.append({"platform": platform.strip().lower()[:32], "url": url.strip()[:512]})
    return cleaned


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

# Formats worth storing as uploaded. A PNG is usually a logo, screenshot or
# flat-color graphic, and re-encoding one as JPEG puts visible ringing around
# every hard edge; WEBP is already smaller than what we would replace it with.
# Anything else (HEIC, TIFF, BMP, GIF, …) becomes JPEG.
PRESERVED_FORMATS = {"PNG", "WEBP"}

_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


class ImageProcessingSerializer(serializers.Serializer):
    """
    Accepts a base64-encoded image and processes it.

    Parameters (set as class attributes or pass via __init__):
      max_size    (int, int) - thumbnail bounding box, default (512, 512).
                               Prefer core.image_sizes.image_cfg() over spelling
                               a size out here - see that module.
      quality     int        - quality 1-95, default 90
      force_format str       - Pillow format string ('JPEG', 'PNG', …). Default
                               None keeps PNG/WEBP uploads in their own format
                               and converts everything else to JPEG. Set it only
                               for fields that must always be one format.
    """

    max_size = image_sizes.box(image_sizes.MEDIUM)
    quality = 90
    force_format = None

    base64_image = serializers.CharField(write_only=True)

    def __init__(self, *args, max_size=None, quality=None, force_format=None, **kwargs):
        super().__init__(*args, **kwargs)
        if max_size is not None:
            self.max_size = max_size
        if quality is not None:
            self.quality = quality
        if force_format is not None:
            self.force_format = force_format

    def validate_base64_image(self, value):
        if "," in value:
            value = value.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(value)
        except Exception:
            raise serializers.ValidationError("Invalid base64 encoding.")
        try:
            img = Image.open(BytesIO(image_bytes))
            img.verify()
        except Exception:
            raise serializers.ValidationError("The provided file is not a valid image.")
        return value

    def _resolve_format(self, img):
        """The format to store in: the configured one, else the upload's own."""
        if self.force_format:
            return self.force_format.upper()
        fmt = (img.format or "JPEG").upper()
        return fmt if fmt in PRESERVED_FORMATS else "JPEG"

    def process_image(self):
        """Return (BytesIO, format) for the processed image."""
        raw = self.validated_data["base64_image"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        image_bytes = base64.b64decode(raw)

        img = Image.open(BytesIO(image_bytes))
        fmt = self._resolve_format(img)
        img = ImageOps.exif_transpose(img)

        if fmt == "JPEG" and img.mode not in ("RGB",):
            img = img.convert("RGB")
        elif fmt == "PNG" and img.mode not in ("RGBA", "RGB", "P"):
            img = img.convert("RGBA")

        img.thumbnail(self.max_size, Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format=fmt, quality=self.quality, optimize=True)
        output.seek(0)
        return output, fmt

    def save_to_field(self, image_field, filename):
        """
        Process the image and save it to a Django ImageField / FileField.

        The caller's extension is advisory: it is rewritten to match the format
        actually written, since that now depends on what was uploaded.

        Usage:
            serializer.save_to_field(instance.avatar, "avatar_42.jpg")
            instance.save(update_fields=["avatar"])
        """
        output, fmt = self.process_image()
        base = filename.rsplit(".", 1)[0]
        name = f"{base}.{_EXTENSIONS.get(fmt, 'jpg')}"
        image_field.save(name, ContentFile(output.read()), save=False)


# ---------------------------------------------------------------------------
# Success Story serializers
# ---------------------------------------------------------------------------

class SuccessStoryImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = SuccessStoryImage
        fields = [
            "id", "enabled", "created", "modified",
            "name", "en_name", "description", "en_description",
            "image", "fit", "background_color", "href",
            "sort_order",
        ]

    def get_image(self, obj):
        request = self.context.get("request")
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class SuccessStorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    images = SuccessStoryImageSerializer(many=True, read_only=True)

    class Meta:
        model = SuccessStory
        fields = [
            "id", "enabled", "created", "modified", "version",
            "system",
            "name", "en_name",
            "short_description", "en_short_description",
            "description", "en_description",
            "image", "fit", "background_color", "href",
            "slug", "sort_order",
            "images",
        ]

    def get_image(self, obj):
        request = self.context.get("request")
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


# SuccessStory.image is the story's hero (RegularPicture); its gallery children
# are StandardPicture. Two tiers, so two configs - they were one, which stored
# every hero at the gallery's 900 px.
_STORY_IMAGE_CFG = image_cfg(REGULAR)
_STORY_GALLERY_IMAGE_CFG = image_cfg(STANDARD)


class SuccessStoryWriteSerializer(serializers.Serializer):
    """Write serializer for SuccessStory - accepts base64 image, all fields optional (PATCH semantics)."""

    system      = serializers.PrimaryKeyRelatedField(queryset=System.objects.all(), required=False, allow_null=True)
    name        = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name     = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href        = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit         = serializers.CharField(max_length=16, required=False, allow_null=True, allow_blank=True)
    background_color = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    slug        = serializers.SlugField(max_length=255, required=False, allow_null=True, allow_blank=True)
    enabled     = serializers.BooleanField(required=False)
    # Manual display order, written by the admin list's drag-to-reorder mode.
    sort_order  = serializers.IntegerField(min_value=0, required=False)
    image       = serializers.CharField(required=False, allow_null=True, allow_blank=True)  # base64

    def validate_image(self, value):
        if value:
            sub = ImageProcessingSerializer(data={"base64_image": value}, **_STORY_IMAGE_CFG)
            if not sub.is_valid():
                raise serializers.ValidationError(sub.errors["base64_image"])
        return value

    def save(self, instance):
        scalar_fields = [
            "system", "name", "en_name",
            "short_description", "en_short_description",
            "description", "en_description",
            "href", "fit", "background_color", "slug", "enabled", "sort_order",
        ]
        update_fields = []
        for field_name in scalar_fields:
            if field_name in self.validated_data:
                setattr(instance, field_name, self.validated_data[field_name])
                update_fields.append(field_name)

        if "image" in self.validated_data:
            image_value = self.validated_data["image"]
            if image_value:
                proc = ImageProcessingSerializer(data={"base64_image": image_value}, **_STORY_IMAGE_CFG)
                proc.is_valid()
                proc.save_to_field(instance.image, f"story_{instance.pk}.jpg")
            else:
                instance.image = None
            update_fields.append("image")

        if update_fields:
            instance.save(update_fields=update_fields)

        return instance


class SuccessStoryImageWriteSerializer(serializers.Serializer):
    """Create a gallery image linked to a story - accepts base64 image."""

    image      = serializers.CharField()
    name       = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_image(self, value):
        sub = ImageProcessingSerializer(data={"base64_image": value}, **_STORY_GALLERY_IMAGE_CFG)
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors["base64_image"])
        return value

    def save(self, story):
        image_data = self.validated_data["image"]
        instance = SuccessStoryImage(
            story=story,
            name=self.validated_data.get("name"),
            sort_order=self.validated_data.get("sort_order", 0),
        )
        instance.save()
        proc = ImageProcessingSerializer(data={"base64_image": image_data}, **_STORY_GALLERY_IMAGE_CFG)
        proc.is_valid()
        proc.save_to_field(instance.image, f"storyimage_{instance.pk}.jpg")
        instance.save(update_fields=["image"])
        return instance


# ---------------------------------------------------------------------------
# Company Highlight serializers
# ---------------------------------------------------------------------------

_HIGHLIGHT_IMAGE_CFG = image_cfg(REGULAR)
_HIGHLIGHT_ITEM_IMAGE_CFG = image_cfg(SMALL)


class CompanyHighlightItemSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = CompanyHighlightItem
        fields = [
            "id", "enabled", "created", "modified",
            "name", "en_name", "description", "en_description",
            "image", "fit", "background_color", "href",
            "icon", "sort_order",
        ]

    def get_image(self, obj):
        request = self.context.get("request")
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class CompanyHighlightSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    items = CompanyHighlightItemSerializer(many=True, read_only=True)

    class Meta:
        model = CompanyHighlight
        fields = [
            "id", "enabled", "created", "modified", "version",
            "system",
            "category", "en_category",
            "name", "en_name",
            "short_description", "en_short_description",
            "description", "en_description",
            "image", "fit", "background_color", "href",
            "icon", "size", "slug", "sort_order",
            "items",
        ]

    def get_image(self, obj):
        request = self.context.get("request")
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class CompanyHighlightWriteSerializer(serializers.Serializer):
    """Write serializer for CompanyHighlight - all fields optional (PATCH semantics)."""

    system       = serializers.PrimaryKeyRelatedField(queryset=System.objects.all(), required=False, allow_null=True)
    category     = serializers.CharField(max_length=128, required=False, allow_null=True, allow_blank=True)
    en_category  = serializers.CharField(max_length=128, required=False, allow_null=True, allow_blank=True)
    name         = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name      = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    description  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href         = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit          = serializers.CharField(max_length=16, required=False, allow_null=True, allow_blank=True)
    background_color = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    icon         = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    size         = serializers.ChoiceField(choices=["sm", "md", "lg", "xl"], required=False)
    slug         = serializers.SlugField(max_length=255, required=False, allow_null=True, allow_blank=True)
    sort_order   = serializers.IntegerField(min_value=0, required=False)
    enabled      = serializers.BooleanField(required=False)
    image        = serializers.CharField(required=False, allow_null=True, allow_blank=True)  # base64

    def validate_image(self, value):
        if value:
            sub = ImageProcessingSerializer(data={"base64_image": value}, **_HIGHLIGHT_IMAGE_CFG)
            if not sub.is_valid():
                raise serializers.ValidationError(sub.errors["base64_image"])
        return value

    def save(self, instance):
        scalar_fields = [
            "system", "category", "en_category",
            "name", "en_name",
            "short_description", "en_short_description",
            "description", "en_description",
            "href", "fit", "background_color", "icon", "size", "slug", "sort_order", "enabled",
        ]
        update_fields = []
        for field_name in scalar_fields:
            if field_name in self.validated_data:
                setattr(instance, field_name, self.validated_data[field_name])
                update_fields.append(field_name)

        if "image" in self.validated_data:
            image_value = self.validated_data["image"]
            if image_value:
                proc = ImageProcessingSerializer(data={"base64_image": image_value}, **_HIGHLIGHT_IMAGE_CFG)
                proc.is_valid()
                proc.save_to_field(instance.image, f"highlight_{instance.pk}.jpg")
            else:
                instance.image = None
            update_fields.append("image")

        if update_fields:
            instance.save(update_fields=update_fields)

        return instance


class CompanyHighlightItemWriteSerializer(serializers.Serializer):
    """Write serializer for CompanyHighlightItem - all fields optional (PATCH semantics)."""

    name         = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name      = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href         = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit          = serializers.CharField(max_length=16, required=False, allow_null=True, allow_blank=True)
    background_color = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    icon         = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    sort_order   = serializers.IntegerField(min_value=0, required=False)
    enabled      = serializers.BooleanField(required=False)
    image        = serializers.CharField(required=False, allow_null=True, allow_blank=True)  # base64

    def validate_image(self, value):
        if value:
            sub = ImageProcessingSerializer(data={"base64_image": value}, **_HIGHLIGHT_ITEM_IMAGE_CFG)
            if not sub.is_valid():
                raise serializers.ValidationError(sub.errors["base64_image"])
        return value

    def save(self, instance):
        scalar_fields = [
            "name", "en_name", "description", "en_description",
            "href", "fit", "background_color", "icon", "sort_order", "enabled",
        ]
        update_fields = []
        for field_name in scalar_fields:
            if field_name in self.validated_data:
                setattr(instance, field_name, self.validated_data[field_name])
                update_fields.append(field_name)

        if "image" in self.validated_data:
            image_value = self.validated_data["image"]
            if image_value:
                proc = ImageProcessingSerializer(data={"base64_image": image_value}, **_HIGHLIGHT_ITEM_IMAGE_CFG)
                proc.is_valid()
                proc.save_to_field(instance.image, f"highlightitem_{instance.pk}.jpg")
            else:
                instance.image = None
            update_fields.append("image")

        if update_fields:
            instance.save(update_fields=update_fields)

        return instance


# ---------------------------------------------------------------------------
# System image field configuration
# ---------------------------------------------------------------------------

# Logos, the favicon and the manifest icons keep force_format="PNG": they are
# identity assets that must hold an alpha channel whatever the tenant uploads,
# and the manifest sizes are fixed by the PWA spec rather than by a tier. The
# two photographic fields take whatever was uploaded (PNG/WEBP kept, else JPEG) -
# forcing a photo to PNG at quality 95 only produced multi-megabyte files.
_IMAGE_FIELDS = {
    "img_logo":         {"max_size": image_sizes.box(MEDIUM), "quality": 95, "force_format": "PNG"},
    "img_logo_hero":    {"max_size": image_sizes.box(MEDIUM), "quality": 95, "force_format": "PNG"},
    "img_favicon":      {"max_size": (64, 64),                "quality": 80, "force_format": "PNG"},
    "img_manifest_1080":{"max_size": (1080, 1080),            "quality": 85, "force_format": "PNG"},
    "img_manifest_512": {"max_size": (512, 512),              "quality": 85, "force_format": "PNG"},
    "img_manifest_256": {"max_size": (256, 256),              "quality": 85, "force_format": "PNG"},
    "img_manifest_192": {"max_size": (192, 192),              "quality": 85, "force_format": "PNG"},
    "img_manifest_128": {"max_size": (128, 128),              "quality": 85, "force_format": "PNG"},
    "img_about":        image_cfg(REGULAR, quality=90),
    "img_hero":         {"max_size": (1920, 1080),            "quality": 90},
    # The brandmark is a small identity mark that must hold alpha, like the logo -
    # tiled as a watermark and shown in cards - so it is PNG-forced at the SMALL tier.
    "img_brandmark":    image_cfg(SMALL, quality=90, force_format="PNG"),
}


# ---------------------------------------------------------------------------
# System serializers
# ---------------------------------------------------------------------------

class SystemSerializer(serializers.ModelSerializer):
    """Read serializer - returns all System fields with absolute image URLs."""

    img_logo = serializers.SerializerMethodField()
    img_logo_hero = serializers.SerializerMethodField()
    img_favicon = serializers.SerializerMethodField()
    img_manifest_1080 = serializers.SerializerMethodField()
    img_manifest_512 = serializers.SerializerMethodField()
    img_manifest_256 = serializers.SerializerMethodField()
    img_manifest_192 = serializers.SerializerMethodField()
    img_manifest_128 = serializers.SerializerMethodField()
    img_brandmark = serializers.SerializerMethodField()
    img_about = serializers.SerializerMethodField()
    img_hero = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    service_count = serializers.SerializerMethodField()
    menu_item_count = serializers.SerializerMethodField()
    branch_count = serializers.SerializerMethodField()
    stripe_configured = serializers.BooleanField(read_only=True)
    stripe_webhook_url = serializers.SerializerMethodField()

    class Meta:
        model = System
        # GET /api/system/ is AllowAny and feeds every public page, so nothing
        # secret may appear here. `stripe_enabled` / `stripe_configured` are safe
        # - they say only whether this site takes payments, which the checkout
        # button announces anyway - while the keys themselves have no read path
        # at all. Never add stripe_secret_key_encrypted or
        # stripe_webhook_secret_encrypted to this list; a public endpoint would
        # hand every tenant's ciphertext to anyone who asked.
        fields = [
            "id", "enabled", "created", "modified", "version",
            "site_name", "site_description", "en_site_description", "host",
            "img_logo", "img_logo_hero", "img_favicon",
            "img_manifest_1080", "img_manifest_512", "img_manifest_256", "img_manifest_192", "img_manifest_128",
            "img_brandmark",
            "img_hero", "video_link", "slogan", "primary_color", "secondary_color",
            "contact_email", "social_links",
            "highlights_bg",
            "highlights_title", "en_highlights_title",
            "highlights_subtitle", "en_highlights_subtitle",
            "catalog_items_bg",
            "hero_video_layout", "hero_logo_background", "hero_logo_scale",
            "hero_logo_background_scale",
            "hero_overlay_style", "hero_overlay_opacity", "hero_overlay_extent",
            "hero_text_frame",
            "watermark_enabled", "watermark_rotation", "watermark_intercalated",
            "watermark_show_logo", "watermark_show_brandmark",
            "watermark_size", "watermark_spacing", "watermark_opacity",
            "background_light", "background_dark",
            "google_font_url", "font_display", "font_body",
            "about", "en_about",
            "mission", "en_mission",
            "vision", "en_vision",
            "img_about",
            "privacy_policy", "en_privacy_policy",
            "terms_and_conditions", "en_terms_and_conditions",
            "user_data", "en_user_data",
            "stripe_enabled", "stripe_configured", "stripe_webhook_url",
            "pay_in_store_enabled", "pay_on_delivery_enabled",
            "spotlight_enabled",
            "spotlight_label", "en_spotlight_label",
            "spotlight_title", "en_spotlight_title",
            "spotlight_text", "en_spotlight_text",
            "spotlight_button_label", "en_spotlight_button_label",
            "spotlight_button_link", "spotlight_items",
            "product_count", "service_count", "menu_item_count",
            "branch_count",
        ]

    def _image_url(self, obj, field_name):
        request = self.context.get("request")
        field = getattr(obj, field_name)
        if not field:
            return None
        if request:
            return request.build_absolute_uri(field.url)
        return field.url

    def get_img_logo(self, obj):         return self._image_url(obj, "img_logo")
    def get_img_logo_hero(self, obj):    return self._image_url(obj, "img_logo_hero")
    def get_img_favicon(self, obj):      return self._image_url(obj, "img_favicon")
    def get_img_manifest_1080(self, obj):return self._image_url(obj, "img_manifest_1080")
    def get_img_manifest_512(self, obj): return self._image_url(obj, "img_manifest_512")
    def get_img_manifest_256(self, obj): return self._image_url(obj, "img_manifest_256")
    def get_img_manifest_192(self, obj): return self._image_url(obj, "img_manifest_192")
    def get_img_manifest_128(self, obj): return self._image_url(obj, "img_manifest_128")
    def get_img_brandmark(self, obj):    return self._image_url(obj, "img_brandmark")
    def get_img_about(self, obj):        return self._image_url(obj, "img_about")
    def get_img_hero(self, obj):         return self._image_url(obj, "img_hero")

    def get_stripe_webhook_url(self, obj):
        """The endpoint this tenant registers in their own Stripe dashboard.

        Built here because it is the API's own address, and the CMS that displays
        it is a browser component: `API_URL` is server-only in the website app, so
        the frontend genuinely cannot construct this. Not a secret - it is a
        public endpoint, and the signing secret is what protects it.

        That applies to `stripe_webhook_token` in the path too: it routes an event
        to the right tenant, it does not authenticate it. Appearing on this
        AllowAny endpoint is therefore harmless - an unsigned POST to a known
        token is still rejected - and it cannot be hidden per-user anyway, since
        this response is cached by host/pk and would be served to whoever asked
        second. Never treat the token as a credential.
        """
        from django.urls import reverse

        path = reverse("stripe-webhook", args=[obj.stripe_webhook_token])
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path

    def get_product_count(self, obj):
        from catalog.models import Product
        return Product.objects.filter(system=obj, enabled=True).count()

    def get_service_count(self, obj):
        from catalog.models import Service
        return Service.objects.filter(system=obj, enabled=True).count()

    def get_menu_item_count(self, obj):
        from catalog.models import MenuItem
        return MenuItem.objects.filter(system=obj, enabled=True).count()

    def get_branch_count(self, obj):
        # Drives whether the public Contact link appears (a Contact page is worth
        # showing once a tenant has a physical location or a contact email).
        return obj.branches.filter(enabled=True).count()


_TEXT_FIELDS = [
    "site_name", "site_description", "en_site_description", "host", "video_link", "slogan", "primary_color", "secondary_color",
    "contact_email", "social_links",
    "highlights_bg",
    "highlights_title", "en_highlights_title",
    "highlights_subtitle", "en_highlights_subtitle",
    "catalog_items_bg",
    "hero_video_layout", "hero_logo_background", "hero_logo_scale",
    "hero_logo_background_scale",
    "hero_overlay_style", "hero_overlay_opacity", "hero_overlay_extent",
    "hero_text_frame",
    "watermark_enabled", "watermark_rotation", "watermark_intercalated",
    "watermark_show_logo", "watermark_show_brandmark",
    "watermark_size", "watermark_spacing", "watermark_opacity",
    "background_light", "background_dark",
    "google_font_url", "font_display", "font_body",
    "about", "en_about", "mission", "en_mission", "vision", "en_vision",
    "privacy_policy", "en_privacy_policy",
    "terms_and_conditions", "en_terms_and_conditions",
    "user_data", "en_user_data",
    "enabled",
    "stripe_enabled", "stripe_publishable_key",
    "pay_in_store_enabled", "pay_on_delivery_enabled",
    "spotlight_enabled",
    "spotlight_label", "en_spotlight_label",
    "spotlight_title", "en_spotlight_title",
    "spotlight_text", "en_spotlight_text",
    "spotlight_button_label", "en_spotlight_button_label",
    "spotlight_button_link", "spotlight_items",
]

# Written through System.set_stripe_*() rather than setattr, because the column
# they land in holds ciphertext. Kept out of _TEXT_FIELDS so a future edit to
# that list cannot accidentally start writing a plaintext secret to the DB.
_STRIPE_SECRET_FIELDS = {
    "stripe_secret_key": "set_stripe_secret_key",
    "stripe_webhook_secret": "set_stripe_webhook_secret",
}


class SystemWriteSerializer(serializers.Serializer):
    """Write serializer - accepts base64-encoded images alongside regular fields."""

    # Regular fields (all optional for PATCH semantics)
    site_name           = serializers.CharField(max_length=32, required=False)
    site_description    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_site_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    host                = serializers.CharField(max_length=64, required=False)
    video_link      = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    slogan          = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    primary_color   = serializers.CharField(max_length=16, required=False)
    secondary_color = serializers.CharField(max_length=16, required=False)
    # Site-wide contact details (see the model). Business contact info, not PII.
    contact_email   = serializers.EmailField(max_length=254, required=False, allow_null=True, allow_blank=True)
    social_links    = serializers.JSONField(required=False)
    highlights_bg   = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    highlights_title    = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_highlights_title = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    highlights_subtitle    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_highlights_subtitle = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    catalog_items_bg = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    # Constrained to the layouts the frontend can actually render - an unknown
    # value would silently fall back to "default" on the site, which reads as
    # the setting having been ignored.
    hero_video_layout = serializers.ChoiceField(
        choices=[c[0] for c in System.HERO_LAYOUT_CHOICES], required=False
    )
    # The shape drawn behind the logo, in either layout. Constrained to the shapes
    # the frontend can render - an unknown value would fall back to no badge.
    hero_logo_background = serializers.ChoiceField(
        choices=[c[0] for c in System.HERO_LOGO_BACKGROUND_CHOICES], required=False
    )
    # The same bounds the CMS slider offers; enforced here because the CMS is not
    # the only possible caller. Below 50 the logo would all but vanish inside the
    # disc; above 100 there is nothing more to fill.
    hero_logo_scale = serializers.IntegerField(required=False, min_value=50, max_value=100)
    # Same bounds and rationale as hero_logo_scale; below 50 the badge is too
    # small to read as a backing, above 100 there is nothing bigger to draw.
    hero_logo_background_scale = serializers.IntegerField(required=False, min_value=50, max_value=100)
    # Constrained to the overlay shapes the frontend can render - an unknown
    # value would fall back to the default gradient, which reads as the setting
    # having been ignored. 0 opacity is allowed: it is how a tenant turns the
    # overlay off without losing the style they had picked.
    hero_overlay_style = serializers.ChoiceField(
        choices=[c[0] for c in System.HERO_OVERLAY_STYLE_CHOICES], required=False
    )
    hero_overlay_opacity = serializers.IntegerField(required=False, min_value=0, max_value=100)
    # How far the gradient overlay reaches, on the same 0-100 scale the CMS
    # slider emits; 50 is the neutral default reach. Independent of the strength
    # above.
    hero_overlay_extent = serializers.IntegerField(required=False, min_value=0, max_value=100)
    hero_text_frame = serializers.BooleanField(required=False)
    enabled         = serializers.BooleanField(required=False)

    # Watermark & page background. The bounds are the same ones the CMS sliders
    # offer; they are enforced here too because the CMS is not the only possible
    # caller, and an unbounded size or opacity would paint the logo over the
    # whole site rather than behind it.
    watermark_enabled  = serializers.BooleanField(required=False)
    watermark_intercalated = serializers.BooleanField(required=False)
    watermark_show_logo = serializers.BooleanField(required=False)
    watermark_show_brandmark = serializers.BooleanField(required=False)
    watermark_rotation = serializers.IntegerField(required=False, min_value=-45, max_value=45)
    watermark_size     = serializers.IntegerField(required=False, min_value=24, max_value=400)
    watermark_spacing  = serializers.IntegerField(required=False, min_value=0, max_value=400)
    watermark_opacity  = serializers.IntegerField(required=False, min_value=1, max_value=25)
    background_light   = serializers.CharField(max_length=16, required=False)
    background_dark    = serializers.CharField(max_length=16, required=False)

    # Typography. The URL is host-restricted by the same validator the model
    # uses, because the frontend renders it into a <link rel="stylesheet"> - see
    # core.models.validate_google_font_url.
    google_font_url = serializers.URLField(
        max_length=512, required=False, allow_blank=True,
        validators=[validate_google_font_url],
    )
    font_display = serializers.CharField(max_length=64, required=False, allow_blank=True)
    font_body    = serializers.CharField(max_length=64, required=False, allow_blank=True)

    about               = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_about            = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    mission             = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_mission          = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    vision              = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_vision           = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    privacy_policy      = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_privacy_policy   = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    terms_and_conditions    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_terms_and_conditions = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    user_data    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_user_data = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    # Stripe. The two secrets are write_only and have no read counterpart
    # anywhere: once submitted they can be replaced but never fetched back, so a
    # compromised admin session cannot exfiltrate a tenant's Stripe keys. Send ""
    # to clear one. `stripe_configured` on the read serializer is how the CMS
    # tells whether they are set without seeing them.
    stripe_enabled         = serializers.BooleanField(required=False)
    stripe_publishable_key = serializers.CharField(max_length=255, required=False, allow_blank=True)
    stripe_secret_key      = serializers.CharField(max_length=255, required=False, allow_blank=True, write_only=True)
    stripe_webhook_secret  = serializers.CharField(max_length=255, required=False, allow_blank=True, write_only=True)

    # Offline payment toggles - no credentials, just switches (see the model).
    pay_in_store_enabled    = serializers.BooleanField(required=False)
    pay_on_delivery_enabled = serializers.BooleanField(required=False)

    # Spotlight section - a promo panel + up to three hand-picked catalog items.
    spotlight_enabled          = serializers.BooleanField(required=False)
    spotlight_label            = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_spotlight_label         = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    spotlight_title            = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_spotlight_title         = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    spotlight_text             = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_spotlight_text          = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    spotlight_button_label     = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_spotlight_button_label  = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    spotlight_button_link      = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    spotlight_items            = serializers.JSONField(required=False)

    # Base64 image fields
    img_logo          = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_logo_hero     = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_favicon       = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_1080 = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_512  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_256  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_192  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_128  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_brandmark     = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_about         = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_hero          = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    # The three catalog families a spotlight item may reference. "food" is the
    # MenuItem family (the frontend's kind name), matching the guest-cart refs.
    _SPOTLIGHT_KINDS = {"product", "service", "food"}

    def validate_spotlight_items(self, value):
        """A list of at most three {"kind", "id"} refs - existence is resolved on
        the frontend, this only enforces the shape so a malformed blob can't land
        in the JSON column."""
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of item references.")
        if len(value) > 3:
            raise serializers.ValidationError("At most three items may be featured.")
        cleaned = []
        for entry in value:
            if not isinstance(entry, dict):
                raise serializers.ValidationError("Each item must be an object.")
            kind = entry.get("kind")
            item_id = entry.get("id")
            if kind not in self._SPOTLIGHT_KINDS:
                raise serializers.ValidationError(
                    f"kind must be one of {sorted(self._SPOTLIGHT_KINDS)}."
                )
            try:
                item_id = int(item_id)
            except (TypeError, ValueError):
                raise serializers.ValidationError("id must be an integer.")
            cleaned.append({"kind": kind, "id": item_id})
        return cleaned

    def validate_social_links(self, value):
        """A list of {"platform", "url"} refs; shape only, so a malformed blob
        can't land in the JSON column. The platform is free-form (lowercased) so
        a new network needs no code change - the frontend maps it to an icon and
        falls back to a globe for one it doesn't recognise."""
        return validate_social_links(value)

    def validate(self, attrs):
        for field_name, cfg in _IMAGE_FIELDS.items():
            value = attrs.get(field_name)
            if value:
                sub = ImageProcessingSerializer(data={"base64_image": value}, **cfg)
                if not sub.is_valid():
                    raise serializers.ValidationError({field_name: sub.errors["base64_image"]})
        return attrs

    def save(self, instance):
        update_fields = []

        # Text / scalar fields
        for field_name in _TEXT_FIELDS:
            if field_name in self.validated_data:
                setattr(instance, field_name, self.validated_data[field_name])
                update_fields.append(field_name)

        # Stripe secrets - encrypted on the way in, so they set the *_encrypted
        # column rather than the name the API accepts.
        for field_name, setter in _STRIPE_SECRET_FIELDS.items():
            if field_name in self.validated_data:
                getattr(instance, setter)(self.validated_data[field_name])
                update_fields.append(f"{field_name}_encrypted")

        # Image fields
        for field_name, cfg in _IMAGE_FIELDS.items():
            if field_name not in self.validated_data:
                continue
            value = self.validated_data[field_name]
            if not value:
                setattr(instance, field_name, None)
                update_fields.append(field_name)
                continue
            proc = ImageProcessingSerializer(data={"base64_image": value}, **cfg)
            proc.is_valid()  # already validated above
            # No extension: save_to_field appends the one matching what it wrote.
            proc.save_to_field(getattr(instance, field_name), f"{field_name}_{instance.pk}")
            update_fields.append(field_name)

        if update_fields:
            instance.save(update_fields=update_fields)

        return instance


# ---------------------------------------------------------------------------
# Brand serializers
# ---------------------------------------------------------------------------

class BrandSerializer(serializers.ModelSerializer):
    logo = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = ["id", "enabled", "created", "modified", "name", "slug", "logo", "system", "sort_order"]

    def get_logo(self, obj):
        request = self.context.get("request")
        if not obj.logo:
            return None
        if request:
            return request.build_absolute_uri(obj.logo.url)
        return obj.logo.url


# Forced PNG for the same reason as System.img_logo: a brand mark needs alpha.
_BRAND_LOGO_CFG = image_cfg(MEDIUM, quality=90, force_format="PNG")


class BrandWriteSerializer(serializers.Serializer):
    """Write serializer for Brand - all fields optional (PATCH semantics)."""

    name    = serializers.CharField(max_length=255, required=False)
    slug    = serializers.SlugField(max_length=255, required=False)
    enabled = serializers.BooleanField(required=False)
    system  = serializers.PrimaryKeyRelatedField(queryset=System.objects.all(), required=False, allow_null=True)
    # Manual display order, written by the admin list's drag-to-reorder mode.
    sort_order = serializers.IntegerField(min_value=0, required=False)
    logo    = serializers.CharField(required=False, allow_null=True, allow_blank=True)  # base64

    def validate_logo(self, value):
        if value:
            sub = ImageProcessingSerializer(data={"base64_image": value}, **_BRAND_LOGO_CFG)
            if not sub.is_valid():
                raise serializers.ValidationError(sub.errors["base64_image"])
        return value

    def save(self, instance):
        scalar_fields = ["name", "slug", "enabled", "system", "sort_order"]
        update_fields = []
        for field_name in scalar_fields:
            if field_name in self.validated_data:
                setattr(instance, field_name, self.validated_data[field_name])
                update_fields.append(field_name)

        if "logo" in self.validated_data:
            logo_value = self.validated_data["logo"]
            if logo_value:
                proc = ImageProcessingSerializer(data={"base64_image": logo_value}, **_BRAND_LOGO_CFG)
                proc.is_valid()
                proc.save_to_field(instance.logo, f"brand_logo_{instance.pk}.png")
            else:
                instance.logo = None
            update_fields.append("logo")

        if update_fields:
            instance.save(update_fields=update_fields)

        return instance


# ---------------------------------------------------------------------------
# Branch
# ---------------------------------------------------------------------------

class BranchSerializer(serializers.ModelSerializer):
    """Read serializer for a physical location. Public - business contact info."""

    class Meta:
        model = Branch
        fields = [
            "id", "enabled", "created", "modified",
            "system", "is_main",
            "name", "en_name", "address", "phone", "whatsapp", "email",
            "latitude", "longitude", "sort_order",
        ]


class BranchWriteSerializer(serializers.Serializer):
    """Write serializer for Branch - all fields optional (PATCH semantics)."""

    system     = serializers.PrimaryKeyRelatedField(queryset=System.objects.all(), required=False, allow_null=True)
    is_main    = serializers.BooleanField(required=False)
    name       = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name    = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    address    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    phone      = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    whatsapp   = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    email      = serializers.EmailField(max_length=254, required=False, allow_null=True, allow_blank=True)
    latitude   = serializers.DecimalField(max_digits=10, decimal_places=8, required=False, allow_null=True, min_value=-90, max_value=90)
    longitude  = serializers.DecimalField(max_digits=11, decimal_places=8, required=False, allow_null=True, min_value=-180, max_value=180)
    enabled    = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, required=False)

    _SCALAR_FIELDS = [
        "system", "is_main", "name", "en_name", "address", "phone", "whatsapp",
        "email", "latitude", "longitude", "enabled", "sort_order",
    ]

    def save(self, instance):
        update_fields = []
        for field_name in self._SCALAR_FIELDS:
            if field_name in self.validated_data:
                setattr(instance, field_name, self.validated_data[field_name])
                update_fields.append(field_name)
        if update_fields:
            instance.save(update_fields=update_fields)
        return instance


# ---------------------------------------------------------------------------
# Contact messages
# ---------------------------------------------------------------------------

class ContactMessageSerializer(serializers.ModelSerializer):
    """Read serializer for the admin inbox. Carries the customer's PII, so it is
    only ever served behind IsSystemAdmin - never a public endpoint."""

    # Who sent the reply, resolved to a display name (never the raw account).
    replied_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ContactMessage
        fields = [
            "id", "created", "modified", "system",
            "name", "email", "subject", "message",
            "related_kind", "related_id", "related_name",
            "is_read",
            "reply_subject", "reply_body", "replied_at", "replied_by_name",
        ]

    def get_replied_by_name(self, obj):
        user = obj.replied_by
        if user is None:
            return None
        return (f"{user.first_name} {user.last_name}".strip() or user.username)


class ContactMessageCreateSerializer(serializers.Serializer):
    """Public create serializer for a customer's contact-form submission.

    `name`/`email` are required only for an anonymous sender; the view fills them
    from the account for a signed-in one and ignores whatever the body claimed
    (so a logged-in user can't spoof another address). The related-item fields are
    optional and only present when the form was embedded on a detail page.
    """

    name    = serializers.CharField(max_length=255, required=False, allow_blank=True)
    email   = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    subject = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    message = serializers.CharField(max_length=5000)

    related_kind = serializers.ChoiceField(
        choices=[c[0] for c in ContactMessage.RELATED_KIND_CHOICES],
        required=False, allow_null=True, allow_blank=True,
    )
    related_id   = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    related_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)


# ---------------------------------------------------------------------------
# AI chat
# ---------------------------------------------------------------------------

class AiChatMessageSerializer(serializers.Serializer):
    """One chat message. Mirrors the OpenAI wire shape the frontend hook sends."""

    role = serializers.ChoiceField(choices=["system", "user", "assistant"])
    content = serializers.CharField(trim_whitespace=False, max_length=32000)


class AiChatSerializer(serializers.Serializer):
    """
    Body of POST /api/ai/chat/.

    The client does not choose a provider or a model - `stream`, `model` and `seed`
    arrive from the shared hook and are deliberately ignored, since provider choice
    (Groq, falling back to OpenRouter) is a backend concern.
    """

    messages = AiChatMessageSerializer(many=True, allow_empty=False, max_length=50)
    temperature = serializers.FloatField(min_value=0, max_value=2, default=0.7)
