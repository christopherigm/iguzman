from django.core.cache import cache
from django.db.models import Count, Max, Min, Q
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import KIND_CHOICES, Location, Species
from core.cache import invalidate_pattern
from core.permissions import IsStaffUser
from core.views import CACHE_TTL, CachedDetailView, CachedListCreateView

from .models import Sighting, SightingMedia
from .serializers import (
    SightingMediaSerializer,
    SightingMediaUpdateSerializer,
    SightingMediaWriteSerializer,
    SightingSerializer,
    SightingVideoUploadSerializer,
    SightingWriteSerializer,
)

_SIGHTING_SELECT = ('species', 'species__category', 'location', 'season', 'weather')
_SIGHTING_PREFETCH = ('media',)


class SightingListCreateView(CachedListCreateView):
    """
    GET  /api/journal/sightings/ - the journal feed (public, paginated).
    POST /api/journal/sightings/ - create an entry (staff only).

    Query params: species (pk), species_slug, kind, category (pk), category_slug,
    location (pk), location_slug, season_slug, weather_slug, year, month,
    date_from, date_to, featured, search, limit, offset, include_disabled.

    Unlike the catalog lists this returns ``{count, limit, offset, results}``:
    the feed grows with every outing, and a bare list would eventually serialize
    the whole journal on every page load.
    """

    model = Sighting
    serializer_class = SightingSerializer
    write_serializer_class = SightingWriteSerializer
    list_cache_prefix = 'journal:sightings'
    detail_cache_prefix = 'journal:sighting'
    select_related = _SIGHTING_SELECT
    prefetch_related = _SIGHTING_PREFETCH
    paginate = True

    def filter_queryset(self, qs, request):
        params = request.query_params

        species = params.get('species')
        if species:
            qs = qs.filter(species_id=species)
        species_slug = params.get('species_slug')
        if species_slug:
            qs = qs.filter(species__slug=species_slug)

        kind = params.get('kind')
        if kind:
            qs = qs.filter(species__category__kind=kind)
        category = params.get('category')
        if category:
            qs = qs.filter(species__category_id=category)
        category_slug = params.get('category_slug')
        if category_slug:
            qs = qs.filter(species__category__slug=category_slug)

        location = params.get('location')
        if location:
            qs = qs.filter(location_id=location)
        location_slug = params.get('location_slug')
        if location_slug:
            # A place's feed includes everything seen at the places inside it, so
            # a park's page is not empty when every sighting was filed on one of
            # its trails.
            qs = qs.filter(
                Q(location__slug=location_slug) | Q(location__parent__slug=location_slug)
            )

        season_slug = params.get('season_slug')
        if season_slug:
            qs = qs.filter(season__slug=season_slug)
        weather_slug = params.get('weather_slug')
        if weather_slug:
            qs = qs.filter(weather__slug=weather_slug)

        year = params.get('year')
        if year:
            qs = qs.filter(date__year=year)
        month = params.get('month')
        if month:
            qs = qs.filter(date__month=month)
        date_from = params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        date_to = params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)

        if params.get('featured') == 'true':
            qs = qs.filter(is_featured=True)

        search = params.get('search')
        if search:
            # Both members of every text pair, so a search typed in either
            # language reaches an entry authored in the other.
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(en_name__icontains=search)
                | Q(description__icontains=search)
                | Q(en_description__icontains=search)
                | Q(species__name__icontains=search)
                | Q(species__en_name__icontains=search)
                | Q(species__scientific_name__icontains=search)
            )

        slug = params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)
        return qs


class SightingDetailView(CachedDetailView):
    """GET (public) / PATCH / DELETE (staff) one entry, by pk or slug."""

    model = Sighting
    serializer_class = SightingSerializer
    write_serializer_class = SightingWriteSerializer
    list_cache_prefix = 'journal:sightings'
    detail_cache_prefix = 'journal:sighting'
    select_related = _SIGHTING_SELECT
    prefetch_related = _SIGHTING_PREFETCH


def _invalidate_sighting(sighting):
    """Clear the caches that embed a sighting's gallery."""
    cache.delete(f'journal:sighting:{sighting.pk}')
    cache.delete(f'journal:sighting:slug:{sighting.slug}')
    invalidate_pattern('journal:sightings:*')


class SightingMediaListCreateView(APIView):
    """
    GET  /api/journal/sightings/<pk>/media/ - list the gallery (public).
    POST /api/journal/sightings/<pk>/media/ - add a photo or a video *link*
         (staff only, JSON + base64). Uploaded video files go to the endpoint
         below - they cannot travel in a JSON body.
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsStaffUser()]

    def _get_sighting(self, pk):
        return Sighting.objects.filter(pk=pk).first()

    def get(self, request, pk):
        sighting = self._get_sighting(pk)
        if sighting is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SightingMediaSerializer(
            sighting.media.all(), many=True, context={'request': request}
        )
        return Response(serializer.data)

    def post(self, request, pk):
        sighting = self._get_sighting(pk)
        if sighting is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SightingMediaWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        media = serializer.save(sighting)
        _invalidate_sighting(sighting)
        return Response(
            SightingMediaSerializer(media, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class SightingVideoUploadView(APIView):
    """
    POST /api/journal/sightings/<pk>/media/video/ - upload a video file (staff).

    Multipart only. ``file`` is the video; ``poster`` is an optional still frame.
    """

    permission_classes = [IsStaffUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        sighting = Sighting.objects.filter(pk=pk).first()
        if sighting is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SightingVideoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        media = serializer.save(sighting)
        _invalidate_sighting(sighting)
        return Response(
            SightingMediaSerializer(media, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class SightingMediaDetailView(APIView):
    """
    PATCH  /api/journal/sightings/<pk>/media/<media_pk>/ - caption/order (staff).
    DELETE /api/journal/sightings/<pk>/media/<media_pk>/ - remove it (staff).
    """

    permission_classes = [IsStaffUser]

    def _get_media(self, pk, media_pk):
        return SightingMedia.objects.filter(pk=media_pk, sighting_id=pk).first()

    def patch(self, request, pk, media_pk):
        media = self._get_media(pk, media_pk)
        if media is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = SightingMediaUpdateSerializer(media, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        media = serializer.save()
        _invalidate_sighting(media.sighting)
        return Response(SightingMediaSerializer(media, context={'request': request}).data)

    def delete(self, request, pk, media_pk):
        media = self._get_media(pk, media_pk)
        if media is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        sighting = media.sighting
        media.delete()
        _invalidate_sighting(sighting)
        return Response(status=status.HTTP_204_NO_CONTENT)


class JournalStatsView(APIView):
    """
    GET /api/journal/stats/ - headline numbers for the landing page (public).

    One cached payload rather than the six requests a landing would otherwise
    make. Invalidated by the signals in both apps, so it can hold the full TTL.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        cache_key = 'journal:stats'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        published = Sighting.objects.filter(enabled=True)
        by_kind = dict(
            published.values_list('species__category__kind').annotate(total=Count('id'))
        )
        span = published.aggregate(first=Min('date'), last=Max('date'))

        data = {
            'sighting_count': published.count(),
            'species_count': Species.objects.filter(enabled=True).count(),
            'location_count': Location.objects.filter(enabled=True).count(),
            'first_sighting_date': span['first'],
            'last_sighting_date': span['last'],
            'sightings_by_kind': [
                {'kind': value, 'label': label, 'count': by_kind.get(value, 0)}
                for value, label in KIND_CHOICES
            ],
        }
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)
