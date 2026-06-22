import logging

from .extract import extract_movie, extract_synopsis
from .scraper import scrape_text, search_youtube
from .tmdb import fetch_tmdb_by_id, fetch_tmdb_extras, search_tmdb

logger = logging.getLogger(__name__)


def refetch_movie_data_by_id(tmdb_id: str) -> dict | None:
    """
    Resolve a film's full preview metadata from an exact TMDB id, WITHOUT
    touching the database.

    Used by the Inbox candidate picker: the user chose a specific result, so we
    pin its `tmdb_id` directly (no re-search that could drift back to the wrong
    title). Returns the same preview dict as `refetch_movie_data` - keys: title,
    director, year, genres, cast, synopsis, trailer_url, cover_url,
    backdrop_url, tmdb_id. Returns None when the id cannot be resolved.
    """
    tmdb_id = (tmdb_id or '').strip()
    if not tmdb_id:
        return None

    tmdb = fetch_tmdb_by_id(tmdb_id)
    if not tmdb:
        return None

    extras = fetch_tmdb_extras(tmdb_id=tmdb['tmdb_id'])
    return {
        'title': tmdb['title'],
        'director': tmdb['director'],
        'year': tmdb['year'],
        'genres': tmdb['genres'],
        'cast': tmdb['cast'],
        'cover_url': tmdb['cover_url'],
        'backdrop_url': tmdb['backdrop_url'],
        'tmdb_id': tmdb['tmdb_id'],
        'synopsis': extras.get('synopsis', ''),
        'trailer_url': extras.get('trailer_url', ''),
    }


def refetch_movie_data(title: str, year: int | None) -> dict | None:
    """
    Re-resolve a film's metadata from TMDB (year-aware) with a scraper + LLM
    fallback, WITHOUT touching the database.

    `year` disambiguates remakes / re-releases that share a title - the user
    corrects it on the edit form to pin the exact version pressed on the disc.

    Returns a preview dict with keys: title, director, year, genres, cast,
    synopsis, trailer_url, cover_url, backdrop_url, tmdb_id. Returns None when
    nothing usable can be resolved. Best-effort: individual fields may be empty,
    and the scraper fallback can only fill the text fields (TMDB is the sole
    source of cast / genres / poster / backdrop).
    """
    title = (title or '').strip()
    if not title:
        return None

    tmdb = search_tmdb(title, year)
    if tmdb:
        extras = fetch_tmdb_extras(tmdb_id=tmdb['tmdb_id'])
        return {
            'title': tmdb['title'] or title,
            'director': tmdb['director'],
            'year': tmdb['year'],
            'genres': tmdb['genres'],
            'cast': tmdb['cast'],
            'cover_url': tmdb['cover_url'],
            'backdrop_url': tmdb['backdrop_url'],
            'tmdb_id': tmdb['tmdb_id'],
            'synopsis': extras.get('synopsis', ''),
            'trailer_url': extras.get('trailer_url', ''),
        }

    # Fallback: scrape the web and let the LLM clean it. TMDB is the only source
    # of cast / genres / poster / backdrop, so those stay empty on this path.
    query = f'{title} {year} movie' if year else f'{title} movie'
    try:
        raw = scrape_text(query)
    except Exception as exc:
        logger.warning('refetch: scrape failed for %r: %s', title, exc)
        return None
    if not raw:
        return None

    try:
        scraped = extract_movie(raw)
    except Exception as exc:
        logger.warning('refetch: extract failed for %r: %s', title, exc)
        return None
    if not scraped.title:
        return None

    try:
        synopsis = extract_synopsis(raw, scraped.title)
    except Exception as exc:
        logger.warning('refetch: synopsis extract failed for %r: %s', title, exc)
        synopsis = ''

    trailer_query = (
        f'{scraped.title} {scraped.year} official trailer youtube'
        if scraped.year
        else f'{scraped.title} official trailer youtube'
    )
    try:
        trailer_url = search_youtube(trailer_query)
    except Exception as exc:
        logger.warning('refetch: trailer search failed for %r: %s', title, exc)
        trailer_url = ''

    return {
        'title': scraped.title,
        'director': scraped.director,
        'year': scraped.year,
        'genres': [],
        'cast': [],
        'cover_url': '',
        'backdrop_url': '',
        'tmdb_id': '',
        'synopsis': synopsis,
        'trailer_url': trailer_url,
    }
