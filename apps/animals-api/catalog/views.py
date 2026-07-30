from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.cache import cached_get, cached_set, invalidate
from core.contribute_views import ContributeView
from core.views import CachedDetailView, CachedListCreateView
from core.permissions import IsSiteAdmin

from . import cache_keys as keys
from .models import (
    KIND_CHOICES,
    Category,
    CategoryImage,
    Country,
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
from .serializers import (
    CategoryImageSerializer,
    CategoryImageWriteSerializer,
    CategorySerializer,
    CategoryWriteSerializer,
    CountrySerializer,
    CountryWriteSerializer,
    CountySerializer,
    CountyWriteSerializer,
    StateSerializer,
    StateWriteSerializer,
    LocationImageSerializer,
    LocationImageWriteSerializer,
    LocationSerializer,
    LocationWriteSerializer,
    SeasonImageSerializer,
    SeasonImageWriteSerializer,
    SeasonSerializer,
    SeasonWriteSerializer,
    SpeciesContributeSerializer,
    SpeciesImageSerializer,
    SpeciesImageWriteSerializer,
    SpeciesSerializer,
    SpeciesWriteSerializer,
    WeatherConditionImageSerializer,
    WeatherConditionImageWriteSerializer,
    WeatherConditionSerializer,
    WeatherConditionWriteSerializer,
)


def _flag(request, param):
    return request.query_params.get(param) == 'true'


# ---------------------------------------------------------------------------
# Kinds - the five top-level branches
# ---------------------------------------------------------------------------

class KindListView(APIView):
    """
    GET /api/catalog/kinds/ - the five branches with their counts (public).

    Serves the site's primary navigation. The counts come from two grouped
    queries rather than a query per branch, and the whole payload is one cache
    entry - it changes only when a category or species is written, which the
    signals already invalidate.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        cached = cached_get(keys.KINDS)
        if cached is not None:
            return Response(cached)

        category_counts = dict(
            Category.objects.filter(enabled=True)
            .values_list('kind')
            .annotate(total=Count('id'))
        )
        species_counts = dict(
            Species.objects.filter(enabled=True, category__enabled=True)
            .values_list('category__kind')
            .annotate(total=Count('id'))
        )

        data = [
            {
                'value': value,
                'label': label,
                'category_count': category_counts.get(value, 0),
                'species_count': species_counts.get(value, 0),
            }
            for value, label in KIND_CHOICES
        ]
        cached_set(keys.KINDS, data)
        return Response(data)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

class CategoryListCreateView(CachedListCreateView):
    """
    GET  /api/catalog/categories/ - list categories (public).
    POST /api/catalog/categories/ - create one (staff only).

    Query params: kind, featured, search, slug, include_disabled.
    """

    model = Category
    serializer_class = CategorySerializer
    write_serializer_class = CategoryWriteSerializer
    list_cache_prefix = keys.CATEGORIES
    detail_cache_prefix = keys.CATEGORY
    prefetch_related = ('images', 'species')

    def filter_queryset(self, qs, request):
        kind = request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind)
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        if _flag(request, 'featured'):
            qs = qs.filter(is_featured=True)
        search = request.query_params.get('search')
        if search:
            # Both members of the name pair: a reader searching in English must
            # find a row whose Spanish `name` does not contain their term.
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(en_name__icontains=search)
                | Q(scientific_name__icontains=search)
            )
        return qs


class CategoryDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (staff) one category, by pk or slug."""

    model = Category
    serializer_class = CategorySerializer
    write_serializer_class = CategoryWriteSerializer
    list_cache_prefix = keys.CATEGORIES
    detail_cache_prefix = keys.CATEGORY
    prefetch_related = ('images', 'species')


# ---------------------------------------------------------------------------
# Species
# ---------------------------------------------------------------------------

class SpeciesListCreateView(CachedListCreateView):
    """
    GET  /api/catalog/species/ - list species (public).
    POST /api/catalog/species/ - create one (staff only).

    Query params: kind, category (pk), category_slug, featured, search, slug,
    include_disabled.
    """

    model = Species
    serializer_class = SpeciesSerializer
    write_serializer_class = SpeciesWriteSerializer
    list_cache_prefix = keys.SPECIES_LIST
    detail_cache_prefix = keys.SPECIES
    select_related = ('category',)
    prefetch_related = ('images', 'sightings')

    def filter_queryset(self, qs, request):
        # `kind` lives on the category - the one path to a species' branch. See
        # the note on catalog.models.KIND_CHOICES.
        kind = request.query_params.get('kind')
        if kind:
            qs = qs.filter(category__kind=kind)
        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        category_slug = request.query_params.get('category_slug')
        if category_slug:
            qs = qs.filter(category__slug=category_slug)
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        if _flag(request, 'featured'):
            qs = qs.filter(is_featured=True)
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(en_name__icontains=search)
                | Q(scientific_name__icontains=search)
                | Q(family__icontains=search)
            )
        return qs


class SpeciesDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (staff) one species, by pk or slug."""

    model = Species
    serializer_class = SpeciesSerializer
    write_serializer_class = SpeciesWriteSerializer
    list_cache_prefix = keys.SPECIES_LIST
    detail_cache_prefix = keys.SPECIES
    select_related = ('category',)
    prefetch_related = ('images', 'sightings')


# ---------------------------------------------------------------------------
# Galleries - one pair of views, four parents
# ---------------------------------------------------------------------------
#
# Category, Species, Season, WeatherCondition and Location each own a photo table
# with the same columns and the same two endpoints (see
# ``catalog.models.GalleryImage``). A subclass names its parent model, its two
# serializers and the cache namespaces its parent's payload lives in; nothing
# else differs, so spelling these out five times would only be five places for
# the permission rule to drift.
#
# The order of the rows is load-bearing here, not cosmetic: **the first one is the
# record's main image** (``core.serializers.gallery_image_url``), which is why the
# CMS PATCHes `sort_order` on every row after a re-arrange.

class GalleryImageListCreateView(APIView):
    """
    GET  /api/catalog/<parent>/<pk>/images/ - list a record's photos (public).
    POST /api/catalog/<parent>/<pk>/images/ - add one (admin only, base64).
    """

    parent_model = None
    parent_field = ''
    serializer_class = None
    write_serializer_class = None
    # The namespaces whose payloads embed this gallery: its own list and detail.
    cache_prefixes = ()

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSiteAdmin()]

    def _get_parent(self, pk):
        return self.parent_model.objects.filter(pk=pk).first()

    def get(self, request, pk):
        parent = self._get_parent(pk)
        if parent is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.serializer_class(
            parent.images.all(), many=True, context={'request': request}
        )
        return Response(serializer.data)

    def post(self, request, pk):
        parent = self._get_parent(pk)
        if parent is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.write_serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(parent)
        # The parent's payload embeds its gallery *and* takes its cover from the
        # first row, so both of its namespaces are now stale.
        invalidate(*self.cache_prefixes)
        return Response(
            self.serializer_class(image, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class GalleryImageDetailView(APIView):
    """
    PATCH  .../images/<img_pk>/ - caption / order / fit (admin only).
    DELETE .../images/<img_pk>/ - remove it (admin only).

    The binary is deliberately not replaceable: swapping the file behind a row
    would orphan the previous object in the bucket. Delete the row and add one.
    """

    permission_classes = [IsSiteAdmin]

    model = None
    parent_field = ''
    serializer_class = None
    cache_prefixes = ()

    # Everything a row carries except its image. `sort_order` is here because it
    # is what the CMS writes to re-arrange a gallery - and therefore what decides
    # which photo is the record's cover.
    EDITABLE_FIELDS = (
        'name', 'en_name', 'description', 'en_description',
        'sort_order', 'enabled', 'fit', 'background_color',
    )

    def _get_image(self, pk, img_pk):
        return self.model.objects.filter(
            pk=img_pk, **{f'{self.parent_field}_id': pk}
        ).first()

    def patch(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        for field in self.EDITABLE_FIELDS:
            if field in request.data:
                setattr(image, field, request.data[field])
        image.save()
        invalidate(*self.cache_prefixes)
        return Response(self.serializer_class(image, context={'request': request}).data)

    def delete(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        invalidate(*self.cache_prefixes)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryImageListCreateView(GalleryImageListCreateView):
    parent_model = Category
    parent_field = 'category'
    serializer_class = CategoryImageSerializer
    write_serializer_class = CategoryImageWriteSerializer
    cache_prefixes = (keys.CATEGORIES, keys.CATEGORY)


class CategoryImageDetailView(GalleryImageDetailView):
    model = CategoryImage
    parent_field = 'category'
    serializer_class = CategoryImageSerializer
    cache_prefixes = (keys.CATEGORIES, keys.CATEGORY)


class SpeciesImageListCreateView(GalleryImageListCreateView):
    parent_model = Species
    parent_field = 'species'
    serializer_class = SpeciesImageSerializer
    write_serializer_class = SpeciesImageWriteSerializer
    cache_prefixes = (keys.SPECIES_LIST, keys.SPECIES)


class SpeciesImageDetailView(GalleryImageDetailView):
    model = SpeciesImage
    parent_field = 'species'
    serializer_class = SpeciesImageSerializer
    cache_prefixes = (keys.SPECIES_LIST, keys.SPECIES)


class SeasonImageListCreateView(GalleryImageListCreateView):
    parent_model = Season
    parent_field = 'season'
    serializer_class = SeasonImageSerializer
    write_serializer_class = SeasonImageWriteSerializer
    cache_prefixes = (keys.SEASONS, keys.SEASON)


class SeasonImageDetailView(GalleryImageDetailView):
    model = SeasonImage
    parent_field = 'season'
    serializer_class = SeasonImageSerializer
    cache_prefixes = (keys.SEASONS, keys.SEASON)


class WeatherConditionImageListCreateView(GalleryImageListCreateView):
    parent_model = WeatherCondition
    parent_field = 'weather_condition'
    serializer_class = WeatherConditionImageSerializer
    write_serializer_class = WeatherConditionImageWriteSerializer
    cache_prefixes = (keys.WEATHER_CONDITIONS, keys.WEATHER_CONDITION)


class WeatherConditionImageDetailView(GalleryImageDetailView):
    model = WeatherConditionImage
    parent_field = 'weather_condition'
    serializer_class = WeatherConditionImageSerializer
    cache_prefixes = (keys.WEATHER_CONDITIONS, keys.WEATHER_CONDITION)


class LocationImageListCreateView(GalleryImageListCreateView):
    parent_model = Location
    parent_field = 'location'
    serializer_class = LocationImageSerializer
    write_serializer_class = LocationImageWriteSerializer
    cache_prefixes = (keys.LOCATIONS, keys.LOCATION)


class LocationImageDetailView(GalleryImageDetailView):
    model = LocationImage
    parent_field = 'location'
    serializer_class = LocationImageSerializer
    cache_prefixes = (keys.LOCATIONS, keys.LOCATION)


# ---------------------------------------------------------------------------
# Seasons
# ---------------------------------------------------------------------------

class SeasonListCreateView(CachedListCreateView):
    """GET (public) / POST (staff) seasons. Query params: slug, include_disabled."""

    model = Season
    serializer_class = SeasonSerializer
    write_serializer_class = SeasonWriteSerializer
    list_cache_prefix = keys.SEASONS
    detail_cache_prefix = keys.SEASON
    prefetch_related = ('sightings', 'images')

    def filter_queryset(self, qs, request):
        slug = request.query_params.get('slug')
        return qs.filter(slug=slug) if slug else qs


class SeasonDetailView(CachedDetailView):
    model = Season
    serializer_class = SeasonSerializer
    write_serializer_class = SeasonWriteSerializer
    list_cache_prefix = keys.SEASONS
    detail_cache_prefix = keys.SEASON
    prefetch_related = ('sightings', 'images')


# ---------------------------------------------------------------------------
# Weather conditions
# ---------------------------------------------------------------------------

class WeatherConditionListCreateView(CachedListCreateView):
    """GET (public) / POST (staff) weather conditions."""

    model = WeatherCondition
    serializer_class = WeatherConditionSerializer
    write_serializer_class = WeatherConditionWriteSerializer
    list_cache_prefix = keys.WEATHER_CONDITIONS
    detail_cache_prefix = keys.WEATHER_CONDITION
    prefetch_related = ('sightings', 'images')

    def filter_queryset(self, qs, request):
        slug = request.query_params.get('slug')
        return qs.filter(slug=slug) if slug else qs


class WeatherConditionDetailView(CachedDetailView):
    model = WeatherCondition
    serializer_class = WeatherConditionSerializer
    write_serializer_class = WeatherConditionWriteSerializer
    list_cache_prefix = keys.WEATHER_CONDITIONS
    detail_cache_prefix = keys.WEATHER_CONDITION
    prefetch_related = ('sightings', 'images')


# ---------------------------------------------------------------------------
# Geography: countries, states and counties
# ---------------------------------------------------------------------------

class CountryListCreateView(CachedListCreateView):
    """GET (public) / POST (admin) countries. Query params: slug, code, search, include_disabled."""

    model = Country
    serializer_class = CountrySerializer
    write_serializer_class = CountryWriteSerializer
    list_cache_prefix = keys.COUNTRIES
    detail_cache_prefix = keys.COUNTRY
    prefetch_related = ('states',)

    def filter_queryset(self, qs, request):
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        # Matched case-insensitively: the column is normalised to upper case on
        # write, but a caller holding `?code=mx` from a URL should still find it.
        code = request.query_params.get('code')
        if code:
            qs = qs.filter(code__iexact=code)
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(en_name__icontains=search))
        return qs


class CountryDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (admin) one country, by pk or slug.

    A DELETE of a country that still has states is refused with a 409 - the FK is
    PROTECT, exactly as it is one level down, and `core/views.py` turns the
    ProtectedError into a readable message rather than a 500.
    """

    model = Country
    serializer_class = CountrySerializer
    write_serializer_class = CountryWriteSerializer
    list_cache_prefix = keys.COUNTRIES
    detail_cache_prefix = keys.COUNTRY
    prefetch_related = ('states',)


