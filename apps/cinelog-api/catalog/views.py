import logging
import os

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Movie, ScanQueue
from .pagination import CategoryPagination, InboxPagination, MoviePagination
from .serializers import (
    CategorySerializer,
    InboxAcceptSerializer,
    InboxSelectSerializer,
    MovieDetailSerializer,
    MovieEditMediaSerializer,
    MovieListSerializer,
    MovieRefetchSerializer,
    MovieWriteSerializer,
    ScanQueueSerializer,
)
from .services.backdrop import download_image, fetch_backdrop
from .services.extras import fetch_synopsis, fetch_trailer
from .services.lookup import lookup_barcode
from .services.refetch import refetch_movie_data, refetch_movie_data_by_id
from .services.tmdb import search_tmdb
from .tasks import fetch_movie_backdrop, fetch_movie_extras, resolve_scan_queue_entry

logger = logging.getLogger(__name__)


def resolve_genre_ids(names):
    """Map a list of genre names to Category ids, creating any that are missing."""
    genre_ids = []
    for name in names:
        cat, _ = Category.objects.get_or_create(slug=slugify(name), defaults={'name': name})
        genre_ids.append(cat.id)
    return genre_ids


class MovieListView(ListCreateAPIView):
    # Anonymous users may browse the catalog (GET); creating still needs auth.
    permission_classes = [IsAuthenticatedOrReadOnly]
    pagination_class = MoviePagination

    # Allowlist of `?ordering=` values mapped to the ORM order_by args. Each
    # value is validated against this map so a client can't order by an
    # arbitrary (or expensive/unindexed) column. Non-title sorts carry `title`
    # as a tiebreaker for stable, deterministic paging; an absent or unknown
    # value falls through to the model's default ordering (by title).
    ORDERING_MAP = {
        'title': ('title',),
        '-title': ('-title',),
        'year': ('year', 'title'),
        '-year': ('-year', 'title'),
        'format': ('format', 'title'),
        'created': ('created', 'title'),
        '-created': ('-created', 'title'),
    }

    def get_queryset(self):
        qs = Movie.objects.filter(enabled=True).prefetch_related('genres')

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) | Q(director__icontains=search)
            )

        # `?genre=` may repeat; a movie must belong to ALL selected genres, so
        # each slug needs its own filter (chaining adds an independent join per
        # genre, giving AND semantics across the m2m).
        genres = [g.strip() for g in self.request.query_params.getlist('genre')]
        genres = [g for g in genres if g]
        for slug in genres:
            qs = qs.filter(genres__slug=slug)
        if genres:
            qs = qs.distinct()

        # Named "media_format" (not "format") to avoid colliding with DRF's
        # `?format=` content-negotiation override.
        media_format = self.request.query_params.get('media_format', '').strip()
        if media_format:
            qs = qs.filter(format=media_format)

        ordering = self.request.query_params.get('ordering', '').strip()
        order_by = self.ORDERING_MAP.get(ordering)
        if order_by:
            qs = qs.order_by(*order_by)

        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return MovieWriteSerializer
        return MovieListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movie = serializer.save()
        return Response(MovieDetailSerializer(movie, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MovieDetailView(RetrieveUpdateDestroyAPIView):
    # Anonymous users may view a movie (GET); editing/deleting still needs auth.
    permission_classes = [IsAuthenticatedOrReadOnly]
    queryset = Movie.objects.filter(enabled=True).prefetch_related('genres', 'cast')
    serializer_class = MovieDetailSerializer

    def update(self, request, *args, **kwargs):
        """
        PATCH/PUT a saved movie's editable fields from the UI. Genre names are
        resolved to Category ids (creating any missing) and cast names are
        synced, mirroring the inbox-accept flow.

        A plain text edit leaves the cover, backdrop, and tmdb_id untouched. When
        the user saves a re-fetch the request additionally carries `cover_url`,
        `backdrop_url`, and `tmdb_id` for the matched version - the poster URL
        replaces the stored cover, the tmdb_id is re-pinned, and the wallpaper is
        re-downloaded from the new source. Responds with the full detail
        representation.
        """
        instance = self.get_object()

        serializer = MovieEditMediaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        write_data = {
            'title': data['title'],
            'director': data['director'],
            'year': data['year'],
            'format': data['format'],
            'synopsis': data['synopsis'],
            'trailer_url': data['trailer_url'],
            'genre_ids': resolve_genre_ids(data['genres']),
            'cast_names': data['cast'],
        }
        # Optional media from a saved re-fetch (`None` means "not sent" - a plain
        # text edit, which must not disturb the existing cover / tmdb_id).
        if data['cover_url'] is not None:
            write_data['cover_url'] = data['cover_url']
        if data['tmdb_id'] is not None:
            write_data['tmdb_id'] = data['tmdb_id']

        write_serializer = MovieWriteSerializer(instance, data=write_data, partial=True)
        write_serializer.is_valid(raise_exception=True)
        movie = write_serializer.save()

        # A new poster URL takes over only when no downloaded cover_image masks it
        # in the detail serializer; clear any stale file so the new URL shows.
        if data['cover_url'] is not None and movie.cover_image:
            movie.cover_image.delete(save=False)
            movie.cover_image = None
            movie.save(update_fields=['cover_image'])

        # Re-download the wallpaper for the matched version when a source URL was
        # supplied (best-effort; an empty value clears nothing and is skipped).
        if data['backdrop_url']:
            backdrop = fetch_backdrop(data['backdrop_url'], movie.title, movie.year)
            if backdrop:
                movie.backdrop_image.save(backdrop.name, backdrop, save=True)

        return Response(MovieDetailSerializer(movie, context={'request': request}).data)


class MovieBackdropView(APIView):
    """
    POST /api/catalog/movies/<id>/backdrop/

    Backfill a wallpaper for an existing catalog Movie that has none. Resolves a
    TMDB backdrop by title (with the scraper web-image fallback baked into
    `fetch_backdrop`), downloads the bytes, and saves them onto the Movie.

    Unlike the scan flow - which fetches the backdrop out of band in a Celery
    task - this runs synchronously so the edit UI can show a progress bar and
    reflect the new wallpaper the moment the request returns. Responds with the
    full detail representation.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        movie = get_object_or_404(Movie, pk=pk, enabled=True)

        # Already has one - nothing to do; surface the current representation so
        # the client simply re-renders with the existing wallpaper.
        if movie.backdrop_image:
            return Response(MovieDetailSerializer(movie, context={'request': request}).data)

        try:
            tmdb = search_tmdb(movie.title)
        except Exception:
            tmdb = None

        backdrop = fetch_backdrop(
            tmdb['backdrop_url'] if tmdb else '',
            movie.title,
            movie.year,
        )
        if not backdrop:
            return Response(
                {'detail': 'No backdrop image could be found for this movie.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        movie.backdrop_image.save(backdrop.name, backdrop, save=True)
        return Response(MovieDetailSerializer(movie, context={'request': request}).data)


class MovieSynopsisView(APIView):
    """
    POST /api/catalog/movies/<id>/synopsis/

    Fetch and store a plot synopsis for an existing catalog Movie. Resolves it
    from TMDB (overview) with a scraper + LLM fallback, then saves it onto the
    Movie. Runs synchronously so the edit UI can show progress and re-render
    with the new synopsis. Responds with the full detail representation.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        movie = get_object_or_404(Movie, pk=pk, enabled=True)
        synopsis = fetch_synopsis(movie)
        if not synopsis:
            return Response(
                {'detail': 'No synopsis could be found for this movie.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        movie.synopsis = synopsis
        movie.save(update_fields=['synopsis', 'modified'])
        return Response(MovieDetailSerializer(movie, context={'request': request}).data)


class MovieTrailerView(APIView):
    """
    POST /api/catalog/movies/<id>/trailer/

    Fetch and store a YouTube trailer URL for an existing catalog Movie.
    Resolves it from TMDB videos with a web-search fallback, then saves it onto
    the Movie. Runs synchronously so the edit UI can show progress. Responds
    with the full detail representation.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        movie = get_object_or_404(Movie, pk=pk, enabled=True)
        trailer_url = fetch_trailer(movie)
        if not trailer_url:
            return Response(
                {'detail': 'No trailer could be found for this movie.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        movie.trailer_url = trailer_url
        movie.save(update_fields=['trailer_url', 'modified'])
        return Response(MovieDetailSerializer(movie, context={'request': request}).data)


class MovieRefetchView(APIView):
    """
    POST /api/catalog/movies/<id>/refetch/  { "title": "...", "year": 1999 }

    Re-resolve a movie's metadata from TMDB (year-aware) with a scraper + LLM
    fallback and return it as a PREVIEW - nothing is written to the database. A
    barcode title often matches a different version of a remade / re-released
    film; the edit form sends the user-corrected title and year to pin the right
    one, overrides its fields with the response, and lets the user save (PATCH)
    or discard. Responds 404 when nothing usable can be found.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        movie = get_object_or_404(Movie, pk=pk, enabled=True)

        serializer = MovieRefetchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Fall back to the stored title if the form somehow sent only whitespace.
        title = data['title'].strip() or movie.title
        preview = refetch_movie_data(title, data['year'])
        if not preview:
            return Response(
                {'detail': 'No data could be found for this title and year.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(preview)


class CategoryListView(ListAPIView):
    # Genre filter dropdown must load for anonymous catalog browsing.
    permission_classes = [IsAuthenticatedOrReadOnly]
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = CategoryPagination


class ScanView(APIView):
    """
    POST /api/catalog/scan/  { "barcode": "..." }

    Fast path: UPCitemdb → TMDB → save Movie and return it.
    Slow path: any miss → create ScanQueue entry and return 202.
    """

    def post(self, request):
        barcode = (request.data.get('barcode') or '').strip()
        if not barcode:
            return Response({'detail': 'barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Already in catalog
        try:
            movie = Movie.objects.get(barcode=barcode)
            return Response(
                {'status': 'exists', 'movie': MovieDetailSerializer(movie, context={'request': request}).data},
                status=status.HTTP_200_OK,
            )
        except Movie.DoesNotExist:
            pass

        # Already in flight - only active work blocks a re-scan. Terminal rows
        # (e.g. a `failed` resolution) must not wedge the barcode forever.
        if ScanQueue.objects.filter(
            barcode=barcode, status__in=['pending', 'processing', 'review']
        ).exists():
            return Response({'status': 'queued'}, status=status.HTTP_202_ACCEPTED)

        # Fast path
        data = lookup_barcode(barcode)
        if data:
            write_data = {
                'barcode': data.barcode,
                'title': data.title,
                'director': data.director,
                'year': data.year,
                'format': data.format,
                'cover_url': data.cover_url,
                'tmdb_id': data.tmdb_id,
                'cast_names': data.cast,
            }
            # Resolve genre names to Category objects (create if missing)
            write_data['genre_ids'] = resolve_genre_ids(data.genres)

            serializer = MovieWriteSerializer(data=write_data)
            serializer.is_valid(raise_exception=True)
            movie = serializer.save()
            # Fetch the wallpaper out of band so the scan response isn't blocked
            # on image download (Phase 4 step 4).
            fetch_movie_backdrop.delay(movie.id, data.backdrop_url)
            # Backfill synopsis + trailer out of band too (TMDB, web fallback).
            fetch_movie_extras.delay(movie.id)
            return Response(
                {'status': 'saved', 'movie': MovieDetailSerializer(movie, context={'request': request}).data},
                status=status.HTTP_201_CREATED,
            )

        # Slow path - hand off to the async resolution queue.
        entry = ScanQueue.objects.create(barcode=barcode)
        resolve_scan_queue_entry.delay(entry.id)
        return Response(
            {'status': 'queued', 'queue_id': entry.id},
            status=status.HTTP_202_ACCEPTED,
        )


class InboxListView(ListAPIView):
    """
    GET /api/catalog/inbox/

    Lists AI-resolved scan-queue entries awaiting human review (Phase 5.1),
    newest first. These carry LLM/TMDB-extracted metadata for the user to
    approve, correct, or reject before the title enters the main catalog.
    """

    serializer_class = ScanQueueSerializer
    pagination_class = InboxPagination

    def get_queryset(self):
        return ScanQueue.objects.filter(status='review')


class InboxAcceptView(APIView):
    """
    POST /api/catalog/inbox/<id>/accept/

    Promotes a review entry to the main catalog, applying any field
    corrections from the request body (Phase 5.3). The barcode is taken from
    the queue entry. On success the entry is deleted - the new Movie (with its
    unique barcode) becomes the source of truth, leaving the barcode free to be
    re-scanned if the film is later removed from the catalog.
    """

    def post(self, request, pk):
        entry = get_object_or_404(ScanQueue, pk=pk, status='review')

        serializer = InboxAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolve the poster and wallpaper bytes BEFORE writing the catalog row so
        # the catalog owns the images (surviving the source URL going away) and a
        # failed download never leaves a half-saved movie. Both are best-effort:
        # the movie still saves (carrying the source URLs) when an image can't be
        # fetched.
        cover = download_image(data['cover_url'], 'cover') if data['cover_url'] else None
        backdrop = self._resolve_backdrop(data, entry)

        write_data = {
            'barcode': entry.barcode,
            'title': data['title'],
            'director': data['director'],
            'year': data['year'],
            'format': data['format'],
            'cover_url': data['cover_url'],
            'tmdb_id': data['tmdb_id'],
            'synopsis': data['synopsis'],
            'trailer_url': data['trailer_url'],
            'genre_ids': resolve_genre_ids(data['genres']),
            'cast_names': data['cast'],
        }

        # One transaction so a failure anywhere never strands an orphan movie or a
        # half-promoted queue entry (the earlier bug saved the movie first, then
        # 500'd copying the backdrop, leaving the title in the catalog anyway).
        with transaction.atomic():
            movie_serializer = MovieWriteSerializer(data=write_data)
            movie_serializer.is_valid(raise_exception=True)
            movie = movie_serializer.save()
            if cover:
                movie.cover_image.save(cover.name, cover, save=True)
            if backdrop:
                movie.backdrop_image.save(backdrop.name, backdrop, save=True)

            # The queue entry is a work item, not an archive: once the film is
            # promoted to the catalog the Movie (with its unique barcode) is the
            # source of truth, so drop the entry to free the barcode for a
            # future re-scan. Candidates cascade away with it.
            entry.delete()

        return Response(
            MovieDetailSerializer(movie, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _resolve_backdrop(data, entry):
        """
        Wallpaper bytes for an accepted entry, or None.

        A saved re-fetch sends a fresh `backdrop_url` to re-download (it takes
        priority); otherwise copy the wallpaper downloaded during review. The
        copy is guarded: the worker that resolved the entry may have written the
        file to storage this web process can't read (e.g. an unshared media
        volume in development), and a missing file must not 500 the accept - the
        wallpaper is decorative.
        """
        if data.get('backdrop_url'):
            return fetch_backdrop(data['backdrop_url'], data['title'], data['year'])

        image = entry.extracted_backdrop_image
        if not image:
            return None
        try:
            image.open('rb')
            try:
                return ContentFile(image.read(), name=os.path.basename(image.name))
            finally:
                image.close()
        except (FileNotFoundError, ValueError) as exc:
            logger.warning(
                'inbox accept: backdrop file unreadable for entry %s: %s', entry.pk, exc
            )
            return None


class InboxRefetchView(APIView):
    """
    POST /api/catalog/inbox/<id>/refetch/  { "title": "...", "year": 1999 }

    Re-resolve a review entry's metadata from TMDB (year-aware) with a scraper +
    LLM fallback and return it as a PREVIEW - nothing is written. Mirrors
    `MovieRefetchView` for the Inbox: the card sends the user-corrected title and
    year to pin the right version, overrides its fields with the response, and
    promotes via accept. Responds 404 when nothing usable can be found.
    """

    def post(self, request, pk):
        entry = get_object_or_404(ScanQueue, pk=pk, status='review')

        serializer = MovieRefetchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Fall back to the extracted title if the form somehow sent only whitespace.
        title = data['title'].strip() or entry.extracted_title
        preview = refetch_movie_data(title, data['year'])
        if not preview:
            return Response(
                {'detail': 'No data could be found for this title and year.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(preview)


class InboxSelectView(APIView):
    """
    POST /api/catalog/inbox/<id>/select/  { "tmdb_id": "..." }

    Re-pin a review entry to one of its alternative candidate matches. TMDB ranks
    search results by popularity, so the default top match can be the wrong film
    (e.g. "Fast X" for a scan of "X"); the Inbox picker lets the user choose the
    right candidate, and this resolves that exact `tmdb_id` to full metadata.

    Returns the same PREVIEW shape as `InboxRefetchView` - nothing is written;
    the card applies the fields and the user accepts. The chosen id is validated
    against the entry's own candidates so a client can't pin an arbitrary movie.
    Responds 404 when the id cannot be resolved.
    """

    def post(self, request, pk):
        entry = get_object_or_404(ScanQueue, pk=pk, status='review')

        serializer = InboxSelectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tmdb_id = serializer.validated_data['tmdb_id']

        # Only the entry's own candidates may be selected.
        if not entry.candidates.filter(tmdb_id=tmdb_id).exists():
            return Response(
                {'detail': 'That option is not a candidate for this entry.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        preview = refetch_movie_data_by_id(tmdb_id)
        if not preview:
            return Response(
                {'detail': 'No data could be found for the selected option.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(preview)


class InboxRejectView(APIView):
    """
    POST /api/catalog/inbox/<id>/reject/

    Discards a review entry the user does not want in the catalog (Phase 5.1).
    The entry is deleted so its barcode is free to be re-scanned later.
    """

    def post(self, request, pk):
        entry = get_object_or_404(ScanQueue, pk=pk, status='review')
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
