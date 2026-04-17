import base64
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image
from rest_framework import serializers


class ImageProcessingSerializer(serializers.Serializer):
    """
    Accepts a base64-encoded image and processes it to JPEG.

    Parameters (set as class attributes or pass via __init__):
      max_size (int, int) — thumbnail bounding box, default (512, 512)
      quality  int        — JPEG quality 1–95, default 90
    """

    max_size = (512, 512)
    quality = 90

    base64_image = serializers.CharField(write_only=True)

    def __init__(self, *args, max_size=None, quality=None, **kwargs):
        super().__init__(*args, **kwargs)
        if max_size is not None:
            self.max_size = max_size
        if quality is not None:
            self.quality = quality

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

    def process_image(self):
        """Return a BytesIO containing the resized JPEG."""
        raw = self.validated_data['base64_image']
        if ',' in raw:
            raw = raw.split(',', 1)[1]
        image_bytes = base64.b64decode(raw)

        img = Image.open(BytesIO(image_bytes))
        if img.mode not in ('RGB',):
            img = img.convert('RGB')

        img.thumbnail(self.max_size, Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format='JPEG', quality=self.quality, optimize=True)
        output.seek(0)
        return output

    def save_to_field(self, image_field, filename):
        """
        Process the image and save it to a Django ImageField / FileField.

        Usage:
            serializer.save_to_field(instance.avatar, 'avatar_42.jpg')
            instance.save(update_fields=['avatar'])
        """
        output = self.process_image()
        image_field.save(filename, ContentFile(output.read()), save=False)
