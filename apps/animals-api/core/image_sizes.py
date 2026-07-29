"""
Single source of truth for stored image dimensions.

Both halves of the upload pipeline read from here:

* ``core.models.picture_mixin()`` declares the model tier, and
* every write serializer passes the matching bounding box to
  ``ImageProcessingSerializer``.

Keeping them apart is what lets them drift, and the drift is *silent*: the
serializer resizes before the model field ever sees the file, so
``ResizedImageField`` finds an image that already fits and does nothing. The
smaller of the two numbers always wins and nothing is logged. Never type a size
literal at either site - name a tier from this module instead.

Note the two halves spell the same tier differently, which is why ``box()``
exists: the model constrains **width only** (height scales freely), while the
serializer's ``thumbnail()`` is a bounding box on **both** axes. A tall image is
therefore capped by its height in the serializer, so a portrait photo at the
REGULAR tier comes out ~800 px wide, not 1200.
"""

# Tier sizes in px, named to match the mixins in core.models.
#
# ICON is 192 rather than a value near the ~84 px a glyph is actually drawn at,
# because `apps/animals` optimizes nothing: its `images.loader` is 'custom' and
# the loader returns every URL untouched, so `/_next/image` does not exist there
# and the stored file is what the browser paints. There is no 2x variant to
# generate - the tier has to carry the retina copy itself. 192 covers the
# largest render (the 84 px category-nav tile) at 2x and the 64 px detail-hero
# glyph at 3x. It is also the size the manifest already uses, so it stays a
# round number an author can recognise.
ICON = 192       # category/season/weather glyphs shown beside a label
SMALL = 256      # SmallPicture   - thumbnails, avatars
MEDIUM = 512     # MediumPicture  - cards, previews, video posters
REGULAR = 1200   # RegularPicture - species portraits, sighting photos
LARGE = 3840     # LargePicture   - full-bleed hero backgrounds


def box(size: int) -> tuple[int, int]:
    """The serializer bounding box for a tier (square; aspect ratio is kept)."""
    return (size, size)


def image_cfg(size: int, quality: int = 85, force_format: str | None = None) -> dict:
    """
    Build the kwargs for ``ImageProcessingSerializer`` from a tier.

    ``force_format`` defaults to None, which preserves PNG/WEBP uploads and
    converts everything else to JPEG. Pass it only when a field must always be
    one format regardless of what was uploaded.
    """
    cfg: dict = {"max_size": box(size), "quality": quality}
    if force_format is not None:
        cfg["force_format"] = force_format
    return cfg
