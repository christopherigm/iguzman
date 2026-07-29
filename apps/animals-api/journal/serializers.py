import os

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from core.contributions import (
    MAX_TEXT_LENGTH,
    ContributionSerializer,
    photos_field,
)
from core.image_sizes import MEDIUM, REGULAR, image_cfg
from core.serializers import (
    Base64ImagesMixin,
    ImageProcessingSerializer,
    file_url,
    gallery_image_url,
)
from core.slugs import unique_slug

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
            'id', 'kind', 'name', 'en_name', 'description', 'en_description',
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
                en_name=data.get('en_name'),
                description=data.get('description'),
                en_description=data.get('en_description'),
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
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
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
                en_name=data.get('en_name'),
                description=data.get('description'),
                en_description=data.get('en_description'),
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
        fields = [
            'name', 'en_name', 'description', 'en_description', 'url',
            'duration_seconds', 'sort_order', 'enabled', 'fit', 'background_color',
        ]


# ---------------------------------------------------------------------------
# Sightings
# ---------------------------------------------------------------------------

class SightingSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
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
    # ⚠ `author_name` is published **raw**, and it has to be: this payload is
    # cached under a key that varies only by the query params and the resolved
    # disabled-visibility (see core/views.py), so a field that read differently
    # for an administrator would be filled once by an admin request and then
    # replayed to every anonymous visitor from the same cache entry.
    #
    # That is why an anonymous contribution stores **no name at all** rather than
    # storing one and hiding it here: `author_anonymous` is the contributor's
    # answer to "credit me?", and the write path clears `author_name` when it is
    # true. So there is nothing in this column to leak, and the flag travels only
    # so the CMS can tell "chose not to be credited" from "nobody asked" - an
    # administrator must not helpfully fill in a name against the first.
    #
    # `created_by` is never published in any form. It is the audit trail, and the
    # key a contributor's own list is read by; nothing on the public site needs it.

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
            'image', 'media', 'media_count', 'fit', 'background_color',
            'is_featured',
            'author_name', 'author_anonymous', 'is_contribution',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return sighting_cover_url(obj, self.context.get('request'))

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
    image_fields = {'image': image_cfg(REGULAR)}

    class Meta:
        model = Sighting
        fields = [
            'species', 'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'date', 'time', 'location', 'latitude', 'longitude',
            'season', 'weather', 'temperature_c', 'individuals',
            'image', 'fit', 'background_color', 'is_featured', 'enabled',
            # The credit line is editable in the CMS as well as by a contributor:
            # an author filing someone else's photograph credits them, and an
            # administrator reviewing a contribution may need to correct a
            # misspelt name. `created_by` and `is_contribution` are *not* here -
            # they record how the row came to exist, which no edit should rewrite.
            'author_name', 'author_anonymous',
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

    ``author_name`` and ``author_anonymous`` are the one thing it takes that the
    catalog's contribute serializer does not: a species is a shared reference
    record with nobody to credit, an encounter belongs to whoever was standing
    there. Choosing anonymity **clears the name** rather than hiding it - the read
    serializer explains why that has to happen here rather than at render time.
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
            'author_name', 'author_anonymous', 'photos',
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
        author_name = (validated_data.pop('author_name', '') or '').strip()

        species = validated_data['species']
        instance = Sighting(
            **validated_data,
            slug=unique_slug(
                Sighting,
                validated_data.get('name') or species.name,
                fallback='sighting',
            ),
            author_anonymous=anonymous,
            # Cleared, not merely unpublished - see SightingSerializer.
            author_name='' if anonymous else author_name,
            created_by=self._request_user(),
            is_contribution=True,
            enabled=False,
            is_featured=False,
        )
        instance.save()
        self._write_photos(instance, photos)
        return instance
