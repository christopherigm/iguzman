import base64
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from rest_framework import serializers

from . import image_sizes


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

# Formats worth storing as uploaded. A PNG is usually an icon, logo or flat-color
# graphic, and re-encoding one as JPEG puts visible ringing around every hard
# edge; WEBP is already smaller than what we would replace it with. Anything else
# (HEIC, TIFF, BMP, GIF, ...) becomes JPEG - which matters here, because phones
# hand out HEIC by default and that is what most wildlife photos arrive as.
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
      force_format str       - Pillow format string ('JPEG', 'PNG', ...). Default
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
        if ',' in value:
            value = value.split(',', 1)[1]
        try:
            image_bytes = base64.b64decode(value)
        except Exception:
            raise serializers.ValidationError('Invalid base64 encoding.')
        try:
            img = Image.open(BytesIO(image_bytes))
            img.verify()
        except Exception:
            raise serializers.ValidationError('The provided file is not a valid image.')
        return value

    def _resolve_format(self, img):
        """The format to store in: the configured one, else the upload's own."""
        if self.force_format:
            return self.force_format.upper()
        fmt = (img.format or 'JPEG').upper()
        return fmt if fmt in PRESERVED_FORMATS else 'JPEG'

    def process_image(self):
        """Return (BytesIO, format) for the processed image."""
        raw = self.validated_data['base64_image']
        if ',' in raw:
            raw = raw.split(',', 1)[1]
        image_bytes = base64.b64decode(raw)

        img = Image.open(BytesIO(image_bytes))
        fmt = self._resolve_format(img)
        # Cameras and phones record orientation in EXIF rather than rotating the
        # pixels, and `thumbnail()` below discards that tag - so without this a
        # portrait photo is stored sideways.
        img = ImageOps.exif_transpose(img)

        if fmt == 'JPEG' and img.mode not in ('RGB',):
            img = img.convert('RGB')
        elif fmt == 'PNG' and img.mode not in ('RGBA', 'RGB', 'P'):
            img = img.convert('RGBA')

        img.thumbnail(self.max_size, Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format=fmt, quality=self.quality, optimize=True)
        output.seek(0)
        return output, fmt

    def save_to_field(self, image_field, filename):
        """
        Process the image and save it to a Django ImageField / FileField.

        The caller's extension is advisory: it is rewritten to match the format
        actually written, since that depends on what was uploaded.

        Usage:
            serializer.save_to_field(instance.image, 'species_42')
            instance.save(update_fields=['image'])
        """
        output, fmt = self.process_image()
        base = filename.rsplit('.', 1)[0]
        name = f"{base}.{_EXTENSIONS.get(fmt, 'jpg')}"
        image_field.save(name, ContentFile(output.read()), save=False)


# ---------------------------------------------------------------------------
# Shared serializer helpers
# ---------------------------------------------------------------------------

def file_url(file_field, request=None):
    """Absolute URL for a FileField/ImageField value, or None if it is empty.

    In production ``FieldFile.url`` is already an absolute R2/CDN URL, and
    ``build_absolute_uri`` returns such a URL untouched - so this is correct in
    both environments and needs no branch on the storage backend.
    """
    if not file_field:
        return None
    url = file_field.url
    return request.build_absolute_uri(url) if request is not None else url


class Base64ImagesMixin:
    """Accept image fields as base64 strings on a write serializer.

    Declare the fields and their size tier::

        class SpeciesWriteSerializer(Base64ImagesMixin, serializers.ModelSerializer):
            image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
            icon = serializers.CharField(required=False, allow_null=True, allow_blank=True)
            image_fields = {'image': image_cfg(REGULAR), 'icon': image_cfg(ICON)}

    Each declared field is validated as a decodable image up front, then written
    **after** the row is saved - the file name embeds the pk, which does not exist
    until then. Sending an explicit empty value clears the field; omitting it
    leaves the stored file alone, which is what makes a PATCH of one text field
    safe.
    """

    image_fields: dict = {}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        for name, cfg in self.image_fields.items():
            raw = attrs.get(name)
            if not raw:
                continue
            sub = ImageProcessingSerializer(data={'base64_image': raw}, **cfg)
            if not sub.is_valid():
                raise serializers.ValidationError({name: sub.errors['base64_image']})
        return attrs

    def _pop_images(self, validated_data):
        """Split the base64 payloads out of ``validated_data``.

        Returns ``(writes, clears)``: fields carrying a new image, and fields
        sent explicitly empty (meaning "remove it").
        """
        writes, clears = {}, []
        for name in self.image_fields:
            if name not in validated_data:
                continue
            raw = validated_data.pop(name)
            if raw:
                writes[name] = raw
            else:
                clears.append(name)
        return writes, clears

    def _apply_images(self, instance, writes, clears):
        changed = []
        for name, raw in writes.items():
            proc = ImageProcessingSerializer(data={'base64_image': raw}, **self.image_fields[name])
            proc.is_valid()
            proc.save_to_field(
                getattr(instance, name),
                f'{instance._meta.model_name}_{instance.pk}_{name}',
            )
            changed.append(name)
        for name in clears:
            setattr(instance, name, None)
            changed.append(name)
        if changed:
            instance.save(update_fields=changed)
        return instance

    def create(self, validated_data):
        writes, clears = self._pop_images(validated_data)
        instance = super().create(validated_data)
        return self._apply_images(instance, writes, clears)

    def update(self, instance, validated_data):
        writes, clears = self._pop_images(validated_data)
        instance = super().update(instance, validated_data)
        return self._apply_images(instance, writes, clears)
