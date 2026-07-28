from django.db import transaction
from rest_framework import serializers

from core.image_sizes import ICON, REGULAR, image_cfg
from core.serializers import (
    Base64ImagesMixin,
    ImageProcessingSerializer,
    file_url,
)

from .models import (
    Category,
    Location,
    Season,
    Species,
    SpeciesImage,
    WeatherCondition,
)

# Every catalog record takes the same two images, at the same two tiers.
_IMAGE_FIELDS = {'image': image_cfg(REGULAR), 'icon': image_cfg(ICON)}

# The base64 field declaration shared by every write serializer below. A plain
# CharField, not the model's ImageField, because the payload is a data URL.
def _base64_field():
    return serializers.CharField(required=False, allow_null=True, allow_blank=True)


class _SlugUniqueMixin:
    """Reject a slug already taken by another row of the same model.

    The database's `unique=True` would raise a 500-shaped IntegrityError; this
    turns it into a field error the CMS can render next to the input.
    """

    def validate_slug(self, value):
        model = self.Meta.model
        qs = model.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f'A {model._meta.verbose_name} with this slug already exists.'
            )
        return value


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class CategorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    species_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'kind', 'kind_display', 'name', 'en_name', 'slug', 'scientific_name',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'fit', 'background_color',
            'is_featured', 'sort_order', 'species_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))

    def get_icon(self, obj):
        return file_url(obj.icon, self.context.get('request'))

    def get_species_count(self, obj):
        return obj.species.filter(enabled=True).count()


class CategoryWriteSerializer(_SlugUniqueMixin, Base64ImagesMixin, serializers.ModelSerializer):
    image = _base64_field()
    icon = _base64_field()
    image_fields = _IMAGE_FIELDS

    class Meta:
        model = Category
        fields = [
            'kind', 'name', 'en_name', 'slug', 'scientific_name',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'fit', 'background_color',
            'is_featured', 'sort_order', 'enabled',
        ]


# ---------------------------------------------------------------------------
# Species images
# ---------------------------------------------------------------------------

class SpeciesImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = SpeciesImage
        fields = [
            'id', 'image', 'name', 'en_name', 'description', 'en_description',
            'fit', 'background_color', 'sort_order',
        ]

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))


class SpeciesImageWriteSerializer(serializers.Serializer):
    image = serializers.CharField()
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_image(self, value):
        sub = ImageProcessingSerializer(data={'base64_image': value}, **image_cfg(REGULAR))
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, species):
        # Atomic so a failed image write (an unwritable MEDIA_ROOT, an R2 outage)
        # rolls the row back instead of leaving a gallery entry with no picture.
        with transaction.atomic():
            instance = SpeciesImage(
                species=species,
                name=self.validated_data.get('name'),
                en_name=self.validated_data.get('en_name'),
                description=self.validated_data.get('description'),
                en_description=self.validated_data.get('en_description'),
                sort_order=self.validated_data.get('sort_order', 0),
            )
            instance.save()

            proc = ImageProcessingSerializer(
                data={'base64_image': self.validated_data['image']},
                **image_cfg(REGULAR),
            )
            proc.is_valid()
            proc.save_to_field(instance.image, f'species_{species.pk}_img_{instance.pk}')
            instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# Species
# ---------------------------------------------------------------------------

class SpeciesSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    images = SpeciesImageSerializer(many=True, read_only=True)
    # `kind` is read through the category (Species has no column of its own -
    # see the note on catalog.models.KIND_CHOICES), but the frontend filters and
    # routes on it, so it is flattened onto the payload here.
    kind = serializers.CharField(source='category.kind', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    # The flattened category label needs its English twin too, or a species card
    # rendered in English would carry a Spanish breadcrumb.
    category_en_name = serializers.CharField(source='category.en_name', read_only=True, default=None)
    category_slug = serializers.SlugRelatedField(source='category', slug_field='slug', read_only=True)
    sighting_count = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()

    class Meta:
        model = Species
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'category', 'category_name', 'category_en_name', 'category_slug', 'kind',
            'name', 'en_name', 'slug', 'scientific_name', 'family',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href', 'video_link',
            'image', 'icon', 'images', 'fit', 'background_color',
            'is_featured', 'sort_order',
            'sighting_count', 'last_seen',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))

    def get_icon(self, obj):
        return file_url(obj.icon, self.context.get('request'))

    def get_sighting_count(self, obj):
        return obj.sightings.filter(enabled=True).count()

    def get_last_seen(self, obj):
        latest = obj.sightings.filter(enabled=True).order_by('-date').first()
        return latest.date if latest else None


