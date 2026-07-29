from django.db import transaction
from rest_framework import serializers

from core.contributions import (
    MAX_TEXT_LENGTH,
    ContributionSerializer,
    photos_field,
)
from core.image_sizes import ICON, REGULAR, image_cfg
from core.serializers import (
    Base64ImagesMixin,
    ImageProcessingSerializer,
    file_url,
    gallery_image_url,
)
from core.slugs import unique_slug

from .models import (
    Category,
    CategoryImage,
    County,
    Location,
    LocationImage,
    Season,
    SeasonImage,
    Species,
    SpeciesImage,
    State,
    WeatherCondition,
    WeatherConditionImage,
)

# Every catalog record takes the same two images, at the same two tiers.
_IMAGE_FIELDS = {'image': image_cfg(REGULAR), 'icon': image_cfg(ICON)}

# The base64 field declaration shared by every write serializer below. A plain
# CharField, not the model's ImageField, because the payload is a data URL.
def _base64_field():
    return serializers.CharField(required=False, allow_null=True, allow_blank=True)


# ---------------------------------------------------------------------------
# Gallery images - one shape, five parents
# ---------------------------------------------------------------------------
#
# Category, Species, Season, WeatherCondition and Location each own a `*Image`
# table with the same columns (see ``catalog.models.GalleryImage``), so the read
# and write serializers are declared once and subclassed with a model. A
# per-parent copy of these would be five places for the field list to drift.
#
# They are declared here, above every record serializer, because each record
# embeds its own gallery - `CategorySerializer` is the first reader.

class GalleryImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        fields = [
            'id', 'image', 'name', 'en_name', 'description', 'en_description',
            'fit', 'background_color', 'sort_order',
        ]

    def get_image(self, obj):
        return file_url(obj.image, self.context.get('request'))


