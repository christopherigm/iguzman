import os

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from core.contributions import (
    MAX_TEXT_LENGTH,
    ContributionSerializer,
    photos_field,
)
from core.image_sizes import MEDIUM, image_cfg, photo_cfg
from core.serializers import (
    Base64ImagesMixin,
    ImageProcessingSerializer,
    file_url,
    gallery_image_url,
)
from core.slugs import unique_slug

from .models import (
    PROCESSING_FAILED,
    PROCESSING_PENDING,
    PROCESSING_PROCESSING,
    PROCESSING_READY,
    Sighting,
    SightingMedia,
    round_coordinate,
)

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
    # The *derived* status, not the stored column: a clip whose handler died is
    # reported failed rather than transcoding forever. See
    # `SightingMedia.effective_processing_status`.
    processing_status = serializers.CharField(
        source='effective_processing_status', read_only=True
    )

    class Meta:
        model = SightingMedia
        fields = [
            'id', 'kind', 'name', 'en_name', 'description', 'en_description',
            'image', 'file', 'poster', 'url', 'source_url',
            'duration_seconds', 'fit', 'background_color', 'sort_order',
            'processing_status', 'processing_error',
            'width', 'height', 'size_bytes',
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
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    duration_seconds = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate(self, attrs):
        kind = attrs.get('kind', 'image')
        if kind == 'image' and not attrs.get('image'):
            raise serializers.ValidationError({'image': 'Required when kind is "image".'})
        if kind == 'link' and not attrs.get('url'):
            raise serializers.ValidationError({'url': 'Required when kind is "link".'})

        # The photo at the shared photo tier; the poster stays at MEDIUM - it is
        # the frame behind a play button, not a picture anyone opens.
        for field, cfg in (('image', photo_cfg()), ('poster', image_cfg(MEDIUM))):
            raw = attrs.get(field)
            if not raw:
                continue
            sub = ImageProcessingSerializer(data={'base64_image': raw}, **cfg)
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
                en_name=data.get('en_name'),
                description=data.get('description'),
                en_description=data.get('en_description'),
                duration_seconds=data.get('duration_seconds'),
                sort_order=data.get('sort_order', 0),
            )
            instance.save()

            written = []
            for field, cfg in (('image', photo_cfg()), ('poster', image_cfg(MEDIUM))):
                raw = data.get(field)
                if not raw:
                    continue
                proc = ImageProcessingSerializer(data={'base64_image': raw}, **cfg)
                proc.is_valid()
                proc.save_to_field(
                    getattr(instance, field),
                    f'sighting_{sighting.pk}_media_{instance.pk}_{field}',
                )
                written.append(field)
            if written:
                instance.save(update_fields=written)
        return instance


