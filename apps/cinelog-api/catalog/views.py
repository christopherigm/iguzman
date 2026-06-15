from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Movie, ScanQueue
from .pagination import CategoryPagination, InboxPagination, MoviePagination
from .serializers import (
    CategorySerializer,
    InboxAcceptSerializer,
    MovieDetailSerializer,
    MovieListSerializer,
    MovieWriteSerializer,
    ScanQueueSerializer,
)
from .services.lookup import lookup_barcode
from .tasks import resolve_scan_queue_entry


def resolve_genre_ids(names):
    """Map a list of genre names to Category ids, creating any that are missing."""
    genre_ids = []
    for name in names:
        cat, _ = Category.objects.get_or_create(slug=slugify(name), defaults={'name': name})
        genre_ids.append(cat.id)
    return genre_ids


class MovieListView(ListCreateAPIView):
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


class MovieDetailView(RetrieveDestroyAPIView):
    queryset = Movie.objects.filter(enabled=True).prefetch_related('genres', 'cast')
    serializer_class = MovieDetailSerializer


class CategoryListView(ListAPIView):
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
