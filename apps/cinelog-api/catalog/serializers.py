from rest_framework import serializers

from .models import Actor, Category, Movie, ScanQueue


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

    class Meta:
        model = Movie
        fields = [
            'id', 'barcode', 'title', 'director', 'year', 'format',
            'cover', 'cover_url', 'tmdb_id', 'genres', 'cast',
            'created', 'modified',
        ]

    def get_cover(self, obj):
        request = self.context.get('request')
        if obj.cover_image:
            url = obj.cover_image.url
            return request.build_absolute_uri(url) if request else url
        return obj.cover_url or ''


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
            'cover_url', 'cover_image', 'tmdb_id', 'genre_ids', 'cast_names',
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


class ScanQueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScanQueue
        fields = [
            'id', 'barcode', 'status', 'extracted_title', 'extracted_director',
            'extracted_year', 'extracted_cast', 'extracted_genres', 'extracted_tmdb_id',
            'extracted_cover_url', 'retry_count', 'error_message', 'created', 'modified',
        ]
        read_only_fields = ['status', 'retry_count', 'error_message', 'created', 'modified']