class SightingVideoReserveSerializer(serializers.Serializer):
    """Reserve an empty ``video`` row for a clip that is about to be uploaded.

    **No file travels through this API.** The clip goes to the handler in
    ``apps/animals``, which uploads it in chunks onto its own disk, transcodes it
    and PUTs the result to R2 - see this project's CLAUDE.md. What this endpoint
    does is create the row, in ``pending``, so the handler has a pk to report
    against and the CMS has something to show while the work runs.

    The multipart endpoint this replaced could not survive the change: a source
    clip is now measured in GB, which neither Cloudflare's body cap nor a sync
    gunicorn worker will carry, and there is no ffmpeg on this side to process it
    with.

    ``filename`` and ``size_bytes`` describe the *source* the browser picked, and
    are validated here so a contributor is refused before uploading rather than
    after. The handler re-checks both against the bytes that actually arrive.
    """

    filename = serializers.CharField(max_length=255)
    size_bytes = serializers.IntegerField(min_value=1)
    # What the browser read off the file's own metadata. Advisory - a crafted
    # request can lie - so `ffprobe` in the handler is what actually enforces it.
    # Asking anyway is what lets an over-long clip be refused in the picker
    # instead of after a multi-GB upload.
    duration_seconds = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def __init__(self, *args, is_contribution=False, **kwargs):
        # The two callers differ only in their limits: an author who uploads a
        # ten-minute clip has decided to, a contributor's phone hands over
        # whatever it recorded.
        self.is_contribution = is_contribution
        super().__init__(*args, **kwargs)

    def validate_filename(self, value):
        ext = os.path.splitext(value)[1].lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise serializers.ValidationError(
                'Unsupported video format. Allowed: '
                + ', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))
            )
        return value

    def validate_size_bytes(self, value):
        max_bytes = settings.MAX_VIDEO_UPLOAD_MB * 1024 * 1024
        if value > max_bytes:
            raise serializers.ValidationError(
                f'Video is too large (max {settings.MAX_VIDEO_UPLOAD_MB} MB).'
            )
        return value

    def validate_duration_seconds(self, value):
        if (
            self.is_contribution
            and value is not None
            and value > settings.MAX_CONTRIBUTION_VIDEO_SECONDS
        ):
            raise serializers.ValidationError(
                f'Video is too long (max {settings.MAX_CONTRIBUTION_VIDEO_SECONDS} seconds).'
            )
        return value

    def save(self, sighting):
        data = self.validated_data
        with transaction.atomic():
            instance = SightingMedia.objects.create(
                sighting=sighting,
                kind='video',
                name=data.get('name'),
                en_name=data.get('en_name'),
                description=data.get('description'),
                en_description=data.get('en_description'),
                duration_seconds=data.get('duration_seconds'),
                sort_order=data.get('sort_order', 0),
                processing_status=PROCESSING_PENDING,
            )
        return instance


class SightingVideoProcessingSerializer(serializers.Serializer):
    """The handler reporting where a transcode got to.

    Written by ``apps/animals``' server side, not by a browser - which is why the
    view behind it authenticates with ``VIDEO_HANDLER_TOKEN`` rather than a user's
    session. A transcode outlives the request that started it, and often the
    session too.

    Only the columns the pipeline owns are writable here. Notably **not** the
    caption, the sort order or anything an author edits: a status callback
    arriving late must never overwrite an edit made while the clip was encoding.
    """

    status = serializers.ChoiceField(
        choices=[PROCESSING_PROCESSING, PROCESSING_READY, PROCESSING_FAILED]
    )
    # A short code, never ffmpeg's stderr - see the note on the model field.
    error = serializers.CharField(max_length=32, required=False, allow_null=True, allow_blank=True)
    # Where the transcoded object landed in the bucket. The handler PUTs it
    # itself, so this is a key to record rather than a file to receive.
    file_key = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    poster_key = serializers.CharField(max_length=512, required=False, allow_null=True, allow_blank=True)
    duration_seconds = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    width = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    height = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    size_bytes = serializers.IntegerField(min_value=0, required=False, allow_null=True)

    def validate(self, attrs):
        if attrs['status'] == PROCESSING_READY and not attrs.get('file_key'):
            raise serializers.ValidationError(
                {'file_key': 'Required when reporting a finished transcode.'}
            )
        return attrs

    def save(self, media):
        data = self.validated_data
        status = data['status']

        media.processing_status = status
        media.processing_error = data.get('error') or None

        # `FileField.name` rather than `.save()`: the handler already PUT the
        # object into the bucket, so this records where it is. Assigning the file
        # itself would re-upload bytes this API never held.
        if data.get('file_key'):
            media.file.name = data['file_key']
        if data.get('poster_key'):
            media.poster.name = data['poster_key']

        for field in ('duration_seconds', 'width', 'height', 'size_bytes'):
            if data.get(field) is not None:
                setattr(media, field, data[field])

        media.save()
        return media


class SightingMediaUpdateSerializer(serializers.ModelSerializer):
    """Metadata-only edits to an existing media row (caption, order, poster URL).

    Deliberately cannot replace the binary: swapping the file behind a row would
    leave the previous object orphaned in the bucket. Delete the row and add a
    new one instead.
    """

    class Meta:
        model = SightingMedia
        fields = [
            'name', 'en_name', 'description', 'en_description', 'url',
            'duration_seconds', 'sort_order', 'enabled', 'fit', 'background_color',
        ]


