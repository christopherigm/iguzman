import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# When the combined search snippets are shorter than this, fall back to a full
# page extraction of the top result to gather richer text for the LLM.
_THIN_SNIPPET_THRESHOLD = 300
_SEARCH_RESULTS = 5
# Both scraper calls hit live web pages and can be slow: `/search` runs a web
# search (spec-oriented queries are slow to resolve) and `/extract` renders a
# full page (blu-ray.com spec sheets are heavy). Give both a generous budget.
_SEARCH_TIMEOUT = 90
_EXTRACT_TIMEOUT = 90


def _headers() -> dict:
    return {
        'Content-Type': 'application/json',
        'X-API-Key': settings.SCRAPER_API_KEY,
    }


def _search(query: str) -> list[dict]:
    resp = requests.post(
        f'{settings.SCRAPER_BASE_URL}/search',
        json={'query': query, 'maxResults': _SEARCH_RESULTS},
        headers=_headers(),
        timeout=_SEARCH_TIMEOUT,
    )
    resp.raise_for_status()
    # The scraper returns a bare JSON array of results; tolerate a
    # {"results": [...]} envelope too in case the service shape changes.
    data = resp.json()
    if isinstance(data, dict):
        return data.get('results') or []
    return data or []


def _extract(url: str) -> str:
    resp = requests.post(
        f'{settings.SCRAPER_BASE_URL}/extract',
        json={'url': url},
        headers=_headers(),
        timeout=_EXTRACT_TIMEOUT,
    )
    resp.raise_for_status()
    return (resp.json().get('content') or '').strip()


def _safe_extract(url: str) -> str:
    """Full-page extraction for `url`; '' on any failure (best-effort)."""
    try:
        return _extract(url)
    except Exception:
        logger.warning('Scraper /extract failed for %s; using snippets only', url)
        return ''


def _format_results(results: list[dict]) -> str:
    lines = []
    for r in results:
        title = (r.get('title') or '').strip()
        snippet = (r.get('snippet') or '').strip()
        if title or snippet:
            lines.append(f'{title}\n{snippet}'.strip())
    return '\n\n'.join(lines)


def search_image(query: str) -> str:
    """
    Return the first usable image URL (`og_image`) from a web search for
    `query`, or an empty string when none of the results carry one.

    Used as the wallpaper fallback when TMDB has no backdrop. Network/HTTP
    errors propagate to the caller (the backdrop fetch swallows them).
    """
    results = _search(query)
    for r in results:
        image = (r.get('og_image') or '').strip()
        if image:
            return image
    return ''


def search_youtube(query: str) -> str:
    """
    Return the first YouTube watch URL from a web search for `query`, or an
    empty string when none of the results point at a YouTube video.

    Used as the trailer fallback when TMDB carries no video. Network/HTTP
    errors propagate to the caller (the trailer fetch swallows them).
    """
    results = _search(query)
    for r in results:
        url = (r.get('url') or '').strip()
        if 'youtube.com/watch' in url or 'youtu.be/' in url:
            return url
    return ''


def scrape_text(query: str, priority_host: str = '') -> str:
    """
    Gather raw web text for an arbitrary `query` via the `scraper` microservice.

    Runs `POST /search` and concatenates the result snippets. When those
    snippets are thin, falls back to `POST /extract` on the top result URL to
    pull fuller page content.

    When `priority_host` is set and one of the results points at that host (e.g.
    ``blu-ray.com`` for disc tech specs), that page carries far richer data than
    its snippet, so its full page is extracted via `POST /extract` and prepended
    to the snippets - giving the LLM the authoritative source up front, followed
    by the remaining search context. A failed priority extract is swallowed and
    the flow falls back to the normal thin-snippet behavior.

    Returns the combined raw text (possibly empty on no results). Network and
    HTTP errors on the `POST /search` call propagate to the caller.
    """
    results = _search(query)
    if not results:
        logger.info('Scraper returned no results for query %r', query)
        return ''

    combined = _format_results(results)

    # A priority host's full spec page beats every snippet; lead with it and
    # append the remaining search context underneath.
    if priority_host:
        priority_url = next(
            (r.get('url') for r in results if priority_host in (r.get('url') or '')),
            None,
        )
        if priority_url:
            extracted = _safe_extract(priority_url)
            if extracted:
                return f'{extracted}\n\n{combined}' if combined else extracted

    if len(combined) >= _THIN_SNIPPET_THRESHOLD:
        return combined

    top_url = next((r.get('url') for r in results if r.get('url')), None)
    if not top_url:
        return combined

    extracted = _safe_extract(top_url)
    if not extracted:
        return combined

    return f'{combined}\n\n{extracted}' if combined else extracted


def scrape_barcode(barcode: str) -> str:
    """
    Gather raw web text about a barcode via the `scraper` microservice.

    Thin wrapper over `scrape_text`; kept as a named entry point for the scan
    resolution pipeline. Network and HTTP errors propagate to the caller (the
    Celery task handles retries).
    """
    return scrape_text(barcode)