class SpeciesWriteSerializer(_SlugUniqueMixin, Base64ImagesMixin, serializers.ModelSerializer):
    image = _base64_field()
    icon = _base64_field()
    image_fields = _IMAGE_FIELDS

    class Meta:
        model = Species
        fields = [
            'category', 'name', 'en_name', 'slug', 'scientific_name', 'family',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href', 'video_link',
            'image', 'icon', 'fit', 'background_color',
            'is_featured', 'sort_order', 'enabled',
        ]


# ---------------------------------------------------------------------------
# Season
# ---------------------------------------------------------------------------

class SeasonSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    sighting_count = serializers.SerializerMethodField()

    class Meta:
        model = Season
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug', 'months',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'fit', 'background_color',
            'sort_order', 'sighting_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))

    def get_icon(self, obj):
        return file_url(obj.icon, self.context.get('request'))

    def get_sighting_count(self, obj):
        return obj.sightings.filter(enabled=True).count()


class SeasonWriteSerializer(_SlugUniqueMixin, Base64ImagesMixin, serializers.ModelSerializer):
    image = _base64_field()
    icon = _base64_field()
    image_fields = _IMAGE_FIELDS

    class Meta:
        model = Season
        fields = [
            'name', 'en_name', 'slug', 'months',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'fit', 'background_color',
            'sort_order', 'enabled',
        ]

    def validate_months(self, value):
        # Mirrors Season.clean(), which only runs in the admin. Without this the
        # API would happily store [13] or ["autumn"] and Season.for_date would
        # then silently never match.
        if not isinstance(value, list):
            raise serializers.ValidationError('Must be a list of month numbers.')
        for month in value:
            if not isinstance(month, int) or isinstance(month, bool) or not 1 <= month <= 12:
                raise serializers.ValidationError('Each month must be an integer from 1 to 12.')
        return value


# ---------------------------------------------------------------------------
# Weather conditions
# ---------------------------------------------------------------------------

class WeatherConditionSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    sighting_count = serializers.SerializerMethodField()

    class Meta:
        model = WeatherCondition
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'fit', 'background_color',
            'sort_order', 'sighting_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))

    def get_icon(self, obj):
        return file_url(obj.icon, self.context.get('request'))

    def get_sighting_count(self, obj):
        return obj.sightings.filter(enabled=True).count()


class WeatherConditionWriteSerializer(_SlugUniqueMixin, Base64ImagesMixin, serializers.ModelSerializer):
    image = _base64_field()
    icon = _base64_field()
    image_fields = _IMAGE_FIELDS

    class Meta:
        model = WeatherCondition
        fields = [
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'fit', 'background_color',
            'sort_order', 'enabled',
        ]


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

class LocationSerializer(serializers.ModelSerializer):
    place_type_display = serializers.CharField(source='get_place_type_display', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)
    parent_en_name = serializers.CharField(source='parent.en_name', read_only=True, default=None)
    parent_slug = serializers.SlugRelatedField(source='parent', slug_field='slug', read_only=True)
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    sighting_count = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description',
            'parent', 'parent_name', 'parent_en_name', 'parent_slug',
            'place_type', 'place_type_display',
            'latitude', 'longitude', 'region', 'country', 'map_link',
            'hide_precise_location', 'is_featured', 'sort_order', 'sighting_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    # Coordinates are blurred for **every** caller, staff included, when the
    # place is flagged sensitive. Not because staff shouldn't see them - they can,
    # in the Django admin - but because these payloads are cached under one key
    # per resource: a staff-only precise variant would be written into the same
    # cache and then served to the next anonymous visitor. Exact coordinates
    # never entering the API response is the only version of this that cannot
    # leak. See Location.hide_precise_location.
    def get_latitude(self, obj):
        return self._coordinate(obj, obj.latitude)

    def get_longitude(self, obj):
        return self._coordinate(obj, obj.longitude)

    # Coordinates are the one decimal in this API published as a JSON **number**
    # rather than DRF's decimal-as-string: every map library takes numbers, and a
    # string here would mean a parseFloat at every call site. Other decimals
    # (temperature) keep the string form, where exactness matters more than
    # arithmetic convenience.
    @staticmethod
    def _coordinate(obj, value):
        from journal.models import round_coordinate

        if value is None:
            return None
        if obj.hide_precise_location:
            value = round_coordinate(value)
        return float(value)

    def get_sighting_count(self, obj):
        return obj.sightings.filter(enabled=True).count()


class LocationWriteSerializer(_SlugUniqueMixin, serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = [
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description',
            'parent', 'place_type',
            'latitude', 'longitude', 'region', 'country', 'map_link',
            'hide_precise_location', 'is_featured', 'sort_order', 'enabled',
        ]

    def validate_parent(self, value):
        if self.instance and value is not None and value.pk == self.instance.pk:
            raise serializers.ValidationError('A location cannot be its own parent.')
        return value