class StateListCreateView(CachedListCreateView):
    """GET (public) / POST (admin) states.

    Query params: country (pk), country_slug, slug, search, include_disabled. The
    `country` filter is what lets the CMS narrow a state picker to the country an
    author has already chosen, exactly as `state` does for counties below.
    """

    model = State
    serializer_class = StateSerializer
    write_serializer_class = StateWriteSerializer
    list_cache_prefix = keys.STATES
    detail_cache_prefix = keys.STATE
    select_related = ('country',)
    prefetch_related = ('counties',)

    def filter_queryset(self, qs, request):
        country = request.query_params.get('country')
        if country:
            qs = qs.filter(country_id=country)
        country_slug = request.query_params.get('country_slug')
        if country_slug:
            qs = qs.filter(country__slug=country_slug)
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(en_name__icontains=search)
                | Q(country__name__icontains=search)
            )
        return qs


class StateDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (admin) one state, by pk or slug.

    A DELETE of a state that still has counties is refused with a 409 - the FK
    is PROTECT, and `core/views.py` turns the ProtectedError into a readable
    message rather than a 500.
    """

    model = State
    serializer_class = StateSerializer
    write_serializer_class = StateWriteSerializer
    list_cache_prefix = keys.STATES
    detail_cache_prefix = keys.STATE
    select_related = ('country',)
    prefetch_related = ('counties',)


class CountyListCreateView(CachedListCreateView):
    """GET (public) / POST (admin) counties.

    Query params: state (pk), state_slug, country (pk), country_slug, slug,
    search, include_disabled. The `state` filter is what lets the CMS narrow a
    county picker to the state an author has already chosen; `country` narrows the
    same picker one level higher, and walks through the state the way the payload
    reads it.
    """

    model = County
    serializer_class = CountySerializer
    write_serializer_class = CountyWriteSerializer
    list_cache_prefix = keys.COUNTIES
    detail_cache_prefix = keys.COUNTY
    # `state__country` is joined too: the payload flattens the country read
    # through the state, so without it every row costs an extra query.
    select_related = ('state', 'state__country')
    prefetch_related = ('locations',)

    def filter_queryset(self, qs, request):
        state = request.query_params.get('state')
        if state:
            qs = qs.filter(state_id=state)
        state_slug = request.query_params.get('state_slug')
        if state_slug:
            qs = qs.filter(state__slug=state_slug)
        country = request.query_params.get('country')
        if country:
            qs = qs.filter(state__country_id=country)
        country_slug = request.query_params.get('country_slug')
        if country_slug:
            qs = qs.filter(state__country__slug=country_slug)
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(en_name__icontains=search)
                | Q(state__name__icontains=search)
                | Q(state__country__name__icontains=search)
            )
        return qs


class CountyDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (admin) one county, by pk or slug."""

    model = County
    serializer_class = CountySerializer
    write_serializer_class = CountyWriteSerializer
    list_cache_prefix = keys.COUNTIES
    detail_cache_prefix = keys.COUNTY
    select_related = ('state', 'state__country')
    prefetch_related = ('locations',)


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

