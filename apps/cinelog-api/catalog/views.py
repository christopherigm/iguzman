import logging
import os

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Barcode, Category, Movie, MovieOwnership, ScanQueue
from .pagination import CategoryPagination, InboxPagination, MoviePagination
from .serializers import (
    CategorySerializer,
    InboxAcceptSerializer,
    InboxSelectSerializer,
    ManualScanSerializer,
    MovieDetailSerializer,
    MovieEditMediaSerializer,
    MovieListSerializer,
    MovieOwnSerializer,
    MovieRefetchSerializer,
    MovieWriteSerializer,
    ScanQueueSerializer,
    resolve_audio_formats,
    resolve_formats,
    resolve_hdr_formats,
    resolve_spoken_languages,
    resolve_subtitle_languages,
)
from .services.backdrop import download_image, fetch_backdrop
from .services.extras import fetch_synopsis, fetch_trailer
from .services.lookup import lookup_barcode
from .services.refetch import refetch_movie_data, refetch_movie_data_by_id
from .services.tmdb import search_tmdb
from .tasks import (
    enrich_scan_queue_entry,
    resolve_manual_queue_entry,
    resolve_scan_queue_entry,
)

logger = logging.getLogger(__name__)


def resolve_genre_ids(names):
    """Map a list of genre names to Category ids, creating any that are missing."""
    genre_ids = []
    for name in names:
        cat, _ = Category.objects.get_or_create(slug=slugify(name), defaults={'name': name})
        genre_ids.append(cat.id)
    return genre_ids


def find_existing_movie(tmdb_id, title, year):
    """
    Locate an existing catalog Movie the same film should attach to, so a second
    scan (a different format/barcode of a title already owned by someone) adds a
    barcode instead of duplicating the movie. Matches on the authoritative
    `tmdb_id` first, then a case-insensitive title + year (year required - a
    bare title is too weak to safely dedupe remakes/namesakes).
    """
    if tmdb_id:
        movie = Movie.objects.filter(tmdb_id=tmdb_id, enabled=True).first()
        if movie:
            return movie
    if title and year is not None:
        return Movie.objects.filter(title__iexact=title.strip(), year=year, enabled=True).first()
    return None


