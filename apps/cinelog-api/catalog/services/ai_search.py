"""
AI-powered natural-language movie search over the catalog.

A plain `?search=` filter only matches title/director substrings, so a query
like "horror movies with drama" or "feel-good sci-fi from the 80s" finds
nothing. This service turns such a query into a ranked list of catalog movie ids
using a three-stage hybrid pipeline (retrieval + LLM rerank) rather than dumping
the whole catalog into the model on every request:

  1. Intent extraction  - one cheap structured LLM call parses the free-text
     query into genres (constrained to the catalog's own vocabulary), plot/theme
     keywords, people (director/cast), and an optional year range.
  2. Candidate retrieval - a pure-DB step gathers movies matching ANY extracted
     signal (genre / keyword / person), narrowed by the year range. No LLM.
  3. LLM rerank          - the candidate summaries (id, title, year, genres,
     truncated synopsis) are sent to the model, which returns the ids best
     matching the ORIGINAL query, most relevant first.

Fallback: when retrieval yields fewer than ``MIN_CANDIDATES`` matches (an
abstract, mood-only query the keyword/genre filter can't catch), the whole
enabled catalog is reranked in batches so the model still gets a chance to match
on vibe. Results are cached by normalized query and the catalog cache version
(bumped on any Movie save/delete), so repeat searches never re-run the model.
"""

import logging

from django.core.cache import cache
from django.db.models import Q
from pydantic import BaseModel, Field

from ..cache import cache_version
from ..models import Category, Movie
from .llm import chat_structured

logger = logging.getLogger(__name__)

# How many retrieval candidates to hand the reranker in the single-call path.
CANDIDATE_LIMIT = 40
# Below this many retrieval hits we fall back to reranking the whole catalog.
MIN_CANDIDATES = 10
# Movies per LLM call in the whole-catalog fallback (keeps each prompt bounded).
BATCH_SIZE = 50
# Longest synopsis slice sent per movie - enough signal without blowing tokens.
SYNOPSIS_CHARS = 300
# Cap on the ranked ids returned (and thus paginated) for a single query.
RESULT_LIMIT = 90
# Repeat queries are served from cache; the version key evicts on catalog change.
AI_SEARCH_CACHE_TTL = 60 * 30  # 30 minutes


class SearchIntent(BaseModel):
    """Structured reading of the user's free-text query (stage 1)."""

    genres: list[str] = Field(
        default_factory=list,
        description='Genres, chosen ONLY from the provided catalog genre list, that match the query.',
    )
    keywords: list[str] = Field(
        default_factory=list,
        description='Salient plot, theme, tone or topic keywords to match against movie titles and synopses.',
    )
    people: list[str] = Field(
        default_factory=list,
        description='Director or actor names explicitly mentioned in the query.',
    )
    year_min: int | None = Field(
        default=None, description='Earliest release year implied by the query, if any.'
    )
    year_max: int | None = Field(
        default=None, description='Latest release year implied by the query, if any.'
    )


class RankedMovies(BaseModel):
    """
    The reranker's answer (stages 3 / fallback): ordered catalog movie ids.

    Modelled as a comma-separated STRING rather than a ``list[int]`` on purpose:
    gpt-oss-120b in JSON mode reliably concatenates an integer array into a
    single number (e.g. ids 2,11,13 → 21113), but returns a clean text list when
    asked for a string. We split and parse it in ``_parse_ranked_ids``.
    """

    ranked_ids: str = Field(
        default='',
        description=(
            "Comma-separated catalog movie ids that best match the query, most relevant "
            "first, e.g. '19,2,20'. Copy each id exactly; empty string if none match."
        ),
    )


def ai_search_movie_ids(query: str) -> list[int]:
    """
    Resolve a natural-language ``query`` to an ordered list of catalog movie ids.

    Cached by normalized query + catalog version, so an unchanged catalog serves
    repeat searches without touching the LLM. Returns [] for an empty query or
    when the pipeline finds nothing.
    """
    query = (query or '').strip()
    if not query:
        return []

    key = f'ai_search:{cache_version()}:{query.lower()}'
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        ids = _run_pipeline(query)
    except Exception:
        # The LLM path is best-effort: a provider outage or schema failure must
        # not 500 the search box. An empty result renders the "no results" state.
        logger.exception('AI search pipeline failed for query %r', query)
        ids = []

    cache.set(key, ids, AI_SEARCH_CACHE_TTL)
    return ids


def _run_pipeline(query: str) -> list[int]:
    intent = _extract_intent(query)
    candidates = _retrieve_candidates(intent)

    # No programmatic hits at all (a mood/vibe query the genre/keyword filter
    # can't catch, or a bare year range): rerank the whole enabled catalog in
    # batches so the model still gets a shot at matching. When retrieval DID find
    # candidates we rerank exactly those - never discard good matches, even if
    # there are only a few.
    if not candidates:
        movies = list(
            Movie.objects.filter(enabled=True).prefetch_related('genres').order_by('id')
        )
        return _rerank_all(query, movies)

    return _rerank_batch(query, candidates)