# ---------------------------------------------------------------------------
# Sightings
# ---------------------------------------------------------------------------

class SightingSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    # The cover an author *chose*, as opposed to the one `image` resolves to.
    # Same argument as `catalog.serializers._MainImageMixin` - which this cannot
    # reuse, for the same reason `sighting_cover_url` is not `gallery_image_url`:
    # a sighting's photographs are `media` rows carrying a `kind`, not `images`.
    # The CMS's Main Image uploader hydrates from this so it is empty exactly
    # when the column is, rather than showing a photo nobody picked.
    main_image = serializers.SerializerMethodField()
    media = SightingMediaSerializer(many=True, read_only=True)

    # Every flattened relation label travels as a Spanish/English pair, for the
    # same reason the row's own fields do: a feed card renders entirely from this
    # payload, so an English reader given only `species_name` would get a Spanish
    # species beside an English story. The frontend picks per locale, falling
    # back to the bare field when the `en_` twin is blank.
    species_name = serializers.CharField(source='species.name', read_only=True, default=None)
    species_en_name = serializers.CharField(source='species.en_name', read_only=True, default=None)
    species_slug = serializers.SlugRelatedField(source='species', slug_field='slug', read_only=True)
    species_image = serializers.SerializerMethodField()
    # The glyphs a map marker is drawn as, the same three fields (and the same
    # getters) `SightingMapSerializer` publishes. An entry's own page pins it on
    # a map too, and that marker wears the species' icon exactly as it does on
    # the maps of many entries - without these it would have to re-fetch the
    # whole map endpoint to dress one pin it already has the coordinates for.
    species_icon = serializers.SerializerMethodField()
    # Flattened from species.category so a feed card can show its branch and
    # sub-category without a second request.
    kind = serializers.CharField(source='species.category.kind', read_only=True, default=None)
    category = serializers.IntegerField(source='species.category_id', read_only=True, default=None)
    category_name = serializers.CharField(source='species.category.name', read_only=True, default=None)
    category_en_name = serializers.CharField(source='species.category.en_name', read_only=True, default=None)
    category_slug = serializers.CharField(source='species.category.slug', read_only=True, default=None)
    category_icon = serializers.SerializerMethodField()
    category_color = serializers.CharField(
        source='species.category.background_color', read_only=True, default=None
    )

    location_name = serializers.CharField(source='location.name', read_only=True, default=None)
    location_en_name = serializers.CharField(source='location.en_name', read_only=True, default=None)
    location_slug = serializers.CharField(source='location.slug', read_only=True, default=None)
    season_name = serializers.CharField(source='season.name', read_only=True, default=None)
    season_en_name = serializers.CharField(source='season.en_name', read_only=True, default=None)
    season_slug = serializers.CharField(source='season.slug', read_only=True, default=None)
    weather_name = serializers.CharField(source='weather.name', read_only=True, default=None)
    weather_en_name = serializers.CharField(source='weather.en_name', read_only=True, default=None)
    weather_slug = serializers.CharField(source='weather.slug', read_only=True, default=None)

    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    coordinates_are_approximate = serializers.BooleanField(
        source='coordinates_are_sensitive', read_only=True
    )
    media_count = serializers.SerializerMethodField()

    # ---- The credit line ----------------------------------------------------
    # Derived from the filing account's first name; there is no stored
    # `author_name` column any more. Two things make deriving it here safe, where
    # blurring a sensitive coordinate at render time would not be:
    #
    # * It does **not** vary by who is asking. This payload is cached under a key
    #   that varies only by the query params and the resolved disabled-visibility
    #   (see core/views.py), so anything reading differently for an administrator
    #   would be filled once by an admin request and then replayed to every
    #   anonymous visitor from the same entry. Every caller gets the same string
    #   here, so there is nothing to replay wrongly.
    # * It publishes a **first name and nothing else**. The FK itself - the id,
    #   the email, the username - never leaves this API in any form.
    #
    # `author_anonymous` therefore suppresses the name at render rather than at
    # write, which is what lets a contributor change their mind afterwards. It
    # still travels on the payload so the CMS can tell "chose not to be credited"
    # from "nobody was recorded" - an administrator must not read the first as an
    # invitation to name them.
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Sighting
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'species', 'species_name', 'species_en_name', 'species_slug', 'species_image',
            'species_icon',
            'kind', 'category', 'category_name', 'category_en_name', 'category_slug',
            'category_icon', 'category_color',
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'date', 'time',
            'location', 'location_name', 'location_en_name', 'location_slug',
            'latitude', 'longitude', 'coordinates_are_approximate',
            'season', 'season_name', 'season_en_name', 'season_slug',
            'weather', 'weather_name', 'weather_en_name', 'weather_slug',
            'temperature_c', 'individuals',
            'image', 'main_image', 'media', 'media_count', 'fit', 'background_color',
            'is_featured',
            'author_name', 'author_anonymous', 'is_contribution',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return sighting_cover_url(obj, self.context.get('request'))

    def get_main_image(self, obj):
        return file_url(obj.image, self.context.get('request'))

    def get_species_image(self, obj):
        # Through the same fallback the species' own payload uses, or a species
        # whose photos were all uploaded to its gallery would show a blank
        # thumbnail on every entry that references it.
        if not obj.species_id:
            return None
        return gallery_image_url(obj.species, self.context.get('request'))

    def get_species_icon(self, obj):
        """The species' glyph - what a marker for this entry is drawn as.

        ``icon`` is a single field, never the gallery (see the CLAUDE.md note on
        covers), so this is ``file_url`` rather than ``gallery_image_url``: a
        128 px mark is the point, and falling back to a photograph would put a
        cropped landscape inside a 34 px pin.
        """
        if not obj.species_id:
            return None
        return file_url(obj.species.icon, self.context.get('request'))

    def get_category_icon(self, obj):
        """The branch's glyph - the fallback for a species with none of its own."""
        if not obj.species_id or not obj.species.category_id:
            return None
        return file_url(obj.species.category.icon, self.context.get('request'))

    def get_media_count(self, obj):
        return len(obj.media.all())

    def get_author_name(self, obj):
        """The contributor's first name, or ``''`` when there is nobody to credit.

        Three cases collapse into the empty string, and the frontend renders all
        three the same way - no byline at all: the contributor asked not to be
        credited, the entry was authored in the CMS (``created_by`` is null), and
        the account never filled in a first name (it is optional at sign-up).
        Only the first name is published; never the surname, the email or the id.
        """
        if obj.author_anonymous or not obj.created_by_id:
            return ''
        return (obj.created_by.first_name or '').strip()

    # The *effective* coordinates: this sighting's own if it has them, otherwise
    # the location's centre - which is what a map pin needs and saves the
    # frontend from re-implementing the fallback. Blurred to ~1 km for every
    # caller when the place is flagged sensitive; see LocationSerializer for why
    # that is not conditional on who is asking.
    def get_latitude(self, obj):
        return self._coordinate(obj, 0)

    def get_longitude(self, obj):
        return self._coordinate(obj, 1)

    def get_latitude(self, obj):
        return effective_coordinate(obj, 0)

    def get_longitude(self, obj):
        return effective_coordinate(obj, 1)


