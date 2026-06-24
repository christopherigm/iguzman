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
    AudioFormat,
    Category,
    Format,
    HdrFormat,
    Movie,
    MovieOwnership,
    ScanCandidate,
    ScanQueue,
    SpokenLanguage,
    SubtitleLanguage,
)
from .vocab import (
    AUDIO_FORMAT_CODES,
    HDR_FORMAT_CODES,
    normalize_audio_formats,
    normalize_hdr_formats,
    normalize_language_names,
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
    # True when the requesting user owns this movie; gates the catalog grid's
    # "add to library" button. Dropped via the `omit_owned` context flag wherever
    # the output is shared across users (the cross-user cached related block), so
    # one user's ownership never leaks into another's cached view.
    owned = serializers.SerializerMethodField()

    class Meta:
        model = Movie
        fields = ['id', 'title', 'director', 'year', 'formats', 'cover', 'genres', 'owned', 'created']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.context.get('omit_owned'):
            self.fields.pop('owned', None)

    def get_formats(self, obj):
        # Plain format codes (e.g. ['dvd', 'bluray']) - the UI translates them.
        return [fmt.code for fmt in obj.formats.all()]

    def get_owned(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return False
        # Prefer the per-user prefetch the list view attaches (avoids N+1 over a
        # page of cards); fall back to a direct existence check when absent.
        prefetched = getattr(obj, 'user_ownerships', None)
        if prefetched is not None:
            return len(prefetched) > 0
        return obj.ownerships.filter(user=user).exists()

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
    # Disc technical specs. Audio / HDR as canonical codes (UI button keys);
    # languages as their English names (rendered as badges / comma-list inputs).
    audio_formats = serializers.SerializerMethodField()
    hdr_formats = serializers.SerializerMethodField()
    spoken_languages = serializers.SerializerMethodField()
    subtitle_languages = serializers.SerializerMethodField()
    # True when the requesting user owns this movie. Gates edit/delete in the UI;
    # an owner-less movie reports False for everyone (read-only until an owner is
    # assigned in the admin).
    owned = serializers.SerializerMethodField()
    # True for staff users. Gates the "purge" control in the UI, which hard-deletes
    # the shared Movie for everyone (vs. the owner "delete" that only drops the
    # requesting user's ownership).
    can_purge = serializers.SerializerMethodField()

    class Meta:
        model = Movie
        fields = [
            'id', 'title', 'director', 'year', 'formats', 'barcodes',
            'cover', 'cover_url', 'backdrop', 'tmdb_id', 'synopsis', 'trailer_url',
            'genres', 'cast', 'audio_formats', 'hdr_formats', 'spoken_languages',
            'subtitle_languages', 'related', 'owned', 'can_purge', 'created', 'modified',
        ]

    def get_formats(self, obj):
        return [fmt.code for fmt in obj.formats.all()]

    def get_audio_formats(self, obj):
        return [a.code for a in obj.audio_formats.all()]

    def get_hdr_formats(self, obj):
        return [h.code for h in obj.hdr_formats.all()]

    def get_spoken_languages(self, obj):
        return [lang.name for lang in obj.spoken_languages.all()]

    def get_subtitle_languages(self, obj):
        return [lang.name for lang in obj.subtitle_languages.all()]

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

    def get_can_purge(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated and user.is_staff)

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

        The cached block is user-agnostic (the per-user `owned` field is dropped
        before caching), so the requesting user's ownership is overlaid here, on
        every read, without baking one user's ownership into the shared entry.
        """
        key = related_cache_key(obj.pk, cache_version())
        data = cache.get(key)
        if data is None:
            data = MovieListSerializer(
                get_related_movies(obj),
                many=True,
                # This block is cached across all users; drop the per-user
                # `owned` field so no user's ownership leaks into the shared
                # cache entry (it's re-applied per request below).
                context={**self.context, 'omit_owned': True},
            ).data
            cache.set(key, data, RELATED_CACHE_TTL)
        return self._overlay_owned(data)

    def _overlay_owned(self, related):
        """
        Return a copy of the cached related list with each card's `owned` flag
        resolved for the requesting user, so the catalog "add to library" button
        is hidden on titles they already own. Anonymous users get `owned=False`
        throughout (the UI hides the button for them regardless).
        """
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            return [{**item, 'owned': False} for item in related]
        ids = [item['id'] for item in related]
        owned_ids = set(
            MovieOwnership.objects.filter(user=user, movie_id__in=ids)
            .values_list('movie_id', flat=True)
        )
        return [{**item, 'owned': item['id'] in owned_ids} for item in related]


def resolve_formats(codes):
    """Map a list of format codes to Format objects, creating any that are missing."""
    return [
        Format.objects.get_or_create(code=code, defaults={'label': FORMAT_LABELS.get(code, code)})[0]
        for code in codes
    ]


def resolve_audio_formats(values):
    """Map raw audio-format strings to seeded AudioFormat rows (unknowns dropped)."""
    return list(AudioFormat.objects.filter(code__in=normalize_audio_formats(values)))


def resolve_hdr_formats(values):
    """Map raw HDR-format strings to seeded HdrFormat rows (unknowns dropped)."""
    return list(HdrFormat.objects.filter(code__in=normalize_hdr_formats(values)))


def resolve_spoken_languages(values):
    """Map raw language strings to seeded SpokenLanguage rows (unknowns dropped)."""
    return list(SpokenLanguage.objects.filter(name__in=normalize_language_names(values)))


def resolve_subtitle_languages(values):
    """Map raw language strings to seeded SubtitleLanguage rows (unknowns dropped)."""
    return list(SubtitleLanguage.objects.filter(name__in=normalize_language_names(values)))


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
    # Disc tech specs. Audio / HDR arrive as codes, languages as English names;
    # all are mapped to seeded rows (unknowns dropped) - never created on the fly.
    audio_format_codes = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )
    hdr_format_codes = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )
    spoken_language_names = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )
    subtitle_language_names = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )

    class Meta:
        model = Movie
        fields = [
            'title', 'director', 'year',
            'cover_url', 'cover_image', 'tmdb_id', 'synopsis', 'trailer_url',
            'genre_ids', 'cast_names', 'format_codes',
            'audio_format_codes', 'hdr_format_codes',
            'spoken_language_names', 'subtitle_language_names',
        ]

    def _sync_cast(self, instance, cast_names):
        actors = [Actor.objects.get_or_create(name=name)[0] for name in cast_names]
        instance.cast.set(actors)

    def _sync_tech_specs(self, instance, validated_data):
        """Set any tech-spec M2M present in the payload, mapping to seeded rows."""
        audio = validated_data.pop('audio_format_codes', None)
        hdr = validated_data.pop('hdr_format_codes', None)
        spoken = validated_data.pop('spoken_language_names', None)
        subtitle = validated_data.pop('subtitle_language_names', None)
        if audio is not None:
            instance.audio_formats.set(resolve_audio_formats(audio))
        if hdr is not None:
            instance.hdr_formats.set(resolve_hdr_formats(hdr))
        if spoken is not None:
            instance.spoken_languages.set(resolve_spoken_languages(spoken))
        if subtitle is not None:
            instance.subtitle_languages.set(resolve_subtitle_languages(subtitle))

    def create(self, validated_data):
        cast_names = validated_data.pop('cast_names', [])
        genres = validated_data.pop('genres', [])
        format_codes = validated_data.pop('format_codes', None)
        # Pull the tech-spec lists out before create() so they don't hit the model.
        audio = validated_data.pop('audio_format_codes', None)
        hdr = validated_data.pop('hdr_format_codes', None)
        spoken = validated_data.pop('spoken_language_names', None)
        subtitle = validated_data.pop('subtitle_language_names', None)
        movie = Movie.objects.create(**validated_data)
        movie.genres.set(genres)
        self._sync_cast(movie, cast_names)
        if format_codes is not None:
            movie.formats.set(resolve_formats(format_codes))
        self._sync_tech_specs(movie, {
            'audio_format_codes': audio,
            'hdr_format_codes': hdr,
            'spoken_language_names': spoken,
            'subtitle_language_names': subtitle,
        })
        return movie

    def update(self, instance, validated_data):
        cast_names = validated_data.pop('cast_names', None)
        genres = validated_data.pop('genres', None)
        format_codes = validated_data.pop('format_codes', None)
        self._sync_tech_specs(instance, validated_data)
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
            'extracted_trailer_url', 'extracted_audio_formats', 'extracted_hdr_formats',
            'extracted_spoken_languages', 'extracted_subtitle_languages',
            'candidates', 'retry_count',
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
    # Disc tech specs the user can correct. Audio / HDR as codes (button keys),
    # languages as English names (comma-list inputs); the view maps them to
    # seeded rows, so an unrecognised value is simply ignored.
    audio_formats = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False, default=list
    )
    hdr_formats = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False, default=list
    )
    spoken_languages = serializers.ListField(
        child=serializers.CharField(max_length=60), required=False, default=list
    )
    subtitle_languages = serializers.ListField(
        child=serializers.CharField(max_length=60), required=False, default=list
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


class MovieOwnSerializer(serializers.Serializer):
    """
    Input for adding an existing catalog movie to the user's library without a
    scan: the single format the user owns it in. The view records ownership,
    advertises the format on the title, and links any matching existing barcode.
    """

    format = serializers.ChoiceField(choices=FORMAT_CHOICES)


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


class ManualScanSerializer(serializers.Serializer):
    """
    Inputs for the manual title-entry form: for a disc whose barcode won't scan,
    the user types the title and year (and optionally the director they remember)
    instead. The view seeds a barcode-less ScanQueue entry with these values and
    hands it to the resolver; nothing is written to the catalog. ``year`` leads
    the TMDB search alongside the title, so it is required.
    """

    title = serializers.CharField(max_length=500)
    year = serializers.IntegerField(min_value=1870, max_value=2200)
    director = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=''
    )


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
