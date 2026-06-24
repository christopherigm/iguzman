import logging

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from .models import Movie, ScanCandidate, ScanQueue
from .serializers import (
    resolve_audio_formats,
    resolve_hdr_formats,
    resolve_spoken_languages,
    resolve_subtitle_languages,
)
from .services.backdrop import fetch_backdrop
from .services.extract import extract_movie
from .services.extras import fetch_synopsis, fetch_trailer
from .services.refetch import resolve_movie_metadata
from .services.scraper import scrape_barcode
from .services.techspecs import fetch_tech_specs
from .services.tmdb import search_tmdb_candidates

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

    # ── Resolve full metadata (shared resolver) ─────────────────────────────────
    # The same year-aware TMDB match + extras + barcode-aware tech specs the
    # refetch / candidate-select endpoints use, so a freshly scanned entry carries
    # the identical data a manual refetch would produce. `raw_text` is reused for
    # the TMDB-miss text fallback (no second scrape). A failure never strands the
    # entry: the LLM extraction is already persisted above, so it still lands in
    # `review` for manual correction.
    try:
        preview = resolve_movie_metadata(
            title=scraped.title.strip(),
            year=scraped.year,
            barcode=entry.barcode,
            raw_text=raw_text,
        )
    except Exception as exc:
        logger.warning('resolve_scan_queue_entry: metadata resolve failed for %s: %s', entry.barcode, exc)
        preview = None

    if preview:
        entry.extracted_title = preview['title']
        entry.extracted_director = preview['director']
        entry.extracted_year = preview['year']
        entry.extracted_cast = preview['cast']
        entry.extracted_genres = preview['genres']
        entry.extracted_tmdb_id = preview['tmdb_id']
        entry.extracted_cover_url = preview['cover_url']
        entry.extracted_synopsis = preview['synopsis']
        entry.extracted_trailer_url = preview['trailer_url']
        entry.extracted_audio_formats = preview['audio_formats']
        entry.extracted_hdr_formats = preview['hdr_formats']
        entry.extracted_spoken_languages = preview['spoken_languages']
        entry.extracted_subtitle_languages = preview['subtitle_languages']
        # A non-empty tmdb_id marks an authoritative match; otherwise the title
        # came from the LLM fallback and may need manual correction in the Inbox.
        entry.error_message = '' if preview['tmdb_id'] else (
            'No TMDB match - LLM-extracted title saved for manual correction.'
        )
    else:
        # Nothing usable resolved - keep the LLM title for manual correction.
        entry.error_message = 'No TMDB match - LLM-extracted title saved for manual correction.'

    backdrop_url = preview['backdrop_url'] if preview else ''

    # ── Alternative candidates (best-effort) ───────────────────────────────────
    # The default match above is just the top result; a popular near-namesake can
    # outrank the right film. Persist the top few so the Inbox can offer a picker
    # to re-pin the exact match. We search with the LLM-extracted title (the same
    # query that fed the resolver) - NOT `entry.extracted_title`, which a TMDB hit
    # has already overwritten with the possibly-wrong top match's title. The year
    # is deliberately omitted: it may be exactly what's wrong, so constraining the
    # candidates by it would hide the right alternative. A failure never strands.
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
            backdrop_url,
            entry.extracted_title,
            entry.extracted_year,
        )
        if backdrop:
            entry.extracted_backdrop_image.save(backdrop.name, backdrop, save=False)
    except Exception as exc:
        logger.warning('resolve_scan_queue_entry: backdrop fetch failed for %s: %s', entry.barcode, exc)

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

    # Backfill disc technical specs only when the movie carries none yet, so a
    # re-dispatch never clobbers values an owner has since corrected. A barcode
    # for this fast-path movie pins the exact release when available.
    has_specs = (
        movie.audio_formats.exists()
        or movie.hdr_formats.exists()
        or movie.spoken_languages.exists()
        or movie.subtitle_languages.exists()
    )
    if not has_specs:
        barcode = movie.barcodes.values_list('code', flat=True).first() or ''
        try:
            specs = fetch_tech_specs(barcode=barcode, title=movie.title, year=movie.year)
        except Exception as exc:
            logger.warning('fetch_movie_extras: tech specs failed for %s: %s', movie.id, exc)
            specs = {}
        if specs.get('audio_formats'):
            movie.audio_formats.set(resolve_audio_formats(specs['audio_formats']))
        if specs.get('hdr_formats'):
            movie.hdr_formats.set(resolve_hdr_formats(specs['hdr_formats']))
        if specs.get('spoken_languages'):
            movie.spoken_languages.set(resolve_spoken_languages(specs['spoken_languages']))
        if specs.get('subtitle_languages'):
            movie.subtitle_languages.set(resolve_subtitle_languages(specs['subtitle_languages']))