def sighting_cover_url(obj, request=None):
    """The entry's cover: its own ``image`` column, else its first photo.

    ``core.serializers.gallery_image_url`` is the same rule for every *catalog*
    record and cannot be reused here: it reads ``obj.images``, and a sighting's
    gallery is ``media`` - one table holding photos, uploaded clips and video
    links together, so the fallback has to skip everything whose ``kind`` is not
    an image.

    Sorted in Python rather than with an ``order_by`` for the reason that helper
    gives: the views prefetch this list, and a queryset call here would re-query
    once per row of a list response.
    """
    if obj.image:
        return file_url(obj.image, request)
    photo = next(
        (m for m in sorted(obj.media.all(), key=lambda m: (m.sort_order, m.id))
         if m.kind == 'image' and m.image),
        None,
    )
    return file_url(photo.image, request) if photo else None


# Published as a JSON number, not DRF's decimal-as-string - see the matching
# note in catalog.serializers.LocationSerializer. Module-level rather than a
# method because two serializers publish the same pair: the feed's, and the map
# endpoint's stripped-down pin. A pin that resolved coordinates its own way
# would eventually disagree with the entry's own page about where it happened.
def effective_coordinate(obj, index):
    coords = obj.coordinates
    if coords is None:
        return None
    value = coords[index]
    if obj.coordinates_are_sensitive:
        value = round_coordinate(value)
    return float(value)


