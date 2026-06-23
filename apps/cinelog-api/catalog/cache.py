"""
Redis-backed cache for the "related movies" suggestions on the detail endpoint.

Computing related titles scans the whole catalog (every movie sharing a genre or
director), so the result is cached per movie and served from Redis on the detail
call. Adding/editing/removing any movie can change what is "related" to many
other movies, so rather than tracking which keys to drop we bump a global
version: every cache key embeds the current version, and invalidation just
increments it (old keys fall out by TTL). This works identically on the Redis
backend and the LocMem fallback used in development.
"""

from django.core.cache import cache
from django.db.models import Count, Q

from .models import Movie

# How many suggestions to surface below a movie's details.
RELATED_MOVIE_COUNT = 6

# Suggestions are stable until the catalog changes (which bumps the version), so
# a long TTL is just a safety net to evict abandoned keys.
RELATED_CACHE_TTL = 60 * 60 * 24  # 1 day

RELATED_CACHE_VERSION_KEY = 'movie:related:version'


def cache_version():
    """Current related-cache version (1 until the first invalidation)."""
    return cache.get(RELATED_CACHE_VERSION_KEY, 1)


def related_cache_key(movie_id, version):
    return f'movie:related:{version}:{movie_id}'


def invalidate_related_cache():
    """
    Drop every cached suggestion list by bumping the version. `incr` is atomic on
    Redis; it raises when the key is unset, so seed it on the first call.
    """
    try:
        cache.incr(RELATED_CACHE_VERSION_KEY)
    except ValueError:
        cache.set(RELATED_CACHE_VERSION_KEY, cache_version() + 1, None)


def get_related_movies(movie):
    """
    Up to ``RELATED_MOVIE_COUNT`` enabled movies that share a genre or the
    director with ``movie``, ranked by the number of shared genres (so the most
    thematically similar titles surface first), then by title for a stable order.
    """
    genre_ids = list(movie.genres.values_list('id', flat=True))
    director = (movie.director or '').strip()
    if not genre_ids and not director:
        return []

    criteria = Q()
    if genre_ids:
        criteria |= Q(genres__in=genre_ids)
    if director:
        criteria |= Q(director__iexact=director)

    qs = (
        Movie.objects.filter(enabled=True)
        .filter(criteria)
        .exclude(pk=movie.pk)
        .prefetch_related('genres')
    )
    if genre_ids:
        qs = qs.annotate(
            shared_genres=Count('genres', filter=Q(genres__in=genre_ids), distinct=True)
        ).order_by('-shared_genres', 'title')
    else:
        qs = qs.order_by('title')

    return list(qs.distinct()[:RELATED_MOVIE_COUNT])
