from rest_framework import serializers

from .models import FORMAT_CHOICES, Actor, Category, Movie, ScanCandidate, ScanQueue


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

    class Meta:
        model = Movie
        fields = ['id', 'barcode', 'title', 'director', 'year', 'format', 'cover', 'genres', 'created']

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

    class Meta:
        model = Movie
        fields = [
            'id', 'barcode', 'title', 'director', 'year', 'format',
            'cover', 'cover_url', 'backdrop', 'tmdb_id', 'synopsis', 'trailer_url',
            'genres', 'cast', 'created', 'modified',
        ]

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


class MovieWriteSerializer(serializers.ModelSerializer):
    genre_ids = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), many=True, write_only=True, required=False, source='genres'
    )
    cast_names = serializers.ListField(
        child=serializers.CharField(max_length=255), write_only=True, required=False
    )

    class Meta:
        model = Movie
        fields = [
            'barcode', 'title', 'director', 'year', 'format',
            'cover_url', 'cover_image', 'tmdb_id', 'synopsis', 'trailer_url',
            'genre_ids', 'cast_names',
        ]

    def _sync_cast(self, instance, cast_names):
        actors = [Actor.objects.get_or_create(name=name)[0] for name in cast_names]
        instance.cast.set(actors)

    def create(self, validated_data):
        cast_names = validated_data.pop('cast_names', [])
        genres = validated_data.pop('genres', [])
        movie = Movie.objects.create(**validated_data)
        movie.genres.set(genres)
        self._sync_cast(movie, cast_names)
        return movie

    def update(self, instance, validated_data):
        cast_names = validated_data.pop('cast_names', None)
        genres = validated_data.pop('genres', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if genres is not None:
            instance.genres.set(genres)
        if cast_names is not None:
            self._sync_cast(instance, cast_names)
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


class MovieEditSerializer(serializers.Serializer):
    """
    Fields the user may correct on an existing catalog `Movie` from the detail
    page. Genres and cast arrive as plain names (resolved/created in the view);
    cover and tmdb_id are intentionally excluded so editing never clobbers the
    authoritative TMDB cover.
    """

    title = serializers.CharField(max_length=500)
    director = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    year = serializers.IntegerField(
        required=False, allow_null=True, min_value=1870, max_value=2200, default=None
    )
    format = serializers.ChoiceField(
        choices=FORMAT_CHOICES, required=False, allow_blank=True, default=''
    )
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
