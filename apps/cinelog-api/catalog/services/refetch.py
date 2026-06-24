import logging

from .extract import extract_movie, extract_synopsis
from .scraper import scrape_text, search_youtube
from .techspecs import fetch_tech_specs
from .tmdb import fetch_tmdb_by_id, fetch_tmdb_extras, search_tmdb

logger = logging.getLogger(__name__)


def _tech_specs(barcode: str, title: str, year: int | None) -> dict:
    """Best-effort disc tech specs for a preview (never raises).

    A barcode pins the exact physical release, so it leads the spec query and
    falls back to a clean ``title + year`` search inside ``fetch_tech_specs``.
    """
    try:
        return fetch_tech_specs(barcode=barcode, title=title, year=year)
    except Exception as exc:
        logger.warning('refetch: tech specs failed for %r: %s', title, exc)
        return {
            'audio_formats': [],
            'hdr_formats': [],
            'spoken_languages': [],
            'subtitle_languages': [],
        }


def _trailer_for(title: str, year: int | None) -> str:
    """Best-effort YouTube trailer search for a title (never raises)."""
    query = (
        f'{title} {year} official trailer youtube'
        if year
        else f'{title} official trailer youtube'
    )
    try:
        return search_youtube(query)
    except Exception as exc:
        logger.warning('refetch: trailer search failed for %r: %s', title, exc)
        return ''


def _from_tmdb(tmdb: dict, barcode: str, fallback_title: str = '') -> dict:
    """Assemble the standard preview dict from a resolved TMDB record.

    Layers the year-aware extras (synopsis + trailer) and barcode-aware tech
    specs on top of the core TMDB fields. Shared by every TMDB-hit path so the
    scan task and the refetch / select endpoints all emit the same shape.
    """
    extras = fetch_tmdb_extras(tmdb_id=tmdb['tmdb_id'])
    title = tmdb['title'] or fallback_title
    return {
        'title': title,
        'director': tmdb['director'],
        'year': tmdb['year'],
        'genres': tmdb['genres'],
        'cast': tmdb['cast'],
        'cover_url': tmdb['cover_url'],
        'backdrop_url': tmdb['backdrop_url'],
        'tmdb_id': tmdb['tmdb_id'],
        'synopsis': extras.get('synopsis', ''),
        'trailer_url': extras.get('trailer_url', ''),
        **_tech_specs(barcode, title, tmdb['year']),
    }


def _from_scraped_text(raw_text: str, barcode: str) -> dict | None:
    """Build a preview from raw web text via the LLM (TMDB-miss fallback).

    TMDB is the only source of cast / genres / poster / backdrop, so those stay
    empty here; the LLM fills the text fields and tech specs come from a barcode
    or title + year scrape. Returns None when no single film can be extracted.
    """
    try:
        scraped = extract_movie(raw_text)
    except Exception as exc:
        logger.warning('refetch: extract failed: %s', exc)
        return None
    if not scraped.title:
        return None

    try:
        synopsis = extract_synopsis(raw_text, scraped.title)
    except Exception as exc:
        logger.warning('refetch: synopsis extract failed for %r: %s', scraped.title, exc)
        synopsis = ''

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
        'trailer_url': _trailer_for(scraped.title, scraped.year),
        **_tech_specs(barcode, scraped.title, scraped.year),
    }


def resolve_movie_metadata(
    *,
    title: str,
    year: int | None = None,
    barcode: str = '',
    tmdb_id: str = '',
    raw_text: str = '',
) -> dict | None:
    """
    Single source of truth for resolving a film's full preview metadata, WITHOUT
    touching the database. Every path - the Celery scan task and the refetch /
    candidate-select endpoints - flows through here so they emit the same fields
    with the same fallbacks.

    Resolution order:
      1. TMDB match (year-aware): an explicit ``tmdb_id`` is pinned directly,
         otherwise ``search_tmdb(title, year)`` finds the best match.
      2. On a TMDB hit, layer year-aware extras (synopsis + trailer) and
         barcode-aware tech specs on top.
      3. On a TMDB miss, fall back to the LLM over web text: reuse ``raw_text``
         when the caller already scraped it (the scan task), otherwise scrape a
         ``title + year`` query here (the refetch endpoint).

    Returns the preview dict (keys: title, director, year, genres, cast,
    cover_url, backdrop_url, tmdb_id, synopsis, trailer_url, audio_formats,
    hdr_formats, spoken_languages, subtitle_languages). Returns None only when
    nothing usable can be resolved (no TMDB match and no extractable text).
    """
    title = (title or '').strip()
    tmdb_id = (tmdb_id or '').strip()

    # ── 1. TMDB authoritative match ─────────────────────────────────────────────
    if tmdb_id:
        tmdb = fetch_tmdb_by_id(tmdb_id)
    elif title:
        tmdb = search_tmdb(title, year)
    else:
        tmdb = None

    if tmdb:
        return _from_tmdb(tmdb, barcode, fallback_title=title)

    # ── 2. TMDB miss → LLM over web text ────────────────────────────────────────
    if not raw_text:
        if not title:
            return None
        query = f'{title} {year} movie' if year else f'{title} movie'
        try:
            raw_text = scrape_text(query)
        except Exception as exc:
            logger.warning('refetch: scrape failed for %r: %s', title, exc)
            return None
        if not raw_text:
            return None

    return _from_scraped_text(raw_text, barcode)


def refetch_movie_data_by_id(tmdb_id: str) -> dict | None:
    """
    Resolve a film's full preview metadata from an exact TMDB id.

    Used by the Inbox candidate picker: the user chose a specific result, so we
    pin its ``tmdb_id`` directly (no re-search that could drift back to the wrong
    title). Thin wrapper over :func:`resolve_movie_metadata`.
    """
    tmdb_id = (tmdb_id or '').strip()
    if not tmdb_id:
        return None
    return resolve_movie_metadata(tmdb_id=tmdb_id)


def refetch_movie_data(title: str, year: int | None, barcode: str = '') -> dict | None:
    """
    Re-resolve a film's metadata from TMDB (year-aware) with a scraper + LLM
    fallback, WITHOUT touching the database.

    ``year`` disambiguates remakes / re-releases that share a title - the user
    corrects it on the edit form to pin the exact version pressed on the disc.
    ``barcode`` (when known) pins the exact physical release for tech specs.

    Thin wrapper over :func:`resolve_movie_metadata`. Returns the preview dict,
    or None when nothing usable can be resolved.
    """
    title = (title or '').strip()
    if not title:
        return None
    return resolve_movie_metadata(title=title, year=year, barcode=barcode)