class LocationListCreateView(CachedListCreateView):
    """
    GET  /api/catalog/locations/ - list places (public).
    POST /api/catalog/locations/ - create one (staff only).

    Query params: parent ('null' for top-level places), place_type, county,
    state, country, featured, search, slug, include_disabled.
    """

    model = Location
    serializer_class = LocationSerializer
    write_serializer_class = LocationWriteSerializer
    list_cache_prefix = keys.LOCATIONS
    detail_cache_prefix = keys.LOCATION
    # `county__state__country` is joined all the way up: the payload flattens the
    # state read through the county *and* the country read through that state, so
    # without it every row costs three extra queries.
    select_related = ('parent', 'county', 'county__state', 'county__state__country')
    prefetch_related = ('sightings', 'images')

    def filter_queryset(self, qs, request):
        parent = request.query_params.get('parent')
        if parent == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent:
            qs = qs.filter(parent_id=parent)
        place_type = request.query_params.get('place_type')
        if place_type:
            qs = qs.filter(place_type=place_type)
        county = request.query_params.get('county')
        if county:
            qs = qs.filter(county_id=county)
        # A place stores no state of its own, so filtering by one walks through
        # the county - the same path `Location.state` reads.
        state = request.query_params.get('state')
        if state:
            qs = qs.filter(county__state_id=state)
        # Nor a country - one link further up the same walk, so that a public
        # page can ask for "every place in Mexico" without knowing its states.
        country = request.query_params.get('country')
        if country:
            qs = qs.filter(county__state__country_id=country)
        country_slug = request.query_params.get('country_slug')
        if country_slug:
            qs = qs.filter(county__state__country__slug=country_slug)
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        if _flag(request, 'featured'):
            qs = qs.filter(is_featured=True)
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(en_name__icontains=search)
                | Q(county__name__icontains=search)
                | Q(county__state__name__icontains=search)
                | Q(county__state__country__name__icontains=search)
            )
        return qs


class LocationDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (staff) one location, by pk or slug."""

    model = Location
    serializer_class = LocationSerializer
    write_serializer_class = LocationWriteSerializer
    list_cache_prefix = keys.LOCATIONS
    detail_cache_prefix = keys.LOCATION
    # `county__state__country` is joined all the way up: the payload flattens the
    # state read through the county *and* the country read through that state, so
    # without it every row costs three extra queries.
    select_related = ('parent', 'county', 'county__state', 'county__state__country')
    prefetch_related = ('sightings', 'images')


class SpeciesContributeView(ContributeView):
    """
    POST /api/catalog/species/contribute/ - propose a species (any signed-in user).

    Its own URL rather than a relaxed permission on `SpeciesListCreateView`,
    because that view's `get_permissions` is what makes every write on every
    resource administrator-only - see `core/contribute_views.py`. The row lands
    `enabled=False`, so it joins the catalog when an administrator enables it in
    the CMS, which lists it because every CMS read sends `include_disabled=true`.
    """

    serializer_class = SpeciesContributeSerializer
    response_serializer_class = SpeciesSerializer
    # A pending species is invisible to the public lists, so the only reader that
    # can see it is the CMS - whose species list *and* the parent category's
    # payload (`species_count` counts enabled rows, so it does not move, but the
    # admin list is read through the same namespace) come from these two.
    cache_prefixes = (keys.SPECIES_LIST, keys.SPECIES, keys.CATEGORIES, keys.CATEGORY)