def _catalog_genre_names() -> list[str]:
    """Every genre name in the catalog - the closed vocabulary for intent extraction."""
    return list(Category.objects.values_list('name', flat=True))


def _extract_intent(query: str) -> SearchIntent:
    """Stage 1: parse the free-text query into structured search signals."""
    genres = _catalog_genre_names()
    genre_list = ', '.join(genres) if genres else '(none)'
    messages = [
        {
            'role': 'system',
            'content': (
                'You extract structured search signals from a movie search query. '
                'Only use genres from this catalog genre list, matching case exactly; '
                f'omit any genre not in it. Catalog genres: {genre_list}. '
                'Keywords should be concise plot/theme/tone terms. '
                'Return people only when a director or actor is explicitly named.'
            ),
        },
        {'role': 'user', 'content': query},
    ]
    return chat_structured(messages, SearchIntent, temperature=0.1)


def _retrieve_candidates(intent: SearchIntent) -> list[Movie]:
    """
    Stage 2: gather movies matching ANY extracted signal (OR across genre /
    keyword / person), narrowed by the year range. Pure DB - no LLM.
    """
    signal = Q()
    for genre in intent.genres:
        signal |= Q(genres__name__iexact=genre)
    for keyword in intent.keywords:
        signal |= Q(title__icontains=keyword) | Q(synopsis__icontains=keyword)
    for person in intent.people:
        signal |= Q(director__icontains=person) | Q(cast__name__icontains=person)

    qs = Movie.objects.filter(enabled=True)
    if signal:
        qs = qs.filter(signal)
    if intent.year_min is not None:
        qs = qs.filter(year__gte=intent.year_min)
    if intent.year_max is not None:
        qs = qs.filter(year__lte=intent.year_max)

    # A bare year-range query (no genre/keyword/person signal) shouldn't return
    # the entire catalog as "candidates"; treat it as no programmatic match and
    # let the fallback reranker decide.
    if not signal:
        return []

    return list(qs.distinct().prefetch_related('genres')[: CANDIDATE_LIMIT * 2])


def _movie_line(movie: Movie) -> str:
    """One compact catalog line for the reranker prompt."""
    genres = ', '.join(g.name for g in movie.genres.all())
    synopsis = (movie.synopsis or '').strip().replace('\n', ' ')
    if len(synopsis) > SYNOPSIS_CHARS:
        synopsis = synopsis[:SYNOPSIS_CHARS] + '…'
    year = movie.year or '?'
    # Use "id N:" rather than "[N]" - bracket notation reads like array syntax
    # and pushes some models to concatenate the ids into one number instead of
    # returning them as separate list elements.
    parts = [f'id {movie.id}: {movie.title} ({year})']
    if genres:
        parts.append(f'genres: {genres}')
    if synopsis:
        parts.append(synopsis)
    return ' — '.join(parts)


def _parse_ranked_ids(raw: str, valid_ids: set[int]) -> list[int]:
    """
    Turn the reranker's comma-separated id string into an ordered id list,
    dropping anything that isn't a real candidate id and de-duplicating while
    preserving the model's ordering.
    """
    seen: set[int] = set()
    ordered: list[int] = []
    for token in raw.split(','):
        token = token.strip()
        if not token.isdigit():
            continue
        mid = int(token)
        if mid in valid_ids and mid not in seen:
            seen.add(mid)
            ordered.append(mid)
    return ordered


def _rerank_batch(query: str, movies: list[Movie]) -> list[int]:
    """Stage 3: ask the LLM to order (a bounded set of) candidates by relevance."""
    if not movies:
        return []
    catalog = '\n'.join(_movie_line(m) for m in movies)
    messages = [
        {
            'role': 'system',
            'content': (
                'You are a movie search ranker. You receive a user query and a list of catalog '
                'movies, one per line, each starting with "id N:". Return the ids of the movies '
                'that best match the query, ordered most relevant first, as a comma-separated '
                "list of the ids - for example '19,2,20'. Copy each id exactly from the list, "
                'never invent ids, and exclude movies that do not genuinely match.'
            ),
        },
        {
            'role': 'user',
            'content': f'Query: {query}\n\nCatalog:\n{catalog}',
        },
    ]
    valid_ids = {m.id for m in movies}
    result = chat_structured(messages, RankedMovies, temperature=0.2)
    return _parse_ranked_ids(result.ranked_ids, valid_ids)[:RESULT_LIMIT]


def _rerank_all(query: str, movies: list[Movie]) -> list[int]:
    """
    Whole-catalog fallback: rerank in batches and concatenate. Each batch is
    ranked internally; cross-batch order is by batch (good enough for the rare
    fallback path, where retrieval found almost nothing to begin with).
    """
    ranked: list[int] = []
    for start in range(0, len(movies), BATCH_SIZE):
        batch = movies[start : start + BATCH_SIZE]
        ranked.extend(_rerank_batch(query, batch))
        if len(ranked) >= RESULT_LIMIT:
            break
    return ranked[:RESULT_LIMIT]
