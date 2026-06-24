from django.core.cache import cache
from rest_framework import serializers

from .cache import (
    RELATED_CACHE_TTL,
    cache_version,
    get_related_movies,
    related_cache_key,
)
from .models import (
    FORMAT_CHOICES,
    Actor,
    Category,
    Format,
    Movie,
    ScanCandidate,
    ScanQueue,
)

# Maps a format code to its human label for on-the-fly Format.get_or_create.
FORMAT_LABELS = dict(FORMAT_CHOICES)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']


class ActorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Actor
        fields = ['id', 'name']


class MovieListSerializer(serializers.ModelSerializer):
    genres = CategorySerializer(many=True, read_only=True)
    cover = serializers.SerializerMethodField()
    formats = serializers.SerializerMethodField()

    class Meta:
        model = Movie
        fields = ['id', 'title', 'director', 'year', 'formats', 'cover', 'genres', 'created']

    def get_formats(self, obj):
        # Plain format codes (e.g. ['dvd', 'bluray']) - the UI translates them.
        return [fmt.code for fmt in obj.formats.all()]

    def get_cover(self, obj):
        request = self.context.get('request')
        if obj.cover_image:
            url = obj.cover_image.url
            return request.build_absolute_uri(url) if request else url
        return obj.cover_url or ''


