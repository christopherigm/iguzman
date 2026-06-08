from django.db.models import Q
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Movie, ScanQueue
from .serializers import (
    CategorySerializer,
    MovieDetailSerializer,
    MovieListSerializer,
    MovieWriteSerializer,
    ScanQueueSerializer,
)
from .services.lookup import lookup_barcode


class MovieListView(APIView):
    def get(self, request):
        qs = Movie.objects.filter(enabled=True).prefetch_related('genres')

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(title__icontains=search) | Q(director__icontains=search)
            )

        genre = request.query_params.get('genre', '').strip()
        if genre:
            qs = qs.filter(genres__slug=genre)

        fmt = request.query_params.get('format', '').strip()
        if fmt:
            qs = qs.filter(format=fmt)

        serializer = MovieListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        serializer = MovieWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movie = serializer.save()
        return Response(MovieDetailSerializer(movie, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MovieDetailView(RetrieveAPIView):
    queryset = Movie.objects.filter(enabled=True).prefetch_related('genres', 'cast')
    serializer_class = MovieDetailSerializer


class CategoryListView(ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


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
            genre_ids = []
            for name in data.genres:
                from django.utils.text import slugify
                cat, _ = Category.objects.get_or_create(
                    slug=slugify(name), defaults={'name': name}
                )
                genre_ids.append(cat.id)
            write_data['genre_ids'] = genre_ids

            serializer = MovieWriteSerializer(data=write_data)
            serializer.is_valid(raise_exception=True)
            movie = serializer.save()
            return Response(
                {'status': 'saved', 'movie': MovieDetailSerializer(movie, context={'request': request}).data},
                status=status.HTTP_201_CREATED,
            )

        # Slow path — hand off to queue (Celery task wired in Phase 4)
        entry = ScanQueue.objects.create(barcode=barcode)
        return Response(
            {'status': 'queued', 'queue_id': entry.id},
            status=status.HTTP_202_ACCEPTED,
        )
