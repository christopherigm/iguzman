"""
Single source of truth for stored image dimensions.

Both halves of the upload pipeline read from here:

* ``core.models.picture_mixin()`` declares the model tier, and
* every write serializer passes the matching bounding box to
  ``ImageProcessingSerializer``.

They used to be typed out separately at each site, and they drifted: the
CompanyHighlight write serializer capped at 512 px while the field it wrote to
declared 1200, so every highlight uploaded through the CMS was stored at 512.
That drift is silent - the serializer resizes *before* the model field, and
``ResizedImageField`` then sees an image that already fits and does nothing - so
the smaller of the two numbers always wins and nothing ever complains.

Note the two halves spell the same tier differently, which is why ``box()``
exists: the model constrains **width only** (height scales freely), while the
serializer's ``thumbnail()`` is a bounding box on **both** axes. A tall image is
therefore capped by its height in the serializer, so a portrait photo at the
STANDARD tier comes out ~600 px wide, not 900.
"""

# Tier sizes in px, named to match the mixins in core.models.
SMALL = 256      # SmallPicture   - thumbnails, avatars, spec icons
MEDIUM = 512     # MediumPicture  - cards, previews, logos
STANDARD = 900   # StandardPicture- buyables and gallery images
REGULAR = 1200   # RegularPicture - content images, hero/detail images
LARGE = 3840     # LargePicture   - full-bleed backgrounds


def box(size: int) -> tuple[int, int]:
    """The serializer bounding box for a tier (square; aspect ratio is kept)."""
    return (size, size)


def image_cfg(size: int, quality: int = 85, force_format: str | None = None) -> dict:
    """
    Build the kwargs for ``ImageProcessingSerializer`` from a tier.

    ``force_format`` defaults to None, which preserves PNG/WEBP uploads and
    converts everything else to JPEG. Pass it only when a field must always be
    one format regardless of what was uploaded (favicons and manifest icons).
    """
    cfg: dict = {"max_size": box(size), "quality": quality}
    if force_format is not None:
        cfg["force_format"] = force_format
    return cfg
