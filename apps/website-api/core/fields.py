import io

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import models
from PIL import Image, ImageOps


class ResizedImageField(models.ImageField):
    """
    ImageField that automatically resizes images on upload using Pillow.

    Args:
        max_size: [max_width, max_height] — use None for unconstrained axis.
                  e.g. [512, None] constrains width to 512 px, height scales
                  proportionally; [None, 300] constrains only height.
        quality:  JPEG/WebP compression quality (1–95). Default 85.
    """

    def __init__(self, *args, max_size=None, quality=85, **kwargs):
        self.max_size = max_size
        self.quality = quality
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        if self.max_size is not None:
            kwargs["max_size"] = self.max_size
        if self.quality != 85:
            kwargs["quality"] = self.quality
        return name, path, args, kwargs

    def pre_save(self, model_instance, add):
        file = getattr(model_instance, self.attname)
        if file and hasattr(file, "file") and not file._committed:
            resized = self._resize(file)
            if resized is not None:
                setattr(model_instance, self.attname, resized)
        return super().pre_save(model_instance, add)

    def _resize(self, file):
        if not self.max_size:
            return None

        max_w, max_h = self.max_size

        try:
            img = Image.open(file)
            img = ImageOps.exif_transpose(img)
        except Exception:
            return None

        img_format = (img.format or "JPEG").upper()
        w, h = img.size

        # Compute target dimensions maintaining aspect ratio.
        new_w, new_h = w, h
        if max_w is not None and new_w > max_w:
            ratio = max_w / new_w
            new_w, new_h = max_w, int(new_h * ratio)
        if max_h is not None and new_h > max_h:
            ratio = max_h / new_h
            new_w, new_h = int(new_w * ratio), max_h

        if (new_w, new_h) == (w, h):
            return None  # Image already fits within bounds.

        img = img.resize((new_w, new_h), Image.LANCZOS)

        # JPEG does not support transparency channels.
        if img_format == "JPEG" and img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        output = io.BytesIO()
        save_kwargs: dict = {"format": img_format, "optimize": True}
        if img_format in ("JPEG", "WEBP"):
            save_kwargs["quality"] = self.quality
        img.save(output, **save_kwargs)
        output.seek(0)

        mime = f"image/{img_format.lower()}"
        return InMemoryUploadedFile(
            file=output,
            field_name=self.name,
            name=file.name,
            content_type=mime,
            size=output.getbuffer().nbytes,
            charset=None,
        )
