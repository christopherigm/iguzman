import logging

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from .models import ScanQueue
from .services.extract import extract_movie
from .services.scraper import scrape_barcode
from .services.tmdb import search_tmdb

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
        # Don't let the hard limit SIGKILL the child and strand the entry —
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
        # No TMDB match — keep the LLM title for manual correction in the Inbox.
        entry.error_message = 'No TMDB match — LLM-extracted title saved for manual correction.'

    entry.status = 'review'
    entry.save()
