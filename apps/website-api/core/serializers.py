import base64
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from rest_framework import serializers

from .models import Brand, CompanyHighlight, CompanyHighlightItem, SuccessStory, SuccessStoryImage, System

# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

class ImageProcessingSerializer(serializers.Serializer):
    """
    Accepts a base64-encoded image and processes it.

    Parameters (set as class attributes or pass via __init__):
      max_size    (int, int) - thumbnail bounding box, default (512, 512)
      quality     int        - quality 1-95, default 90
      force_format str       - Pillow format string ('JPEG', 'PNG', …), default 'JPEG'
    """

    max_size = (512, 512)
    quality = 90
    force_format = "JPEG"

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

    def process_image(self):
        """Return a BytesIO containing the processed image."""
        raw = self.validated_data["base64_image"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        image_bytes = base64.b64decode(raw)

        img = Image.open(BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)

        fmt = self.force_format.upper()
        if fmt == "JPEG" and img.mode not in ("RGB",):
            img = img.convert("RGB")
        elif fmt == "PNG" and img.mode not in ("RGBA", "RGB", "P"):
            img = img.convert("RGBA")

        img.thumbnail(self.max_size, Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format=fmt, quality=self.quality, optimize=True)
        output.seek(0)
        return output

    def save_to_field(self, image_field, filename):
        """
        Process the image and save it to a Django ImageField / FileField.

        Usage:
            serializer.save_to_field(instance.avatar, "avatar_42.jpg")
            instance.save(update_fields=["avatar"])
        """
        output = self.process_image()
        image_field.save(filename, ContentFile(output.read()), save=False)


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


_STORY_IMAGE_CFG = {"max_size": (900, 900), "quality": 85, "force_format": "JPEG"}


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
        sub = ImageProcessingSerializer(data={"base64_image": value}, **_STORY_IMAGE_CFG)
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
        proc = ImageProcessingSerializer(data={"base64_image": image_data}, **_STORY_IMAGE_CFG)
        proc.is_valid()
        proc.save_to_field(instance.image, f"storyimage_{instance.pk}.jpg")
        instance.save(update_fields=["image"])
        return instance


# ---------------------------------------------------------------------------
# Company Highlight serializers
# ---------------------------------------------------------------------------

_HIGHLIGHT_IMAGE_CFG = {"max_size": (512, 512), "quality": 85, "force_format": "JPEG"}
_HIGHLIGHT_ITEM_IMAGE_CFG = {"max_size": (256, 256), "quality": 85, "force_format": "JPEG"}


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

_IMAGE_FIELDS = {
    "img_logo":         {"max_size": (512, 512),   "quality": 95, "force_format": "PNG"},
    "img_logo_hero":    {"max_size": (512, 512),   "quality": 95, "force_format": "PNG"},
    "img_favicon":      {"max_size": (64, 64),     "quality": 80, "force_format": "PNG"},
    "img_manifest_1080":{"max_size": (1080, 1080), "quality": 85, "force_format": "PNG"},
    "img_manifest_512": {"max_size": (512, 512),   "quality": 85, "force_format": "PNG"},
    "img_manifest_256": {"max_size": (256, 256),   "quality": 85, "force_format": "PNG"},
    "img_manifest_192": {"max_size": (192, 192),   "quality": 85, "force_format": "PNG"},
    "img_manifest_128": {"max_size": (128, 128),   "quality": 85, "force_format": "PNG"},
    "img_about":        {"max_size": (1200, 1200), "quality": 95, "force_format": "PNG"},
    "img_hero":         {"max_size": (1920, 1080), "quality": 90, "force_format": "JPEG"},
}

_EXT = {"JPEG": "jpg", "PNG": "png"}


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
    img_about = serializers.SerializerMethodField()
    img_hero = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    service_count = serializers.SerializerMethodField()
    menu_item_count = serializers.SerializerMethodField()
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
            "img_hero", "video_link", "slogan", "primary_color", "secondary_color",
            "highlights_bg",
            "highlights_title", "en_highlights_title",
            "highlights_subtitle", "en_highlights_subtitle",
            "catalog_items_bg",
            "watermark_enabled", "watermark_rotation", "watermark_size",
            "watermark_spacing", "watermark_opacity",
            "background_light", "background_dark",
            "about", "en_about",
            "mission", "en_mission",
            "vision", "en_vision",
            "img_about",
            "privacy_policy", "en_privacy_policy",
            "terms_and_conditions", "en_terms_and_conditions",
            "user_data", "en_user_data",
            "stripe_enabled", "stripe_configured", "stripe_webhook_url",
            "product_count", "service_count", "menu_item_count",
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


_TEXT_FIELDS = [
    "site_name", "site_description", "en_site_description", "host", "video_link", "slogan", "primary_color", "secondary_color",
    "highlights_bg",
    "highlights_title", "en_highlights_title",
    "highlights_subtitle", "en_highlights_subtitle",
    "catalog_items_bg",
    "watermark_enabled", "watermark_rotation", "watermark_size",
    "watermark_spacing", "watermark_opacity",
    "background_light", "background_dark",
    "about", "en_about", "mission", "en_mission", "vision", "en_vision",
    "privacy_policy", "en_privacy_policy",
    "terms_and_conditions", "en_terms_and_conditions",
    "user_data", "en_user_data",
    "enabled",
    "stripe_enabled", "stripe_publishable_key",
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
    highlights_bg   = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    highlights_title    = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_highlights_title = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    highlights_subtitle    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_highlights_subtitle = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    catalog_items_bg = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    enabled         = serializers.BooleanField(required=False)

    # Watermark & page background. The bounds are the same ones the CMS sliders
    # offer; they are enforced here too because the CMS is not the only possible
    # caller, and an unbounded size or opacity would paint the logo over the
    # whole site rather than behind it.
    watermark_enabled  = serializers.BooleanField(required=False)
    watermark_rotation = serializers.IntegerField(required=False, min_value=-45, max_value=45)
    watermark_size     = serializers.IntegerField(required=False, min_value=24, max_value=400)
    watermark_spacing  = serializers.IntegerField(required=False, min_value=0, max_value=400)
    watermark_opacity  = serializers.IntegerField(required=False, min_value=1, max_value=25)
    background_light   = serializers.CharField(max_length=16, required=False)
    background_dark    = serializers.CharField(max_length=16, required=False)

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

    # Base64 image fields
    img_logo          = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_logo_hero     = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_favicon       = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_1080 = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_512  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_256  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_192  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_128  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_about         = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_hero          = serializers.CharField(required=False, allow_null=True, allow_blank=True)

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
            ext = _EXT.get(cfg["force_format"].upper(), "png")
            filename = f"{field_name}_{instance.pk}.{ext}"
            proc.save_to_field(getattr(instance, field_name), filename)
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


_BRAND_LOGO_CFG = {"max_size": (512, 512), "quality": 90, "force_format": "PNG"}


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