# ---------------------------------------------------------------------------
# Map pins
# ---------------------------------------------------------------------------

class SightingMapSerializer(serializers.ModelSerializer):
    """One marker on a map: where, what, and enough to label it.

    Deliberately **not** ``SightingSerializer``. A map draws hundreds of these at
    once and needs none of the prose, the gallery or the field conditions - a
    category page's map would otherwise ship every photo caption of every entry
    it pins. What it does need that the feed has no use for is the **species
    icon**, which is what a marker is drawn as.
    """

    species_name = serializers.CharField(source='species.name', read_only=True, default=None)
    species_en_name = serializers.CharField(source='species.en_name', read_only=True, default=None)
    species_slug = serializers.CharField(source='species.slug', read_only=True, default=None)
    species_icon = serializers.SerializerMethodField()

    kind = serializers.CharField(source='species.category.kind', read_only=True, default=None)
    category = serializers.IntegerField(source='species.category_id', read_only=True, default=None)
    category_name = serializers.CharField(source='species.category.name', read_only=True, default=None)
    category_en_name = serializers.CharField(source='species.category.en_name', read_only=True, default=None)
    category_slug = serializers.CharField(source='species.category.slug', read_only=True, default=None)
    category_icon = serializers.SerializerMethodField()
    # The marker's fallback colour when neither the species nor its category has
    # an icon: a coloured dot that still groups by branch beats a grey one.
    category_color = serializers.CharField(
        source='species.category.background_color', read_only=True, default=None
    )

    location_name = serializers.CharField(source='location.name', read_only=True, default=None)
    location_en_name = serializers.CharField(source='location.en_name', read_only=True, default=None)
    location_slug = serializers.CharField(source='location.slug', read_only=True, default=None)

    image = serializers.SerializerMethodField()
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    coordinates_are_approximate = serializers.BooleanField(
        source='coordinates_are_sensitive', read_only=True
    )

    class Meta:
        model = Sighting
        fields = [
            'id', 'slug', 'name', 'en_name', 'date',
            'species', 'species_name', 'species_en_name', 'species_slug', 'species_icon',
            'kind', 'category', 'category_name', 'category_en_name', 'category_slug',
            'category_icon', 'category_color',
            'location', 'location_name', 'location_en_name', 'location_slug',
            'latitude', 'longitude', 'coordinates_are_approximate',
            'image',
        ]

    def get_species_icon(self, obj):
        """The species' glyph - what the marker is drawn as.

        ``icon`` is a single field, never the gallery (see the CLAUDE.md note on
        covers), so this is ``file_url`` rather than ``gallery_image_url``: a
        128 px mark is the point here, and falling back to a photograph would put
        a cropped landscape inside a 28 px circle.
        """
        if not obj.species_id:
            return None
        return file_url(obj.species.icon, self.context.get('request'))

    def get_category_icon(self, obj):
        if not obj.species_id or not obj.species.category_id:
            return None
        return file_url(obj.species.category.icon, self.context.get('request'))

    def get_image(self, obj):
        """The entry's cover, for the marker's popup card."""
        return sighting_cover_url(obj, self.context.get('request'))

    def get_latitude(self, obj):
        return effective_coordinate(obj, 0)

    def get_longitude(self, obj):
        return effective_coordinate(obj, 1)


