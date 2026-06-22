import logging

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from .models import Movie, ScanCandidate, ScanQueue
from .services.backdrop import fetch_backdrop
from .services.extract import extract_movie, extract_synopsis
from .services.extras import fetch_synopsis, fetch_trailer
from .services.scraper import scrape_barcode, search_youtube
from .services.tmdb import fetch_tmdb_extras, search_tmdb, search_tmdb_candidates

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_DELAY = 60  # seconds between retries of a transient scraper/LLM failure


def _fail(entry: ScanQueue, message: str) -> None:
    """Mark an entry as a terminal failure with a human-readable reason."""
    entry.status = 'failed'
    entry.error_message = message
    entry.save(update_fields=['status', 'error_message', 'modified'])


@shared_task(bind=True, max_retries=_MAX_RETRIES, default_retry_delay=_RETRY_DELAY)
def resolve_scan_queue_entry(self, entry_id: int) -> None:
    """
    Slow-path resolution for a queued barcode (Phase 4.3 + 4.4).

    Pipeline:
        scraper microservice  →  LLM extraction (schema-enforced ScrapedMovie)
        →  TMDB authoritative match  →  persist to the ScanQueue entry as `review`.

    Error handling (4.4):
    - Transient scraper/LLM errors (network, rate-limit, timeout) are retried up
      to `_MAX_RETRIES` times before the entry is marked `failed`.
    - A barcode with no web results, or text the LLM can't resolve to a single
      film, is a terminal `failed`.
    - A successful extraction that TMDB cannot match still lands in `review`
      with the LLM-extracted title pre-filled, so it can be corrected by hand
      in the Inbox (TMDB stays the authoritative source on a hit).
    """
    try:
        entry = ScanQueue.objects.get(pk=entry_id)
    except ScanQueue.DoesNotExist:
        logger.warning('resolve_scan_queue_entry: entry %s no longer exists', entry_id)
        return

    entry.status = 'processing'
    entry.retry_count = self.request.retries
    entry.save(update_fields=['status', 'retry_count', 'modified'])

    # ── Scrape + LLM extraction (transient failures are retried) ────────────────
    try:
        raw_text = scrape_barcode(entry.barcode)
        if not raw_text:
            _fail(entry, 'No web results found for this barcode.')
            return
        scraped = extract_movie(raw_text)
    except SoftTimeLimitExceeded:
        # Don't let the hard limit SIGKILL the child and strand the entry -
        # surface a terminal failure the Inbox can act on.
        _fail(entry, 'Resolution timed out while scraping/extracting.')
        return
    except Exception as exc:
        logger.warning(
            'resolve_scan_queue_entry: scrape/extract failed for %s (attempt %s/%s): %s',
            entry.barcode, self.request.retries + 1, _MAX_RETRIES + 1, exc,
        )
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            _fail(entry, f'Scrape/extract failed after {_MAX_RETRIES} retries: {exc}')
        return

    if not scraped.title.strip():
        entry.raw_scraped_text = raw_text
        entry.save(update_fields=['raw_scraped_text', 'modified'])
        _fail(entry, 'Could not identify a single movie from the web results.')
        return

    # Persist the LLM extraction up front so it survives a TMDB miss (4.4 fallback).
    entry.raw_scraped_text = raw_text
    entry.extracted_title = scraped.title.strip()
    entry.extracted_year = scraped.year
    entry.extracted_director = scraped.director.strip()

    # ── TMDB authoritative match ────────────────────────────────────────────────
    # A TMDB error here must not strand the entry: the LLM extraction is already
    # persisted above, so fall through to `review` for manual correction.
    try:
        tmdb = search_tmdb(scraped.title)
    except Exception as exc:
        logger.warning('resolve_scan_queue_entry: TMDB lookup failed for %s: %s', entry.barcode, exc)
        tmdb = None
    if tmdb:
        entry.extracted_title = tmdb['title']
        entry.extracted_director = tmdb['director']
        entry.extracted_year = tmdb['year']
        entry.extracted_cast = tmdb['cast']
        entry.extracted_genres = tmdb['genres']
        entry.extracted_tmdb_id = tmdb['tmdb_id']
        entry.extracted_cover_url = tmdb['cover_url']
        entry.error_message = ''
    else:
        # No TMDB match - keep the LLM title for manual correction in the Inbox.
        entry.error_message = 'No TMDB match - LLM-extracted title saved for manual correction.'

    # ── Alternative candidates (best-effort) ───────────────────────────────────
    # The default match above is just the top result; a popular near-namesake can
    # outrank the right film. Persist the top few so the Inbox can offer a picker
    # to re-pin the exact match. We search with the LLM-extracted title (the same
    # query that fed `search_tmdb`) - NOT `entry.extracted_title`, which a TMDB
    # hit has already overwritten with the possibly-wrong top match's title. A
    # failure here never strands the entry.
    try:
        candidates = search_tmdb_candidates(scraped.title.strip())
    except Exception as exc:
        logger.warning('resolve_scan_queue_entry: candidate search failed for %s: %s', entry.barcode, exc)
        candidates = []

    # ── Backdrop wallpaper (best-effort) ───────────────────────────────────────
    # TMDB backdrop first, web-image fallback. A failure here never strands the
    # entry: the wallpaper is decorative and the entry still lands in `review`.
    try:
        backdrop = fetch_backdrop(
            tmdb['backdrop_url'] if tmdb else '',
            entry.extracted_title,
            entry.extracted_year,
        )
        if backdrop:
            entry.extracted_backdrop_image.save(backdrop.name, backdrop, save=False)
    except Exception as exc:
        logger.warning('resolve_scan_queue_entry: backdrop fetch failed for %s: %s', entry.barcode, exc)

    # ── Synopsis + trailer (best-effort) ───────────────────────────────────────
    # TMDB overview / videos are preferred; on a miss reuse the text already
    # scraped above for the synopsis (no second scrape) and a YouTube search for
    # the trailer. A failure here never strands the entry - both are decorative
    # and the entry still lands in `review`.
    try:
        extras = fetch_tmdb_extras(
            tmdb_id=entry.extracted_tmdb_id,
            title=entry.extracted_title,
        )
    except Exception as exc:
        logger.warning('resolve_scan_queue_entry: extras fetch failed for %s: %s', entry.barcode, exc)
        extras = {'synopsis': '', 'trailer_url': ''}

    synopsis = extras.get('synopsis', '')
    if not synopsis:
        try:
            synopsis = extract_synopsis(raw_text, entry.extracted_title)
        except Exception as exc:
            logger.warning('resolve_scan_queue_entry: synopsis extract failed for %s: %s', entry.barcode, exc)
            synopsis = ''
    entry.extracted_synopsis = synopsis

    trailer_url = extras.get('trailer_url', '')
    if not trailer_url and entry.extracted_title:
        query = (
            f'{entry.extracted_title} {entry.extracted_year} official trailer youtube'
            if entry.extracted_year
            else f'{entry.extracted_title} official trailer youtube'
        )
        try:
            trailer_url = search_youtube(query)
        except Exception as exc:
            logger.warning('resolve_scan_queue_entry: trailer search failed for %s: %s', entry.barcode, exc)
            trailer_url = ''
    entry.extracted_trailer_url = trailer_url

    entry.status = 'review'
    entry.save()

    # Persist the alternative matches now the entry has a saved pk. Replace any
    # from a previous resolution attempt so a retry never stacks duplicates.
    entry.candidates.all().delete()
    if candidates:
        ScanCandidate.objects.bulk_create([
            ScanCandidate(
                entry=entry,
                tmdb_id=c['tmdb_id'],
                title=c['title'],
                year=c['year'],
                cover_url=c['cover_url'],
                overview=c['overview'],
                sort_order=index,
            )
            for index, c in enumerate(candidates)
        ])


