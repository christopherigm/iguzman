from django.db.models import Count, Max, Min, Prefetch, Q
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import KIND_CHOICES, Category, Location, Species
from core.cache import cached_get, cached_set, invalidate
from core.permissions import IsSiteAdmin, show_disabled
from core.views import CachedDetailView, CachedListCreateView, list_key

from . import cache_keys as keys
from .models import Sighting, SightingMedia
from .serializers import (
    SightingMapSerializer,
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
    list_cache_prefix = keys.SIGHTINGS
    detail_cache_prefix = keys.SIGHTING
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
    list_cache_prefix = keys.SIGHTINGS
    detail_cache_prefix = keys.SIGHTING
    select_related = _SIGHTING_SELECT
    prefetch_related = _SIGHTING_PREFETCH


# Safety ceiling on one map response. A pin is a small row, but a map that
# silently grew with the journal would eventually ship the whole table to a
# phone - and no reader can tell 500 overlapping markers from 5,000.
MAX_MAP_PINS = 500
# How far down the feed `per_category` may look. A bounded slice rather than a
# scan-until-every-category-is-full loop: a category with no located sightings
# would never fill, and the loop would read the whole table looking for it.
MAX_MAP_SCAN = 5000
DEFAULT_PER_CATEGORY = 10
MAX_PER_CATEGORY = 50


class SightingMapView(APIView):
    """
    GET /api/journal/sightings/map/ - the pins for a map (public).

    Query params: ``category_slug``, ``kind``, ``species_slug``,
    ``location_slug``, ``per_category``, ``limit``, ``include_disabled``.

    Its own endpoint rather than a flag on the feed, for two reasons. **The
    payload is a different shape**: `SightingMapSerializer` drops the prose, the
    gallery and the field conditions and adds the species *icon*, which is what
    a marker is drawn as - a category map through the feed would ship every
    photo caption of every entry it pins. And **it answers a bare list, not a
    page**: a map has no "next page", it has a bounding box, so pagination would
    only ever be a way to draw an incomplete one.

    ``per_category`` is what the landing page's map asks for - the latest N
    entries of *each* branch, so one prolific category cannot crowd every other
    off the map. Without it the endpoint answers the plain newest-first feed,
    which is what a single category's page wants: every place that category has
    been recorded, up to ``MAX_MAP_PINS``.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        params = request.query_params
        disabled_visible = show_disabled(request)

        per_category = _int_param(params, 'per_category', None)
        if per_category is not None:
            per_category = max(1, min(MAX_PER_CATEGORY, per_category))
        limit = _int_param(params, 'limit', MAX_MAP_PINS)
        limit = max(1, min(MAX_MAP_PINS, limit))

        # The resolved values, not the raw params, so `?limit=99999` and
        # `?limit=500` share one cache entry - and `include_disabled` is keyed on
        # what it *resolved to*, or an administrator's response carrying unpublished
        # drafts would be replayed to the next anonymous visitor (see core/views.py).
        cache_key = list_key(
            keys.MAP,
            {
                'category_slug': params.get('category_slug', ''),
                'kind': params.get('kind', ''),
                'species_slug': params.get('species_slug', ''),
                'location_slug': params.get('location_slug', ''),
                'per_category': per_category or '',
                'limit': limit,
                'include_disabled': '1' if disabled_visible else '',
            },
        )
        cached = cached_get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = Sighting.objects.select_related(
            'species', 'species__category', 'location'
        ).prefetch_related(
            # Only the photos: the popup card shows a cover, and pulling the
            # clips and video links of every pinned entry would undo the point of
            # a stripped-down payload.
            Prefetch(
                'media',
                queryset=SightingMedia.objects.filter(kind='image').order_by('sort_order', 'id'),
            )
        )
        if not disabled_visible:
            qs = qs.filter(enabled=True)

        # Only what can actually be pinned. The effective pair is the entry's own
        # else its location's (`Sighting.coordinates`), so both halves of that
        # fallback have to be expressed here or the endpoint would return rows the
        # serializer then publishes as `null` islands.
        qs = qs.filter(
            Q(latitude__isnull=False, longitude__isnull=False)
            | Q(location__latitude__isnull=False, location__longitude__isnull=False)
        )

        category_slug = params.get('category_slug')
        if category_slug:
            qs = qs.filter(species__category__slug=category_slug)
        kind = params.get('kind')
        if kind:
            qs = qs.filter(species__category__kind=kind)
        species_slug = params.get('species_slug')
        if species_slug:
            qs = qs.filter(species__slug=species_slug)
        location_slug = params.get('location_slug')
        if location_slug:
            # A place's pins include the places inside it, exactly as its feed
            # does - see SightingListCreateView.
            qs = qs.filter(
                Q(location__slug=location_slug) | Q(location__parent__slug=location_slug)
            )

        rows = self._rows(qs, per_category, limit)
        data = SightingMapSerializer(rows, many=True, context={'request': request}).data
        cached_set(cache_key, data)
        return Response(data)

    @staticmethod
    def _rows(qs, per_category, limit):
        """The entries to pin, newest first."""
        if per_category is None:
            return list(qs[:limit])

        # The whole point of `per_category`: a landing map mixes every branch, and
        # taking the newest N overall would show eight bird sightings and nothing
        # else the week someone spent birdwatching.
        ceiling = min(limit, per_category * max(Category.objects.count(), 1))
        taken = {}
        rows = []
        for row in qs[:MAX_MAP_SCAN]:
            key = row.species.category_id
            if taken.get(key, 0) >= per_category:
                continue
            taken[key] = taken.get(key, 0) + 1
            rows.append(row)
            if len(rows) >= ceiling:
                break
        return rows


def _int_param(params, name, default):
    """A query param as an int, or ``default`` when it is absent or unparseable."""
    try:
        return int(params[name])
    except (KeyError, TypeError, ValueError):
        return default


def _invalidate_sighting(sighting):
    """Clear the caches that embed a sighting's gallery.

    Redundant with ``journal.signals.invalidate_on_media_change``, which covers
    the same writes plus the admin's inline gallery editor.
    """
    invalidate(keys.SIGHTINGS, keys.SIGHTING, keys.STATS, keys.MAP)


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
        return [IsSiteAdmin()]

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

    permission_classes = [IsSiteAdmin]
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

    permission_classes = [IsSiteAdmin]

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
        cached = cached_get(keys.STATS)
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
        cached_set(keys.STATS, data)
        return Response(data)
