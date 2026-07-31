"""Read and write serializers for the site-settings singleton.

Kept out of ``core/serializers.py``, which holds the image-processing plumbing
every app's serializers import - putting a concrete model's serializers in there
would make that module import ``core.models``' concrete side and turn a shared
utility into a leaf.

Two things worth knowing before editing either class:

* **The read serializer feeds every public page** (``GET /api/system/`` is
  ``AllowAny``). Nothing may go on it that is not meant to be world-readable.
  There is no credential on this model today; if one is ever added, it belongs
  on the write serializer as ``write_only`` and on nothing else.
* **Both languages travel raw.** ``site_description`` is Spanish and
  ``en_site_description`` English, and the API resolves neither - the payload is
  cached under one key, so a locale-resolved variant would be written into that
  same key and then served to the next reader in the wrong language. The
  frontend picks. Same rule as every catalog payload here.
"""

from rest_framework import serializers

from .image_sizes import ICON, LARGE, MEDIUM, REGULAR, SMALL, image_cfg
from .models import System
from .serializers import Base64ImagesMixin, file_url

# The brand images, and the tier each is stored at. This tuple is the single
# list: the read serializer builds a URL method per entry, the write serializer
# declares a base64 field per entry, and the CMS reads the same names back.
#
# PNG is forced on everything that needs an alpha channel - a logo, a favicon or
# a manifest icon re-encoded as JPEG loses its transparency and gains a white
# box. `img_hero` and `img_about` are photographs and keep the upload's own
# format (JPEG for a camera file, PNG if someone uploads a PNG).
SYSTEM_IMAGE_FIELDS = {
    'img_logo': image_cfg(MEDIUM, force_format='PNG'),
    'img_logo_hero': image_cfg(MEDIUM, force_format='PNG'),
    'img_favicon': image_cfg(ICON, force_format='PNG'),
    'img_brandmark': image_cfg(SMALL, force_format='PNG'),
    'img_about': image_cfg(REGULAR),
    'img_hero': image_cfg(LARGE, quality=90),
    'img_manifest_1080': image_cfg(1080, force_format='PNG'),
    'img_manifest_512': image_cfg(512, force_format='PNG'),
    'img_manifest_256': image_cfg(256, force_format='PNG'),
    'img_manifest_192': image_cfg(192, force_format='PNG'),
    'img_manifest_128': image_cfg(128, force_format='PNG'),
}

# Everything that is not an image and not bookkeeping. Named once so the two
# serializers below cannot drift, and so adding a field to the model is one edit
# here rather than three.
SYSTEM_VALUE_FIELDS = (
    'site_name',
    'site_description',
    'en_site_description',
    'contact_email',
    'social_links',
    'primary_color',
    'secondary_color',
    'google_font_url',
    'font_display',
    'font_body',
    'hero_text_frame',
    'watermark_enabled',
    'watermark_rotation',
    'watermark_intercalated',
    'watermark_show_logo',
    'watermark_show_brandmark',
    'watermark_size',
    'watermark_spacing',
    'watermark_opacity',
    'background_light',
    'background_dark',
    # Read by the handler in `apps/animals` before every transcode. On the public
    # payload like everything else here: these say how a clip was encoded, not how
    # to reach anything, so there is nothing to withhold.
    'video_max_height',
    'video_quality',
    'video_codec',
)


class SystemSerializer(serializers.ModelSerializer):
    """The public payload. Absolute URLs for every image, both languages raw."""

    class Meta:
        model = System
        fields = ('id', 'enabled', *SYSTEM_VALUE_FIELDS, *SYSTEM_IMAGE_FIELDS)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        for name in SYSTEM_IMAGE_FIELDS:
            data[name] = file_url(getattr(instance, name), request)
        return data


class SystemWriteSerializer(Base64ImagesMixin, serializers.ModelSerializer):
    """What the CMS PATCHes. Images arrive as base64 strings, like everywhere here.

    ``enabled`` is deliberately absent: taking the whole site down is an
    operator action done in the Django admin, not something the CMS can do by
    flipping a switch on a settings page.
    """

    image_fields = SYSTEM_IMAGE_FIELDS

    class Meta:
        model = System
        fields = (*SYSTEM_VALUE_FIELDS, *SYSTEM_IMAGE_FIELDS)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Declared dynamically so the tuple above stays the one list. Each is a
        # CharField, not an ImageField: the value is a data URI, and
        # `Base64ImagesMixin` is what validates and writes it. `allow_blank` and
        # `allow_null` are what let the CMS clear an image by sending "".
        for name in SYSTEM_IMAGE_FIELDS:
            self.fields[name] = serializers.CharField(
                required=False, allow_null=True, allow_blank=True
            )

    def validate_social_links(self, value):
        """Reject anything that is not a list of ``{platform, url}`` objects.

        The frontend maps `platform` to an icon and renders `url` into an
        `<a href>`, so a malformed row is a broken link on every page of the
        site rather than a bad value in one place.
        """
        if not isinstance(value, list):
            raise serializers.ValidationError('Must be a list.')
        cleaned = []
        for entry in value:
            if not isinstance(entry, dict):
                raise serializers.ValidationError('Each entry must be an object.')
            url = (entry.get('url') or '').strip()
            if not url:
                raise serializers.ValidationError('Each entry needs a url.')
            if not url.startswith(('http://', 'https://')):
                raise serializers.ValidationError(f'{url!r} must be an http(s) URL.')
            cleaned.append({
                'platform': (entry.get('platform') or '').strip().lower(),
                'url': url,
            })
        return cleaned

    def validate_google_font_url(self, value):
        # The model validator is not run by DRF's ModelSerializer for a URLField
        # that arrives as a plain string, and this value ends up in a
        # `<link rel="stylesheet">` on every page - see the model for why that
        # matters. Enforced here as well, not instead.
        from django.core.exceptions import ValidationError as DjangoValidationError

        from .models import validate_google_font_url

        try:
            validate_google_font_url(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value