@shared_task
def fetch_movie_backdrop(movie_id: int, backdrop_url: str = '') -> None:
    """
    Download a wallpaper for a fast-path Movie out of band (Phase 4 step 4).

    The scan endpoint saves the Movie synchronously and dispatches this so the
    request isn't blocked on image I/O (TMDB download + possible web-search
    fallback). Best-effort: a Movie without a backdrop simply renders the plain
    detail layout.
    """
    try:
        movie = Movie.objects.get(pk=movie_id)
    except Movie.DoesNotExist:
        logger.warning('fetch_movie_backdrop: movie %s no longer exists', movie_id)
        return

    if movie.backdrop_image:
        return  # Already has one - don't re-fetch or clobber.

    backdrop = fetch_backdrop(backdrop_url, movie.title, movie.year)
    if backdrop:
        movie.backdrop_image.save(backdrop.name, backdrop, save=True)


@shared_task
def fetch_movie_extras(movie_id: int) -> None:
    """
    Backfill a fast-path Movie's synopsis and trailer out of band (Phase 4).

    The scan endpoint dispatches this so the request isn't blocked on the TMDB
    detail calls (and possible scraper/LLM fallbacks). Each field is fetched
    only when still empty, so a re-dispatch never clobbers existing values.
    Best-effort: a Movie without a synopsis or trailer simply renders without.
    """
    try:
        movie = Movie.objects.get(pk=movie_id)
    except Movie.DoesNotExist:
        logger.warning('fetch_movie_extras: movie %s no longer exists', movie_id)
        return

    update_fields = []

    if not movie.synopsis:
        synopsis = fetch_synopsis(movie)
        if synopsis:
            movie.synopsis = synopsis
            update_fields.append('synopsis')

    if not movie.trailer_url:
        trailer_url = fetch_trailer(movie)
        if trailer_url:
            movie.trailer_url = trailer_url
            update_fields.append('trailer_url')

    if update_fields:
        update_fields.append('modified')
        movie.save(update_fields=update_fields)