class MovieDetailSerializer(serializers.ModelSerializer):
    genres = CategorySerializer(many=True, read_only=True)
    cast = ActorSerializer(many=True, read_only=True)
    cover = serializers.SerializerMethodField()
    backdrop = serializers.SerializerMethodField()
    related = serializers.SerializerMethodField()
    formats = serializers.SerializerMethodField()
    barcodes = serializers.SerializerMethodField()
    # True when the requesting user owns this movie. Gates edit/delete in the UI;
    # an owner-less movie reports False for everyone (read-only until an owner is
    # assigned in the admin).
    owned = serializers.SerializerMethodField()

    class Meta:
        model = Movie
        fields = [
            'id', 'title', 'director', 'year', 'formats', 'barcodes',
            'cover', 'cover_url', 'backdrop', 'tmdb_id', 'synopsis', 'trailer_url',
            'genres', 'cast', 'related', 'owned', 'created', 'modified',
        ]

    def get_formats(self, obj):
        return [fmt.code for fmt in obj.formats.all()]

    def get_barcodes(self, obj):
        # Each barcode with the format it was pressed in ('' when unset).
        return [
            {'code': bc.code, 'format': bc.format.code if bc.format else ''}
            for bc in obj.barcodes.all()
        ]

    def get_owned(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return False
        return obj.ownerships.filter(user=user).exists()

    def get_cover(self, obj):
        request = self.context.get('request')
        if obj.cover_image:
            url = obj.cover_image.url
            return request.build_absolute_uri(url) if request else url
        return obj.cover_url or ''

    def get_backdrop(self, obj):
        request = self.context.get('request')
        if obj.backdrop_image:
            url = obj.backdrop_image.url
            return request.build_absolute_uri(url) if request else url
        return ''

    def get_related(self, obj):
        """
        Up to six suggested movies sharing a genre or director, served from
        Redis. The serialized payload is cached per movie under the current
        cache version; a catalog change bumps the version (see `catalog.signals`)
        so the next read recomputes against fresh data.
        """
        key = related_cache_key(obj.pk, cache_version())
        cached = cache.get(key)
        if cached is not None:
            return cached
        data = MovieListSerializer(
            get_related_movies(obj), many=True, context=self.context
        ).data
        cache.set(key, data, RELATED_CACHE_TTL)
        return data


def resolve_formats(codes):
    """Map a list of format codes to Format objects, creating any that are missing."""
    return [
        Format.objects.get_or_create(code=code, defaults={'label': FORMAT_LABELS.get(code, code)})[0]
        for code in codes
    ]


class MovieWriteSerializer(serializers.ModelSerializer):
    genre_ids = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), many=True, write_only=True, required=False, source='genres'
    )
    cast_names = serializers.ListField(
        child=serializers.CharField(max_length=255), write_only=True, required=False
    )
    # Format codes for the movie's `formats` M2M. Barcodes are created/synced by
    # the views (they carry per-release format + ownership), not here.
    format_codes = serializers.ListField(
        child=serializers.ChoiceField(choices=FORMAT_CHOICES), write_only=True, required=False
    )

    class Meta:
        model = Movie
        fields = [
            'title', 'director', 'year',
            'cover_url', 'cover_image', 'tmdb_id', 'synopsis', 'trailer_url',
            'genre_ids', 'cast_names', 'format_codes',
        ]

    def _sync_cast(self, instance, cast_names):
        actors = [Actor.objects.get_or_create(name=name)[0] for name in cast_names]
        instance.cast.set(actors)

    def create(self, validated_data):
        cast_names = validated_data.pop('cast_names', [])
        genres = validated_data.pop('genres', [])
        format_codes = validated_data.pop('format_codes', None)
        movie = Movie.objects.create(**validated_data)
        movie.genres.set(genres)
        self._sync_cast(movie, cast_names)
        if format_codes is not None:
            movie.formats.set(resolve_formats(format_codes))
        return movie

    def update(self, instance, validated_data):
        cast_names = validated_data.pop('cast_names', None)
        genres = validated_data.pop('genres', None)
        format_codes = validated_data.pop('format_codes', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if genres is not None:
            instance.genres.set(genres)
        if cast_names is not None:
            self._sync_cast(instance, cast_names)
        if format_codes is not None:
            instance.formats.set(resolve_formats(format_codes))
        return instance


class ScanCandidateSerializer(serializers.ModelSerializer):
    """Alternative TMDB matches offered for an entry's picker (read-only)."""

    class Meta:
        model = ScanCandidate
        fields = ['id', 'tmdb_id', 'title', 'year', 'cover_url', 'overview']


class ScanQueueSerializer(serializers.ModelSerializer):
    extracted_backdrop = serializers.SerializerMethodField()
    candidates = ScanCandidateSerializer(many=True, read_only=True)

    class Meta:
        model = ScanQueue
        fields = [
            'id', 'barcode', 'status', 'extracted_title', 'extracted_director',
            'extracted_year', 'extracted_cast', 'extracted_genres', 'extracted_tmdb_id',
            'extracted_cover_url', 'extracted_backdrop', 'extracted_synopsis',
            'extracted_trailer_url', 'candidates', 'retry_count',
            'error_message', 'created', 'modified',
        ]
        read_only_fields = ['status', 'retry_count', 'error_message', 'created', 'modified']

    def get_extracted_backdrop(self, obj):
        request = self.context.get('request')
        if obj.extracted_backdrop_image:
            url = obj.extracted_backdrop_image.url
            return request.build_absolute_uri(url) if request else url
        return ''


class BarcodeInputSerializer(serializers.Serializer):
    """One barcode in a Movie's editable barcode list: a code and its format."""

    code = serializers.CharField(max_length=20)
    format = serializers.ChoiceField(
        choices=FORMAT_CHOICES, required=False, allow_blank=True, default=''
    )


class MovieEditSerializer(serializers.Serializer):
    """
    Fields the user may correct on an existing catalog `Movie` from the detail
    page. Genres and cast arrive as plain names (resolved/created in the view);
    cover and tmdb_id are intentionally excluded so editing never clobbers the
    authoritative TMDB cover. `formats` is the multi-select set of formats the
    title is available in; `barcodes` is its editable list of release UPCs.
    """

    title = serializers.CharField(max_length=500)
    director = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    year = serializers.IntegerField(
        required=False, allow_null=True, min_value=1870, max_value=2200, default=None
    )
    formats = serializers.ListField(
        child=serializers.ChoiceField(choices=FORMAT_CHOICES), required=False, default=list
    )
    barcodes = BarcodeInputSerializer(many=True, required=False, default=list)
    genres = serializers.ListField(
        child=serializers.CharField(max_length=100), required=False, default=list
    )
    cast = serializers.ListField(
        child=serializers.CharField(max_length=255), required=False, default=list
    )
    synopsis = serializers.CharField(required=False, allow_blank=True, default='')
    trailer_url = serializers.URLField(
        max_length=500, required=False, allow_blank=True, default=''
    )


class MovieEditMediaSerializer(MovieEditSerializer):
    """
    Catalog edit fields plus the optional media a user chose to keep from a
    re-fetch: a new poster URL, a wallpaper source URL to re-download, and the
    matched TMDB id. All default to ``None`` and are simply absent on a plain
    text edit, so a normal save never clobbers the existing cover, backdrop, or
    tmdb_id (only a saved re-fetch sends them).
    """

    cover_url = serializers.URLField(
        max_length=1000, required=False, allow_blank=True, allow_null=True, default=None
    )
    backdrop_url = serializers.URLField(
        max_length=1000, required=False, allow_blank=True, allow_null=True, default=None
    )
    tmdb_id = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True, default=None
    )


class MovieRefetchSerializer(serializers.Serializer):
    """
    Inputs for a preview re-fetch from the edit form: the (possibly
    user-corrected) title and year used to re-search TMDB / the scraper. Nothing
    is written - the view returns the resolved metadata for the form to apply.
    """

    title = serializers.CharField(max_length=500)
    year = serializers.IntegerField(
        required=False, allow_null=True, min_value=1870, max_value=2200, default=None
    )


class InboxSelectSerializer(serializers.Serializer):
    """
    Input for selecting a candidate match in the Inbox: the chosen TMDB id. The
    view resolves it to full preview metadata - nothing is written.
    """

    tmdb_id = serializers.CharField(max_length=20)


class InboxAcceptSerializer(MovieEditSerializer):
    """
    Editable fields the user can correct in the Inbox before an AI-resolved
    `ScanQueue` entry is promoted to the main catalog (Phase 5.3). The barcode
    is taken from the queue entry, never the client. Extends the catalog edit
    fields with the TMDB cover/id carried over from the resolved entry.
    """

    cover_url = serializers.URLField(
        max_length=1000, required=False, allow_blank=True, default=''
    )
    backdrop_url = serializers.URLField(
        max_length=1000, required=False, allow_blank=True, default=''
    )
    tmdb_id = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
