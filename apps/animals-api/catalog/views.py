from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.cache import cached_get, cached_set, invalidate
from core.views import CachedDetailView, CachedListCreateView
from core.permissions import IsSiteAdmin

from . import cache_keys as keys
from .models import (
    KIND_CHOICES,
    Category,
    Location,
    Season,
    Species,
    SpeciesImage,
    WeatherCondition,
)
from .serializers import (
    CategorySerializer,
    CategoryWriteSerializer,
    LocationSerializer,
    LocationWriteSerializer,
    SeasonSerializer,
    SeasonWriteSerializer,
    SpeciesImageSerializer,
    SpeciesImageWriteSerializer,
    SpeciesSerializer,
    SpeciesWriteSerializer,
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


class SpeciesImageListCreateView(APIView):
    """
    GET  /api/catalog/species/<pk>/images/ - list a species' reference photos.
    POST /api/catalog/species/<pk>/images/ - add one (staff only, base64).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSiteAdmin()]

    def _get_species(self, pk):
        return Species.objects.filter(pk=pk).first()

    def get(self, request, pk):
        species = self._get_species(pk)
        if species is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SpeciesImageSerializer(
            species.images.all(), many=True, context={'request': request}
        )
        return Response(serializer.data)

    def post(self, request, pk):
        species = self._get_species(pk)
        if species is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SpeciesImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(species)
        # The species payload embeds its gallery, so its caches are now stale.
        _invalidate_species(species)
        return Response(
            SpeciesImageSerializer(image, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class SpeciesImageDetailView(APIView):
    """
    PATCH  /api/catalog/species/<pk>/images/<img_pk>/ - caption/order (staff).
    DELETE /api/catalog/species/<pk>/images/<img_pk>/ - remove it (staff).
    """

    permission_classes = [IsSiteAdmin]

    def _get_image(self, pk, img_pk):
        return SpeciesImage.objects.filter(pk=img_pk, species_id=pk).first()

    def patch(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        for field in ('name', 'en_name', 'description', 'en_description',
                      'sort_order', 'enabled', 'fit', 'background_color'):
            if field in request.data:
                setattr(image, field, request.data[field])
        image.save()
        _invalidate_species(image.species)
        return Response(SpeciesImageSerializer(image, context={'request': request}).data)

    def delete(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        species = image.species
        image.delete()
        _invalidate_species(species)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _invalidate_species(species):
    """Clear the caches that embed a species' gallery.

    Redundant with ``catalog.signals.invalidate_on_species_image_change`` for the
    two paths that save a ``SpeciesImage`` row; kept because the PATCH here also
    writes fields through ``setattr`` + ``save()`` and a future branch might not.
    """
    invalidate(keys.SPECIES_LIST, keys.SPECIES)


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
    prefetch_related = ('sightings',)

    def filter_queryset(self, qs, request):
        slug = request.query_params.get('slug')
        return qs.filter(slug=slug) if slug else qs


class SeasonDetailView(CachedDetailView):
    model = Season
    serializer_class = SeasonSerializer
    write_serializer_class = SeasonWriteSerializer
    list_cache_prefix = keys.SEASONS
    detail_cache_prefix = keys.SEASON
    prefetch_related = ('sightings',)


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
    prefetch_related = ('sightings',)

    def filter_queryset(self, qs, request):
        slug = request.query_params.get('slug')
        return qs.filter(slug=slug) if slug else qs


class WeatherConditionDetailView(CachedDetailView):
    model = WeatherCondition
    serializer_class = WeatherConditionSerializer
    write_serializer_class = WeatherConditionWriteSerializer
    list_cache_prefix = keys.WEATHER_CONDITIONS
    detail_cache_prefix = keys.WEATHER_CONDITION
    prefetch_related = ('sightings',)


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

class LocationListCreateView(CachedListCreateView):
    """
    GET  /api/catalog/locations/ - list places (public).
    POST /api/catalog/locations/ - create one (staff only).

    Query params: parent ('null' for top-level places), place_type, country,
    featured, search, slug, include_disabled.
    """

    model = Location
    serializer_class = LocationSerializer
    write_serializer_class = LocationWriteSerializer
    list_cache_prefix = keys.LOCATIONS
    detail_cache_prefix = keys.LOCATION
    select_related = ('parent',)
    prefetch_related = ('sightings',)

    def filter_queryset(self, qs, request):
        parent = request.query_params.get('parent')
        if parent == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent:
            qs = qs.filter(parent_id=parent)
        place_type = request.query_params.get('place_type')
        if place_type:
            qs = qs.filter(place_type=place_type)
        country = request.query_params.get('country')
        if country:
            qs = qs.filter(country__iexact=country)
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
                | Q(region__icontains=search)
            )
        return qs


class LocationDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (staff) one location, by pk or slug."""

    model = Location
    serializer_class = LocationSerializer
    write_serializer_class = LocationWriteSerializer
    list_cache_prefix = keys.LOCATIONS
    detail_cache_prefix = keys.LOCATION
    select_related = ('parent',)
    prefetch_related = ('sightings',)
