import logging

from .extract import extract_synopsis
from .scraper import scrape_text, search_youtube
from .tmdb import fetch_tmdb_extras

logger = logging.getLogger(__name__)


def _tmdb_extras(movie) -> dict:
    """TMDB synopsis + trailer for a Movie, by tmdb_id (preferred) or title."""
    try:
        return fetch_tmdb_extras(tmdb_id=movie.tmdb_id, title=movie.title)
    except Exception as exc:
        logger.warning('extras: TMDB lookup failed for %r: %s', movie.title, exc)
        return {'synopsis': '', 'trailer_url': ''}


def fetch_synopsis(movie) -> str:
    """
    Resolve a plot synopsis for a Movie.

    TMDB overview is preferred. When TMDB has none, fall back to a web search +
    page extraction via the scraper, distilled into a clean synopsis by the LLM.
    Returns an empty string when nothing usable can be found (best-effort).
    """
    tmdb = _tmdb_extras(movie)
    if tmdb.get('synopsis'):
        return tmdb['synopsis']

    if not movie.title:
        return ''

    query = (
        f'{movie.title} {movie.year} movie plot synopsis'
        if movie.year
        else f'{movie.title} movie plot synopsis'
    )
    try:
        raw = scrape_text(query)
        if raw:
            return extract_synopsis(raw, movie.title)
    except Exception as exc:
        logger.warning('extras: synopsis scrape failed for %r: %s', movie.title, exc)
    return ''


def fetch_trailer(movie) -> str:
    """
    Resolve a YouTube trailer URL for a Movie.

    TMDB videos are preferred. When TMDB has none, fall back to a web search for
    the official trailer on YouTube. Returns an empty string when nothing usable
    can be found (best-effort).
    """
    tmdb = _tmdb_extras(movie)
    if tmdb.get('trailer_url'):
        return tmdb['trailer_url']

    if not movie.title:
        return ''

    query = (
        f'{movie.title} {movie.year} official trailer youtube'
        if movie.year
        else f'{movie.title} official trailer youtube'
    )
    try:
        return search_youtube(query)
    except Exception as exc:
        logger.warning('extras: trailer scrape failed for %r: %s', movie.title, exc)
    return ''
