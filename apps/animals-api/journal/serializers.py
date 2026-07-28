import os

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from core.image_sizes import MEDIUM, REGULAR, image_cfg
from core.serializers import (
    Base64ImagesMixin,
    ImageProcessingSerializer,
    file_url,
)

from .models import Sighting, SightingMedia, round_coordinate

# Container formats a browser can play natively. Anything else would upload
# fine and then fail silently in a <video> tag, which is a worse outcome than a
# 400 at upload time.
ALLOWED_VIDEO_EXTENSIONS = {'.mp4', '.webm', '.mov', '.m4v'}


# ---------------------------------------------------------------------------
# Sighting media
# ---------------------------------------------------------------------------

class SightingMediaSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    file = serializers.SerializerMethodField()
    poster = serializers.SerializerMethodField()
    # One URL to point a player or an <img> at, whatever the kind - so the
    # frontend renders a gallery without a three-way branch per tile.
    source_url = serializers.SerializerMethodField()

    class Meta:
        model = SightingMedia
        fields = [
            'id', 'kind', 'name', 'description',
            'image', 'file', 'poster', 'url', 'source_url',
            'duration_seconds', 'fit', 'background_color', 'sort_order',
        ]

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))

    def get_file(self, obj):
        return file_url(obj.file, self.context.get('request'))

    def get_poster(self, obj):
        return file_url(obj.poster, self.context.get('request'))

    def get_source_url(self, obj):
        request = self.context.get('request')
        if obj.kind == 'link':
            return obj.url or None
        field = obj.file if obj.kind == 'video' else obj.image
        return file_url(field, request)


class SightingMediaWriteSerializer(serializers.Serializer):
    """Create an ``image`` or ``link`` media row from a JSON body.

    Uploaded video files are **not** handled here - see
    ``SightingVideoUploadSerializer``. A video is far past
    ``DATA_UPLOAD_MAX_MEMORY_SIZE``, so base64 in a JSON body is not an option
    for it; it needs its own multipart endpoint.
    """

    kind = serializers.ChoiceField(choices=['image', 'link'], default='image')
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    poster = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    url = serializers.URLField(max_length=500, required=False, allow_null=True, allow_blank=True)
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    duration_seconds = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate(self, attrs):
        kind = attrs.get('kind', 'image')
        if kind == 'image' and not attrs.get('image'):
            raise serializers.ValidationError({'image': 'Required when kind is "image".'})
        if kind == 'link' and not attrs.get('url'):
            raise serializers.ValidationError({'url': 'Required when kind is "link".'})

        for field, tier in (('image', REGULAR), ('poster', MEDIUM)):
            raw = attrs.get(field)
            if not raw:
                continue
            sub = ImageProcessingSerializer(data={'base64_image': raw}, **image_cfg(tier))
            if not sub.is_valid():
                raise serializers.ValidationError({field: sub.errors['base64_image']})
        return attrs

    def save(self, sighting):
        data = self.validated_data
        # Atomic so a failed image write rolls the row back rather than leaving a
        # gallery tile that renders as a broken frame.
        with transaction.atomic():
            instance = SightingMedia(
                sighting=sighting,
                kind=data.get('kind', 'image'),
                url=data.get('url') or None,
                name=data.get('name'),
                description=data.get('description'),
                duration_seconds=data.get('duration_seconds'),
                sort_order=data.get('sort_order', 0),
            )
            instance.save()

            written = []
            for field, tier in (('image', REGULAR), ('poster', MEDIUM)):
                raw = data.get(field)
                if not raw:
                    continue
                proc = ImageProcessingSerializer(data={'base64_image': raw}, **image_cfg(tier))
                proc.is_valid()
                proc.save_to_field(
                    getattr(instance, field),
                    f'sighting_{sighting.pk}_media_{instance.pk}_{field}',
                )
                written.append(field)
            if written:
                instance.save(update_fields=written)
        return instance


class SightingVideoUploadSerializer(serializers.Serializer):
    """Create a ``video`` media row from a multipart upload.

    Separate from the JSON path above because a video file cannot be base64'd
    into a request body: Django would reject it at ``DATA_UPLOAD_MAX_MEMORY_SIZE``
    and, below that limit, would hold the whole thing in memory as a string.
    Multipart streams it to a temp file instead.
    """

    file = serializers.FileField()
    poster = serializers.ImageField(required=False, allow_null=True)
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    duration_seconds = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_file(self, value):
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise serializers.ValidationError(
                'Unsupported video format. Allowed: '
                + ', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))
            )
        max_bytes = settings.MAX_VIDEO_UPLOAD_MB * 1024 * 1024
        if value.size > max_bytes:
            raise serializers.ValidationError(
                f'Video is too large (max {settings.MAX_VIDEO_UPLOAD_MB} MB).'
            )
        return value

    def save(self, sighting):
        data = self.validated_data
        with transaction.atomic():
            instance = SightingMedia(
                sighting=sighting,
                kind='video',
                name=data.get('name'),
                description=data.get('description'),
                duration_seconds=data.get('duration_seconds'),
                sort_order=data.get('sort_order', 0),
            )
            instance.file = data['file']
            poster = data.get('poster')
            if poster is not None:
                # Assigned, not written through ImageProcessingSerializer: an
                # uncommitted file assignment is exactly the case
                # ResizedImageField.pre_save does resize, so the MEDIUM tier on
                # the model field applies here.
                instance.poster = poster
            instance.save()
        return instance


