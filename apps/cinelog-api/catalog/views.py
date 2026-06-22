import os

from django.core.files.base import ContentFile
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
    MovieDetailSerializer,
    MovieEditMediaSerializer,
    MovieListSerializer,
    MovieRefetchSerializer,
    MovieWriteSerializer,
    ScanQueueSerializer,
)
from .services.backdrop import fetch_backdrop
from .services.extras import fetch_synopsis, fetch_trailer
from .services.lookup import lookup_barcode
from .services.refetch import refetch_movie_data
from .services.tmdb import search_tmdb
from .tasks import fetch_movie_backdrop, fetch_movie_extras, resolve_scan_queue_entry


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

    def get_queryset(self):
        qs = Movie.objects.filter(enabled=True).prefetch_related('genres')

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) | Q(director__icontains=search)
            )

        genre = self.request.query_params.get('genre', '').strip()
        if genre:
            qs = qs.filter(genres__slug=genre)

        # Named "media_format" (not "format") to avoid colliding with DRF's
        # `?format=` content-negotiation override.
        media_format = self.request.query_params.get('media_format', '').strip()
        if media_format:
            qs = qs.filter(format=media_format)

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

        # Already queued
        if ScanQueue.objects.filter(barcode=barcode).exists():
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
    the queue entry. On success the entry is marked `accepted` and linked to
    the new Movie.
    """

    def post(self, request, pk):
        entry = get_object_or_404(ScanQueue, pk=pk, status='review')

        serializer = InboxAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        write_data = {
            'barcode': entry.barcode,
            'title': data['title'],
            'director': data['director'],
            'year': data['year'],
            'format': data['format'],
            'cover_url': data['cover_url'],
            'tmdb_id': data['tmdb_id'],
            'genre_ids': resolve_genre_ids(data['genres']),
            'cast_names': data['cast'],
        }
        movie_serializer = MovieWriteSerializer(data=write_data)
        movie_serializer.is_valid(raise_exception=True)
        movie = movie_serializer.save()

        # Carry the wallpaper resolved during review onto the new catalog Movie.
        if entry.extracted_backdrop_image:
            entry.extracted_backdrop_image.open('rb')
            try:
                movie.backdrop_image.save(
                    os.path.basename(entry.extracted_backdrop_image.name),
                    ContentFile(entry.extracted_backdrop_image.read()),
                    save=True,
                )
            finally:
                entry.extracted_backdrop_image.close()

        entry.status = 'accepted'
        entry.movie = movie
        entry.save(update_fields=['status', 'movie', 'modified'])

        return Response(
            MovieDetailSerializer(movie, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


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