class GalleryImageWriteSerializer(serializers.Serializer):
    """Create one gallery row from a base64 payload.

    A plain ``Serializer`` rather than a ``ModelSerializer`` because the image
    arrives as a data URL and is written **after** the row exists - the stored
    filename embeds the pk, which does not exist until then.

    Subclasses set ``model`` and ``parent_field``; ``save(parent)`` does the rest.
    """

    model = None
    parent_field = ''

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

    def save(self, parent):
        # Atomic so a failed image write (an unwritable MEDIA_ROOT, an R2 outage)
        # rolls the row back instead of leaving a gallery entry with no picture.
        with transaction.atomic():
            instance = self.model(
                **{self.parent_field: parent},
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
            proc.save_to_field(
                instance.image,
                f'{self.parent_field}_{parent.pk}_img_{instance.pk}',
            )
            instance.save(update_fields=['image'])
        return instance


class CategoryImageSerializer(GalleryImageSerializer):
    class Meta(GalleryImageSerializer.Meta):
        model = CategoryImage


class CategoryImageWriteSerializer(GalleryImageWriteSerializer):
    model = CategoryImage
    parent_field = 'category'


class SpeciesImageSerializer(GalleryImageSerializer):
    class Meta(GalleryImageSerializer.Meta):
        model = SpeciesImage


class SpeciesImageWriteSerializer(GalleryImageWriteSerializer):
    model = SpeciesImage
    parent_field = 'species'


class SeasonImageSerializer(GalleryImageSerializer):
    class Meta(GalleryImageSerializer.Meta):
        model = SeasonImage


class SeasonImageWriteSerializer(GalleryImageWriteSerializer):
    model = SeasonImage
    parent_field = 'season'


class WeatherConditionImageSerializer(GalleryImageSerializer):
    class Meta(GalleryImageSerializer.Meta):
        model = WeatherConditionImage


class WeatherConditionImageWriteSerializer(GalleryImageWriteSerializer):
    model = WeatherConditionImage
    parent_field = 'weather_condition'


class LocationImageSerializer(GalleryImageSerializer):
    class Meta(GalleryImageSerializer.Meta):
        model = LocationImage


class LocationImageWriteSerializer(GalleryImageWriteSerializer):
    model = LocationImage
    parent_field = 'location'


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
    images = CategoryImageSerializer(many=True, read_only=True)
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    species_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'kind', 'kind_display', 'name', 'en_name', 'slug', 'scientific_name',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'images', 'fit', 'background_color',
            'is_featured', 'sort_order', 'species_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return gallery_image_url(obj, self.context.get('request'))

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
        # Its own cover if it has one, else its first gallery photo. The CMS only
        # writes the gallery, so this is what makes the first uploaded photo the
        # species' main image - see gallery_image_url.
        return gallery_image_url(obj, self.context.get('request'))

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


class SpeciesContributeSerializer(ContributionSerializer):
    """What a signed-in reader may propose as a new species.

    Nine fields against ``SpeciesWriteSerializer``'s eighteen, and the difference
    is the point - see ``core/contributions.py`` on why this is a sibling rather
    than a subclass. Four things it deliberately does not take:

    * **``slug``** - derived from the name here (``core.slugs.unique_slug``).
      Inventing a URL segment is the CMS's job, not a reader's.
    * **``enabled``, ``is_featured``, ``sort_order``** - the three fields that
      decide whether and how prominently a record appears. Publishing is the
      administrator's act; ``create`` hard-codes all three.
    * **``href``, ``video_link``** - two outbound URLs on a record anyone may
      create, which is a link-spam surface with no upside for a field guide.
      An administrator can add either after review.
    * **``icon``** - the 128 px glyph a map pin wears. It is a design asset cut
      to a house style, not a photograph, and the pin falls back to the
      category's glyph until an author draws one.

    Only the **base** text pair member is writable (``name``, not ``en_name``): a
    contributor types in one language, and ``localized()`` on the frontend falls
    back to the base column for every locale whose twin is blank, so the entry
    reads correctly everywhere without asking a reader to translate themselves.
    """

    photos = photos_field()
    photo_write_serializer_class = SpeciesImageWriteSerializer

    description = serializers.CharField(
        required=False, allow_blank=True, max_length=MAX_TEXT_LENGTH
    )
    short_description = serializers.CharField(
        required=False, allow_blank=True, max_length=500
    )

    class Meta:
        model = Species
        fields = [
            'category', 'name', 'scientific_name', 'family',
            'description', 'short_description', 'photos',
        ]

    def validate_category(self, value):
        # A disabled category is one an administrator has taken off the site;
        # filing under it would create a species with nowhere to appear even
        # after it is approved.
        if not value.enabled:
            raise serializers.ValidationError('This category is not available.')
        return value

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('This field may not be blank.')
        return name

    @transaction.atomic
    def create(self, validated_data):
        photos = validated_data.pop('photos', [])
        instance = Species(
            **validated_data,
            slug=unique_slug(Species, validated_data.get('name'), fallback='species'),
            created_by=self._request_user(),
            is_contribution=True,
            # Invisible to every public read until an administrator enables it.
            # The same flag an unpublished CMS draft uses, so there is no second
            # visibility rule for a list endpoint to forget.
            enabled=False,
            is_featured=False,
            sort_order=0,
        )
        instance.save()
        self._write_photos(instance, photos)
        return instance


# ---------------------------------------------------------------------------
# Season
# ---------------------------------------------------------------------------

class SeasonSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    images = SeasonImageSerializer(many=True, read_only=True)
    sighting_count = serializers.SerializerMethodField()

    class Meta:
        model = Season
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug', 'months',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'images', 'fit', 'background_color',
            'sort_order', 'sighting_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return gallery_image_url(obj, self.context.get('request'))

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
    images = WeatherConditionImageSerializer(many=True, read_only=True)
    sighting_count = serializers.SerializerMethodField()

    class Meta:
        model = WeatherCondition
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description', 'href',
            'image', 'icon', 'images', 'fit', 'background_color',
            'sort_order', 'sighting_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return gallery_image_url(obj, self.context.get('request'))

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
# Geography: states and counties
# ---------------------------------------------------------------------------
#
# The two lookup tables a place is filed under. They carry no images and no
# description pairs - only the name pair every model here has - so their
# serializers are the shortest in this module, and deliberately so: the moment
# one grows a photograph it should become a picture model like the other four.
#
# Declared above `LocationSerializer` because a location payload flattens both.

class StateSerializer(serializers.ModelSerializer):
    county_count = serializers.SerializerMethodField()
    location_count = serializers.SerializerMethodField()

    class Meta:
        model = State
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug', 'sort_order',
            'county_count', 'location_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_county_count(self, obj):
        return obj.counties.filter(enabled=True).count()

    def get_location_count(self, obj):
        # Two joins deep, because a location points at the county, not at this.
        return Location.objects.filter(enabled=True, county__state=obj).count()


class StateWriteSerializer(_SlugUniqueMixin, serializers.ModelSerializer):
    class Meta:
        model = State
        fields = ['name', 'en_name', 'slug', 'sort_order', 'enabled']


class CountySerializer(serializers.ModelSerializer):
    # The state's name is flattened here for the same reason every other label
    # is: a CMS row - or a "County, State" option in a picker - renders from one
    # payload, and its English twin has to travel with it or an English reader
    # gets a Spanish state beside an English county.
    state_name = serializers.CharField(source='state.name', read_only=True, default=None)
    state_en_name = serializers.CharField(source='state.en_name', read_only=True, default=None)
    state_slug = serializers.SlugRelatedField(source='state', slug_field='slug', read_only=True)
    location_count = serializers.SerializerMethodField()

    class Meta:
        model = County
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'name', 'en_name', 'slug', 'sort_order',
            'state', 'state_name', 'state_en_name', 'state_slug',
            'location_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_location_count(self, obj):
        return obj.locations.filter(enabled=True).count()


class CountyWriteSerializer(_SlugUniqueMixin, serializers.ModelSerializer):
    class Meta:
        model = County
        fields = ['name', 'en_name', 'slug', 'state', 'sort_order', 'enabled']


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

class LocationSerializer(serializers.ModelSerializer):
    # Location has no `image` column, so this is purely the first gallery row -
    # there is nothing for it to fall back *from*. Published under the same name
    # as on the other four records so a card renders a place exactly like a
    # species.
    image = serializers.SerializerMethodField()
    icon = serializers.SerializerMethodField()
    images = LocationImageSerializer(many=True, read_only=True)
    place_type_display = serializers.CharField(source='get_place_type_display', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)
    parent_en_name = serializers.CharField(source='parent.en_name', read_only=True, default=None)
    parent_slug = serializers.SlugRelatedField(source='parent', slug_field='slug', read_only=True)
    county_name = serializers.CharField(source='county.name', read_only=True, default=None)
    county_en_name = serializers.CharField(source='county.en_name', read_only=True, default=None)
    county_slug = serializers.SlugRelatedField(source='county', slug_field='slug', read_only=True)
    # The state is **read-only and derived** - there is no column for it (see
    # `Location.state`). A place stores only its county; publishing the state id
    # alongside means a card or a filter chip renders without a second request,
    # while a write still has exactly one field to set.
    state = serializers.PrimaryKeyRelatedField(source='county.state', read_only=True, default=None)
    state_name = serializers.CharField(source='county.state.name', read_only=True, default=None)
    state_en_name = serializers.CharField(source='county.state.en_name', read_only=True, default=None)
    state_slug = serializers.SlugRelatedField(source='county.state', slug_field='slug', read_only=True)
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
            'image', 'icon', 'images',
            'latitude', 'longitude',
            'county', 'county_name', 'county_en_name', 'county_slug',
            'state', 'state_name', 'state_en_name', 'state_slug',
            'hide_precise_location', 'is_featured', 'sort_order', 'sighting_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        return gallery_image_url(obj, self.context.get('request'))

    def get_icon(self, obj):
        return file_url(obj.icon, self.context.get('request'))

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


class LocationWriteSerializer(_SlugUniqueMixin, Base64ImagesMixin, serializers.ModelSerializer):
    # Only the glyph: a place's photographs are LocationImage rows, posted to
    # this location's own `/images/` URL.
    icon = _base64_field()
    image_fields = {'icon': image_cfg(ICON)}

    class Meta:
        model = Location
        fields = [
            'name', 'en_name', 'slug',
            'description', 'en_description',
            'short_description', 'en_short_description',
            'parent', 'place_type', 'icon',
            # `county` is the only geography a place stores; its state comes
            # back through it on the read serializer and is not writable here.
            'latitude', 'longitude', 'county',
            'hide_precise_location', 'is_featured', 'sort_order', 'enabled',
        ]

    def validate_parent(self, value):
        if self.instance and value is not None and value.pk == self.instance.pk:
            raise serializers.ValidationError('A location cannot be its own parent.')
        return value