class SightingWriteSerializer(Base64ImagesMixin, serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    image_fields = {'image': photo_cfg()}

    class Meta:
        model = Sighting
        fields = [
            'species', 'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'date', 'time', 'location', 'latitude', 'longitude',
            'season', 'weather', 'temperature_c', 'individuals',
            'image', 'fit', 'background_color', 'is_featured', 'enabled',
            # The credit line itself is not editable here - it is the filing
            # account's own first name, so a misspelling is fixed on that account
            # rather than overwritten on each entry it filed. Only the
            # contributor's *answer* is, so a reviewer can honour a later "please
            # don't credit me". `created_by` and `is_contribution` stay out
            # entirely: they record how the row came to exist, which no edit
            # should rewrite.
            'author_anonymous',
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


class SightingContributeSerializer(ContributionSerializer):
    """What a signed-in reader may file as a new journal entry.

    A sibling of ``SightingWriteSerializer``, not a subclass - see
    ``core/contributions.py`` for why. What it withholds:

    * **``slug``** is derived from the title (or the species name, for the
      untitled entry the frontend treats as normal).
    * **``enabled``, ``is_featured``** are the administrator's; ``create``
      hard-codes both, so a contribution is a pending draft and can never file
      itself onto the landing page.
    * **``href``** - an outbound URL on a row anyone may create is link spam with
      no upside here.
    * **``season``** is not asked for and not writable: ``Sighting.save()``
      derives it from the date, which is the right answer for a contributor and
      one fewer dropdown in the flow.
    * **``en_*``** twins - a contributor writes in one language, into the base
      column, and ``localized()`` falls back to it for every locale.

    ``author_anonymous`` is the one thing it takes that the catalog's contribute
    serializer does not: a species is a shared reference record with nobody to
    credit, an encounter belongs to whoever was standing there. The **name** is
    not asked for at all - it is the filing account's own first name, resolved
    when the entry is read - so this flag is the whole of the credit question a
    contributor is put.
    """

    photos = photos_field()
    photo_write_serializer_class = SightingMediaWriteSerializer

    description = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_TEXT_LENGTH
    )
    short_description = serializers.CharField(
        required=False, allow_blank=True, max_length=500
    )

    class Meta:
        model = Sighting
        fields = [
            'species', 'name', 'description', 'short_description',
            'date', 'time', 'location', 'latitude', 'longitude',
            'weather', 'temperature_c', 'individuals',
            'author_anonymous', 'photos',
        ]

    def validate_species(self, value):
        # A species awaiting review is not yet part of the catalog, so an entry
        # filed against it would be pending on something that may never exist -
        # and if the species were rejected, `PROTECT` would leave the sighting
        # holding a row nobody can delete.
        if not value.enabled:
            raise serializers.ValidationError('This species is not available.')
        return value

    def validate_date(self, value):
        from django.utils import timezone

        # A field journal records what happened, so tomorrow is not a date an
        # encounter can have. Checked against the server's own day; a contributor
        # a timezone ahead can still be a day out, which is why this is a bound
        # rather than an exact test.
        if value > timezone.localdate():
            raise serializers.ValidationError('An encounter cannot be in the future.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        lat = attrs.get('latitude')
        lng = attrs.get('longitude')
        if (lat is None) != (lng is None):
            raise serializers.ValidationError(
                {'latitude': 'Latitude and longitude must be set together.'}
            )
        if not attrs.get('location') and lat is None:
            # Neither a place nor a pin: the entry would be unmappable and
            # unfilterable, which is most of what the journal does with it.
            raise serializers.ValidationError(
                {'location': 'Pick a place, or drop a pin on the map.'}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        photos = validated_data.pop('photos', [])
        anonymous = validated_data.pop('author_anonymous', False)

        species = validated_data['species']
        instance = Sighting(
            **validated_data,
            slug=unique_slug(
                Sighting,
                validated_data.get('name') or species.name,
                fallback='sighting',
            ),
            author_anonymous=anonymous,
            # The credit line comes from this account when the entry is read -
            # there is no name to store here. See SightingSerializer.
            created_by=self._request_user(),
            is_contribution=True,
            enabled=False,
            is_featured=False,
        )
        instance.save()
        self._write_photos(instance, photos)
        return instance