def sync_barcodes(movie, barcode_inputs):
    """
    Replace ``movie``'s barcodes with the supplied ``[{'code', 'format'}]`` list
    (full-set semantics): create new codes, update the format of existing ones,
    and delete those the user dropped. A code already attached to a DIFFERENT
    movie is rejected - a barcode identifies exactly one product worldwide.
    """
    seen = []
    for item in barcode_inputs:
        code = item['code'].strip()
        if not code:
            continue
        fmt = resolve_formats([item['format']])[0] if item.get('format') else None
        existing = Barcode.objects.filter(code=code).first()
        if existing and existing.movie_id != movie.id:
            raise ValidationError(
                {'barcodes': f'Barcode {code} already belongs to another movie.'}
            )
        if existing:
            if existing.format_id != (fmt.id if fmt else None):
                existing.format = fmt
                existing.save(update_fields=['format'])
        else:
            Barcode.objects.create(movie=movie, code=code, format=fmt)
        seen.append(code)
    movie.barcodes.exclude(code__in=seen).delete()


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
        'created': ('created', 'title'),
        '-created': ('-created', 'title'),
    }

    def get_queryset(self):
        qs = Movie.objects.filter(enabled=True).prefetch_related('genres', 'formats')

        # Attach the requesting user's ownership rows so the serializer's `owned`
        # flag (which gates the catalog's "add to library" button) resolves
        # without an extra query per card. Anonymous browsers skip it entirely.
        user = self.request.user
        if user.is_authenticated:
            qs = qs.prefetch_related(
                Prefetch(
                    'ownerships',
                    queryset=MovieOwnership.objects.filter(user=user),
                    to_attr='user_ownerships',
                )
            )

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
        if media_format == 'digital':
            # "Digital" is a per-user signal - the requesting user saved their own
            # digital-copy link on their ownership row, not a shared property of
            # the title. Filter on that ownership (mirroring how the card's digital
            # icon is gated) instead of the shared `formats` M2M, which would miss
            # links added via the edit form and leak across users. Anonymous
            # browsers have no digital copies, so the filter yields nothing.
            if user.is_authenticated:
                qs = qs.filter(ownerships__user=user).exclude(
                    ownerships__user=user, ownerships__digital_copy_url=''
                ).distinct()
            else:
                qs = qs.none()
        elif media_format:
            qs = qs.filter(formats__code=media_format).distinct()

        # Disc audio-format filter: `?audio_format=` may repeat; a movie must
        # carry ALL selected formats (AND semantics, like genres), so each code
        # gets its own independent join.
        audio_formats = [a.strip() for a in self.request.query_params.getlist('audio_format')]
        audio_formats = [a for a in audio_formats if a]
        for code in audio_formats:
            qs = qs.filter(audio_formats__code=code)

        # Disc HDR / dynamic-range filter: same repeated-param AND semantics.
        hdr_formats = [h.strip() for h in self.request.query_params.getlist('hdr_format')]
        hdr_formats = [h for h in hdr_formats if h]
        for code in hdr_formats:
            qs = qs.filter(hdr_formats__code=code)

        if audio_formats or hdr_formats:
            qs = qs.distinct()

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
        # The creator owns what they add, so they can edit/delete it afterwards.
        MovieOwnership.objects.get_or_create(user=request.user, movie=movie)
        return Response(MovieDetailSerializer(movie, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MovieDetailView(RetrieveUpdateDestroyAPIView):
    # Anonymous users may view a movie (GET); editing/deleting still needs auth.
    permission_classes = [IsAuthenticatedOrReadOnly]
    queryset = Movie.objects.filter(enabled=True).prefetch_related(
        'genres', 'cast', 'formats', 'barcodes__format', 'ownerships',
        'audio_formats', 'hdr_formats', 'spoken_languages', 'subtitle_languages',
    )
    serializer_class = MovieDetailSerializer

    @staticmethod
    def _assert_can_edit(request, movie):
        """
        Only an owner (or staff) may edit a movie. Movies with no ownership rows
        are read-only over the API for everyone until an owner is assigned in the
        Django admin (legacy rows after the ownership migration).
        """
        user = request.user
        if user.is_staff or movie.ownerships.filter(user=user).exists():
            return
        raise PermissionDenied('You do not own this movie.')

    def update(self, request, *args, **kwargs):
        """
        PATCH/PUT a saved movie's editable fields from the UI. Genre names are
        resolved to Category ids (creating any missing), cast names are synced,
        `formats` is set from the multi-select, and `barcodes` is synced to the
        edited list. Editing requires ownership.

        A plain text edit leaves the cover, backdrop, and tmdb_id untouched. When
        the user saves a re-fetch the request additionally carries `cover_url`,
        `backdrop_url`, and `tmdb_id` for the matched version - the poster URL
        replaces the stored cover, the tmdb_id is re-pinned, and the wallpaper is
        re-downloaded from the new source. Responds with the full detail
        representation.
        """
        instance = self.get_object()
        self._assert_can_edit(request, instance)

        serializer = MovieEditMediaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        write_data = {
            'title': data['title'],
            'director': data['director'],
            'year': data['year'],
            'format_codes': data['formats'],
            'synopsis': data['synopsis'],
            'trailer_url': data['trailer_url'],
            'genre_ids': resolve_genre_ids(data['genres']),
            'cast_names': data['cast'],
            'audio_format_codes': data['audio_formats'],
            'hdr_format_codes': data['hdr_formats'],
            'spoken_language_names': data['spoken_languages'],
            'subtitle_language_names': data['subtitle_languages'],
        }
        # Optional media from a saved re-fetch (`None` means "not sent" - a plain
        # text edit, which must not disturb the existing cover / tmdb_id).
        if data['cover_url'] is not None:
            write_data['cover_url'] = data['cover_url']
        if data['tmdb_id'] is not None:
            write_data['tmdb_id'] = data['tmdb_id']

        with transaction.atomic():
            write_serializer = MovieWriteSerializer(instance, data=write_data, partial=True)
            write_serializer.is_valid(raise_exception=True)
            movie = write_serializer.save()
            sync_barcodes(movie, data['barcodes'])

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

        # The digital-copy link is per-user data, so it rides on the editor's own
        # ownership row, not the shared Movie. `None` means the field wasn't sent
        # (leave it untouched); '' clears it. Only an owner has a row to update -
        # a staff non-owner editing the shared title simply has nothing to write.
        if data['digital_copy_url'] is not None:
            MovieOwnership.objects.filter(user=request.user, movie=movie).update(
                digital_copy_url=data['digital_copy_url']
            )

        return Response(MovieDetailSerializer(movie, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        """
        "Delete" a movie from the user's collection: drop only THIS user's
        ownership and leave the shared Movie in the catalog for its other owners.
        A non-owner has no ownership to remove and is rejected.

        With `?purge=true` and staff privileges this becomes a hard delete - the
        shared Movie row (and its cascading barcodes / ownerships) is removed from
        the catalog for everyone. Reserved for staff; non-staff are rejected.
        """
        movie = self.get_object()

        purge = request.query_params.get('purge', '').lower() in ('1', 'true', 'yes')
        if purge:
            if not request.user.is_staff:
                raise PermissionDenied('Only staff can purge a movie from the catalog.')
            movie.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        ownership = movie.ownerships.filter(user=request.user).first()
        if ownership is None:
            raise PermissionDenied('You do not own this movie.')
        ownership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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


class MovieOwnView(APIView):
    """
    POST /api/catalog/movies/<id>/own/  { "format": "bluray" }

    Add an existing catalog Movie to the requesting user's library WITHOUT a
    scan - for when a user browsing the shared catalog recognises a title they
    own but never scanned. Records the user's ownership (one row per user per
    movie), advertises the chosen format on the shared title, and links the
    ownership to that format's existing barcode when the title already carries
    one (the user owns the physical release but never scanned it; otherwise the
    ownership's barcode stays null). Idempotent: a user who already owns the
    movie just keeps their existing ownership. Responds with the full detail
    representation, now reporting `owned`.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        movie = get_object_or_404(Movie, pk=pk, enabled=True)

        serializer = MovieOwnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fmt = resolve_formats([serializer.validated_data['format']])[0]
        # Private streaming link, stored on the user's own ownership row (only
        # present/required for the digital format).
        digital_copy_url = serializer.validated_data.get('digital_copy_url', '')

        with transaction.atomic():
            # Advertise the format on the shared title (no-op if already present).
            # "digital" is the exception: it's a per-user signal carried by the
            # ownership's digital_copy_url below, never a shared property of the
            # title, so it's not advertised on the shared `formats`.
            if serializer.validated_data['format'] != 'digital':
                movie.formats.add(fmt)
            # Link an existing barcode of this format when the title carries one;
            # leave it null otherwise (a library add never invents a barcode).
            barcode = movie.barcodes.filter(format=fmt).first()
            MovieOwnership.objects.get_or_create(
                user=request.user,
                movie=movie,
                defaults={'barcode': barcode, 'digital_copy_url': digital_copy_url},
            )

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
        # A barcode pins the exact physical release for tech specs when present.
        barcode = movie.barcodes.values_list('code', flat=True).first() or ''
        preview = refetch_movie_data(title, data['year'], barcode=barcode)
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


class MovieStatsView(APIView):
    """
    GET /api/catalog/stats/?scope=catalog|library

    Public, read-only aggregation feeding the Statistics page's charts. Returns a
    count breakdown for each catalog dimension (format, release year, genre, disc
    audio format, HDR format, spoken-audio language, subtitle language) plus the
    movie total, all computed server-side in a handful of grouped queries.

    `scope=catalog` (default, and the only option for anonymous visitors) covers
    every enabled movie. `scope=library` narrows to the movies the signed-in user
    owns; an anonymous request silently falls back to the whole catalog so the
    public page always renders.

    Each dimension is a list of ``{ "key", "label", "count" }`` rows ordered by
    descending count (years ascending, so the per-year line reads left to right).
    `key` is the stable code/value (used as the chart's data key); `label` is the
    human-readable display string.
    """

    # Read-only and public: the page is viewable without authentication.
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get(self, request):
        scope = request.query_params.get('scope', 'catalog').strip()
        movies = Movie.objects.filter(enabled=True)
        if scope == 'library' and request.user.is_authenticated:
            movies = movies.filter(ownerships__user=request.user).distinct()
        else:
            scope = 'catalog'

        def breakdown(key_field, label_field, *, order_by_key=False):
            # Group the (filtered) movies by a related field, counting distinct
            # movies per bucket. Null buckets (movies missing that relation) are
            # dropped. Each movie is counted once per bucket via distinct=True so
            # the m2m join fan-out doesn't inflate the totals.
            #
            # `.order_by()` clears Movie's default `Meta.ordering = ['title']`:
            # without it Django appends `title` to the GROUP BY, so every movie
            # lands in its own (bucket, title) group and each bucket collapses to
            # count 1 - one chart point per movie instead of a real aggregate.
            rows = (
                movies.exclude(**{f'{key_field}__isnull': True})
                .order_by()
                .values(key_field, label_field)
                .annotate(count=Count('id', distinct=True))
            )
            data = [
                {
                    'key': str(row[key_field]),
                    'label': str(row[label_field]),
                    'count': row['count'],
                }
                for row in rows
            ]
            data.sort(key=lambda item: (item['key'] if order_by_key else -item['count']))
            return data

        return Response(
            {
                'scope': scope,
                'total': movies.distinct().count(),
                'formats': breakdown('formats__code', 'formats__label'),
                'years': breakdown('year', 'year', order_by_key=True),
                'genres': breakdown('genres__slug', 'genres__name'),
                'audio_formats': breakdown('audio_formats__code', 'audio_formats__label'),
                'hdr_formats': breakdown('hdr_formats__code', 'hdr_formats__label'),
                'spoken_languages': breakdown('spoken_languages__code', 'spoken_languages__name'),
                'subtitle_languages': breakdown(
                    'subtitle_languages__code', 'subtitle_languages__name'
                ),
            }
        )


class ScanView(APIView):
    """
    POST /api/catalog/scan/  { "barcode": "..." }

    A scan never writes straight to the catalog: it lands in the per-user
    ScanQueue for review in the inbox, except when the barcode is already known.

    Known barcode: grant ownership of the existing (already reviewed) movie and
        return it - nothing new enters the catalog, so no review is needed.
    Fast path (UPCitemdb -> TMDB): pre-fill a ScanQueue entry from the instant
        lookup and set it to `review` so it shows in the inbox immediately;
        enrich the remaining fields in the background. Return 202.
    Slow path: any miss -> create a per-user ScanQueue entry, hand it to the
        async resolver, and return 202.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        barcode = (request.data.get('barcode') or '').strip()
        if not barcode:
            return Response({'detail': 'barcode is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user

        # Already a known barcode - grant ownership (if new) and return its movie.
        known = Barcode.objects.select_related('movie').filter(code=barcode).first()
        if known:
            movie = known.movie
            MovieOwnership.objects.get_or_create(
                user=user, movie=movie, defaults={'barcode': known}
            )
            return Response(
                {'status': 'exists', 'movie': MovieDetailSerializer(movie, context={'request': request}).data},
                status=status.HTTP_200_OK,
            )

        # This user already has an active scan for this barcode in flight. Per-user
        # inbox: another user's in-flight scan of the same code doesn't block this
        # one. Terminal rows (e.g. a `failed` resolution) never wedge a re-scan.
        if ScanQueue.objects.filter(
            barcode=barcode, scanned_by=user, status__in=['pending', 'processing', 'review']
        ).exists():
            return Response({'status': 'queued'}, status=status.HTTP_202_ACCEPTED)

        # Fast path - the barcode resolves instantly via UPCitemdb -> TMDB. Pre-fill
        # a per-user review entry from that data and set it to `review` so it shows
        # in the inbox immediately (no waiting on the worker); enrich the remaining
        # fields - synopsis, trailer, tech specs, wallpaper, alternative matches -
        # in the background. Nothing is written to the catalog until the user
        # accepts the entry in the inbox.
        data = lookup_barcode(barcode)
        if data:
            entry = ScanQueue.objects.create(
                scanned_by=user,
                barcode=barcode,
                status='review',
                extracted_title=data.title,
                extracted_director=data.director,
                extracted_year=data.year,
                extracted_cast=data.cast,
                extracted_genres=data.genres,
                extracted_tmdb_id=data.tmdb_id,
                extracted_cover_url=data.cover_url,
            )
            enrich_scan_queue_entry.delay(entry.id, data.tmdb_id, data.backdrop_url)
            return Response(
                {'status': 'queued', 'queue_id': entry.id},
                status=status.HTTP_202_ACCEPTED,
            )

        # Slow path - hand off to the async resolution queue for this user.
        entry = ScanQueue.objects.create(barcode=barcode, scanned_by=user)
        resolve_scan_queue_entry.delay(entry.id)
        return Response(
            {'status': 'queued', 'queue_id': entry.id},
            status=status.HTTP_202_ACCEPTED,
        )


class ManualScanView(APIView):
    """
    POST /api/catalog/manual-scan/  { "title": "...", "year": 1999, "director": "..." }

    Queue a manually-entered title for AI resolution and Inbox review, for a disc
    whose barcode won't scan. Seeds a barcode-less, per-user ScanQueue entry with
    the typed title / year / director and hands it to the resolver, which fills
    in the metadata and lands it in `review`. Nothing is written to the catalog
    here - the entry is corrected and accepted in the Inbox like any scanned one.
    Always returns 202 queued, mirroring the slow-path barcode scan.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ManualScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        entry = ScanQueue.objects.create(
            scanned_by=request.user,
            barcode='',
            extracted_title=data['title'].strip(),
            extracted_year=data['year'],
            extracted_director=data['director'].strip(),
        )
        resolve_manual_queue_entry.delay(entry.id)
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
        # Per-user inbox: each user only reviews the entries they scanned.
        return ScanQueue.objects.filter(status='review', scanned_by=self.request.user)


class InboxAcceptView(APIView):
    """
    POST /api/catalog/inbox/<id>/accept/

    Promotes a review entry to the main catalog, applying any field
    corrections from the request body (Phase 5.3). The barcode is taken from
    the queue entry. On success the entry is deleted - the new Movie (with its
    unique barcode) becomes the source of truth, leaving the barcode free to be
    re-scanned if the film is later removed from the catalog.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        # Per-user inbox: a user may only accept their own scanned entries.
        entry = get_object_or_404(
            ScanQueue, pk=pk, status='review', scanned_by=request.user
        )

        serializer = InboxAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        formats = data['formats']
        # The scanned disc is one physical release; tag its barcode with the
        # first selected format as a best guess (editable later in the catalog).
        barcode_format = resolve_formats([formats[0]])[0] if formats else None

        # Dedupe against the catalog: a slow-path title may already exist (added
        # by another user or via the fast path). When it does we attach this scan
        # to it rather than duplicating, and leave its metadata/art untouched.
        existing = find_existing_movie(data['tmdb_id'], data['title'], data['year'])

        # Resolve poster/wallpaper bytes only for a brand-new movie - an existing
        # one keeps its own art. Done BEFORE the write so a failed download never
        # leaves a half-saved movie; both are best-effort.
        cover = (
            download_image(data['cover_url'], 'cover')
            if existing is None and data['cover_url']
            else None
        )
        backdrop = self._resolve_backdrop(data, entry) if existing is None else None

        # One transaction so a failure anywhere never strands an orphan movie or a
        # half-promoted queue entry.
        with transaction.atomic():
            if existing is None:
                write_data = {
                    'title': data['title'],
                    'director': data['director'],
                    'year': data['year'],
                    'format_codes': formats,
                    'cover_url': data['cover_url'],
                    'tmdb_id': data['tmdb_id'],
                    'synopsis': data['synopsis'],
                    'trailer_url': data['trailer_url'],
                    'genre_ids': resolve_genre_ids(data['genres']),
                    'cast_names': data['cast'],
                    'audio_format_codes': data['audio_formats'],
                    'hdr_format_codes': data['hdr_formats'],
                    'spoken_language_names': data['spoken_languages'],
                    'subtitle_language_names': data['subtitle_languages'],
                }
                movie_serializer = MovieWriteSerializer(data=write_data)
                movie_serializer.is_valid(raise_exception=True)
                movie = movie_serializer.save()
                if cover:
                    movie.cover_image.save(cover.name, cover, save=True)
                if backdrop:
                    movie.backdrop_image.save(backdrop.name, backdrop, save=True)
            else:
                # A different release of a title already in the catalog: union the
                # new formats and tech specs onto it; leave its metadata/art alone.
                movie = existing
                if formats:
                    movie.formats.add(*resolve_formats(formats))
                if data['audio_formats']:
                    movie.audio_formats.add(*resolve_audio_formats(data['audio_formats']))
                if data['hdr_formats']:
                    movie.hdr_formats.add(*resolve_hdr_formats(data['hdr_formats']))
                if data['spoken_languages']:
                    movie.spoken_languages.add(*resolve_spoken_languages(data['spoken_languages']))
                if data['subtitle_languages']:
                    movie.subtitle_languages.add(*resolve_subtitle_languages(data['subtitle_languages']))

            # Attach the scanned barcode and grant ownership to the scanner. A
            # manually-entered title carries no barcode, so the ownership is
            # recorded without one (empty codes can't be deduped - the unique
            # `code` would collide across manual accepts).
            bc = None
            if entry.barcode:
                bc, _ = Barcode.objects.get_or_create(
                    code=entry.barcode, defaults={'movie': movie, 'format': barcode_format}
                )
            ownership, _ = MovieOwnership.objects.get_or_create(
                user=request.user, movie=movie, defaults={'barcode': bc}
            )
            # The optional private digital-copy link the reviewer typed rides on
            # their own ownership row (per-user, not the shared Movie). Only write
            # it when supplied so accepting without one leaves nothing to clear.
            if data['digital_copy_url']:
                ownership.digital_copy_url = data['digital_copy_url']
                ownership.save(update_fields=['digital_copy_url'])

            # The queue entry is a work item, not an archive: drop it once
            # promoted. Candidates cascade away with it.
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
        entry = get_object_or_404(ScanQueue, pk=pk, status='review', scanned_by=request.user)

        serializer = MovieRefetchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Fall back to the extracted title if the form somehow sent only whitespace.
        title = data['title'].strip() or entry.extracted_title
        preview = refetch_movie_data(title, data['year'], barcode=entry.barcode)
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
        entry = get_object_or_404(ScanQueue, pk=pk, status='review', scanned_by=request.user)

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
        entry = get_object_or_404(ScanQueue, pk=pk, status='review', scanned_by=request.user)
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
