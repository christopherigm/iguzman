import base64
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image
from rest_framework import serializers

from .models import System

# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

class ImageProcessingSerializer(serializers.Serializer):
    """
    Accepts a base64-encoded image and processes it.

    Parameters (set as class attributes or pass via __init__):
      max_size    (int, int) — thumbnail bounding box, default (512, 512)
      quality     int        — quality 1–95, default 90
      force_format str       — Pillow format string ('JPEG', 'PNG', …), default 'JPEG'
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
# System image field configuration
# ---------------------------------------------------------------------------

_IMAGE_FIELDS = {
    "img_logo":         {"max_size": (512, 512),   "quality": 95, "force_format": "PNG"},
    "img_logo_hero":    {"max_size": (512, 512),   "quality": 95, "force_format": "PNG"},
    "img_favicon":      {"max_size": (64, 64),     "quality": 80, "force_format": "PNG"},
    "img_manifest_1080":{"max_size": (1080, 1080), "quality": 85, "force_format": "PNG"},
    "img_manifest_512": {"max_size": (512, 512),   "quality": 85, "force_format": "PNG"},
    "img_manifest_256": {"max_size": (256, 256),   "quality": 85, "force_format": "PNG"},
    "img_manifest_128": {"max_size": (128, 128),   "quality": 85, "force_format": "PNG"},
    "img_about":        {"max_size": (1200, 1200), "quality": 95, "force_format": "PNG"},
    "img_hero":         {"max_size": (1920, 1080), "quality": 90, "force_format": "JPEG"},
}

_EXT = {"JPEG": "jpg", "PNG": "png"}


# ---------------------------------------------------------------------------
# System serializers
# ---------------------------------------------------------------------------

class SystemSerializer(serializers.ModelSerializer):
    """Read serializer — returns all System fields with absolute image URLs."""

    img_logo = serializers.SerializerMethodField()
    img_logo_hero = serializers.SerializerMethodField()
    img_favicon = serializers.SerializerMethodField()
    img_manifest_1080 = serializers.SerializerMethodField()
    img_manifest_512 = serializers.SerializerMethodField()
    img_manifest_256 = serializers.SerializerMethodField()
    img_manifest_128 = serializers.SerializerMethodField()
    img_about = serializers.SerializerMethodField()
    img_hero = serializers.SerializerMethodField()

    class Meta:
        model = System
        fields = [
            "id", "enabled", "created", "modified", "version",
            "site_name", "host",
            "img_logo", "img_logo_hero", "img_favicon",
            "img_manifest_1080", "img_manifest_512", "img_manifest_256", "img_manifest_128",
            "img_hero", "video_link", "primary_color", "secondary_color",
            "about", "en_about",
            "mission", "en_mission",
            "vision", "en_vision",
            "img_about",
            "privacy_policy", "en_privacy_policy",
            "terms_and_conditions", "en_terms_and_conditions",
            "user_data", "en_user_data",
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
    def get_img_manifest_128(self, obj): return self._image_url(obj, "img_manifest_128")
    def get_img_about(self, obj):        return self._image_url(obj, "img_about")
    def get_img_hero(self, obj):         return self._image_url(obj, "img_hero")


_TEXT_FIELDS = [
    "site_name", "host", "video_link", "primary_color", "secondary_color",
    "about", "en_about", "mission", "en_mission", "vision", "en_vision",
    "privacy_policy", "en_privacy_policy",
    "terms_and_conditions", "en_terms_and_conditions",
    "user_data", "en_user_data",
    "enabled",
]


class SystemWriteSerializer(serializers.Serializer):
    """Write serializer — accepts base64-encoded images alongside regular fields."""

    # Regular fields (all optional for PATCH semantics)
    site_name       = serializers.CharField(max_length=32, required=False)
    host            = serializers.CharField(max_length=64, required=False)
    video_link      = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    primary_color   = serializers.CharField(max_length=16, required=False)
    secondary_color = serializers.CharField(max_length=16, required=False)
    enabled         = serializers.BooleanField(required=False)

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

    # Base64 image fields
    img_logo          = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_logo_hero     = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_favicon       = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_1080 = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_512  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    img_manifest_256  = serializers.CharField(required=False, allow_null=True, allow_blank=True)
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

        # Image fields
        for field_name, cfg in _IMAGE_FIELDS.items():
            value = self.validated_data.get(field_name)
            if not value:
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