class SightingMediaUpdateSerializer(serializers.ModelSerializer):
    """Metadata-only edits to an existing media row (caption, order, poster URL).

    Deliberately cannot replace the binary: swapping the file behind a row would
    leave the previous object orphaned in the bucket. Delete the row and add a
    new one instead.
    """

    class Meta:
        model = SightingMedia
        fields = ['name', 'description', 'url', 'duration_seconds', 'sort_order', 'enabled', 'fit', 'background_color']


# ---------------------------------------------------------------------------
# Sightings
# ---------------------------------------------------------------------------

class SightingSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    media = SightingMediaSerializer(many=True, read_only=True)

    species_name = serializers.CharField(source='species.name', read_only=True, default=None)
    species_slug = serializers.SlugRelatedField(source='species', slug_field='slug', read_only=True)
    species_image = serializers.SerializerMethodField()
    # Flattened from species.category so a feed card can show its branch and
    # sub-category without a second request.
    kind = serializers.CharField(source='species.category.kind', read_only=True, default=None)
    category = serializers.IntegerField(source='species.category_id', read_only=True, default=None)
    category_name = serializers.CharField(source='species.category.name', read_only=True, default=None)
    category_slug = serializers.CharField(source='species.category.slug', read_only=True, default=None)

    location_name = serializers.CharField(source='location.name', read_only=True, default=None)
    location_slug = serializers.CharField(source='location.slug', read_only=True, default=None)
    season_name = serializers.CharField(source='season.name', read_only=True, default=None)
    season_slug = serializers.CharField(source='season.slug', read_only=True, default=None)
    weather_name = serializers.CharField(source='weather.name', read_only=True, default=None)
    weather_slug = serializers.CharField(source='weather.slug', read_only=True, default=None)

    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    coordinates_are_approximate = serializers.BooleanField(
        source='coordinates_are_sensitive', read_only=True
    )
    media_count = serializers.SerializerMethodField()

    class Meta:
        model = Sighting
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'species', 'species_name', 'species_slug', 'species_image',
            'kind', 'category', 'category_name', 'category_slug',
            'name', 'slug', 'description', 'short_description', 'href',
            'date', 'time',
            'location', 'location_name', 'location_slug',
            'latitude', 'longitude', 'coordinates_are_approximate',
            'season', 'season_name', 'season_slug',
            'weather', 'weather_name', 'weather_slug',
            'temperature_c', 'individuals',
            'image', 'media', 'media_count', 'fit', 'background_color',
            'is_featured',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        """The entry's cover: its own image, else the first gallery photo."""
        request = self.context.get('request')
        if obj.image:
            return file_url(obj.image, request)
        photo = next(
            (m for m in sorted(obj.media.all(), key=lambda m: m.sort_order)
             if m.kind == 'image' and m.image),
            None,
        )
        return file_url(photo.image, request) if photo else None

    def get_species_image(self, obj):
        if not obj.species_id:
            return None
        return file_url(obj.species.image, self.context.get('request'))

    def get_media_count(self, obj):
        return len(obj.media.all())

    # The *effective* coordinates: this sighting's own if it has them, otherwise
    # the location's centre - which is what a map pin needs and saves the
    # frontend from re-implementing the fallback. Blurred to ~1 km for every
    # caller when the place is flagged sensitive; see LocationSerializer for why
    # that is not conditional on who is asking.
    def get_latitude(self, obj):
        return self._coordinate(obj, 0)

    def get_longitude(self, obj):
        return self._coordinate(obj, 1)

    # Published as a JSON number, not DRF's decimal-as-string - see the matching
    # note in catalog.serializers.LocationSerializer.
    @staticmethod
    def _coordinate(obj, index):
        coords = obj.coordinates
        if coords is None:
            return None
        value = coords[index]
        if obj.coordinates_are_sensitive:
            value = round_coordinate(value)
        return float(value)


class SightingWriteSerializer(Base64ImagesMixin, serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    image_fields = {'image': image_cfg(REGULAR)}

    class Meta:
        model = Sighting
        fields = [
            'species', 'name', 'slug', 'description', 'short_description', 'href',
            'date', 'time', 'location', 'latitude', 'longitude',
            'season', 'weather', 'temperature_c', 'individuals',
            'image', 'fit', 'background_color', 'is_featured', 'enabled',
        ]

    def validate_slug(self, value):
        qs = Sighting.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A sighting with this slug already exists.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # Latitude and longitude are only meaningful as a pair - one alone
        # cannot place a pin, and a half-filled coordinate silently falls back to
        # the location's, which looks like a lost edit.
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                {'latitude': 'Latitude and longitude must be set together.'}
            )
        return attrs
