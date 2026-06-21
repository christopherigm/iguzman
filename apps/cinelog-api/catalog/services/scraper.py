import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# When the combined search snippets are shorter than this, fall back to a full
# page extraction of the top result to gather richer text for the LLM.
_THIN_SNIPPET_THRESHOLD = 300
_SEARCH_RESULTS = 5
_TIMEOUT = 30


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
        timeout=_TIMEOUT,
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
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return (resp.json().get('content') or '').strip()


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


def scrape_text(query: str) -> str:
    """
    Gather raw web text for an arbitrary `query` via the `scraper` microservice.

    Runs `POST /search` and concatenates the result snippets. When those
    snippets are thin, falls back to `POST /extract` on the top result URL to
    pull fuller page content.

    Returns the combined raw text (possibly empty on no results). Network and
    HTTP errors propagate to the caller.
    """
    results = _search(query)
    if not results:
        logger.info('Scraper returned no results for query %r', query)
        return ''

    combined = _format_results(results)
    if len(combined) >= _THIN_SNIPPET_THRESHOLD:
        return combined

    top_url = next((r.get('url') for r in results if r.get('url')), None)
    if not top_url:
        return combined

    try:
        extracted = _extract(top_url)
    except Exception:
        logger.warning('Scraper /extract failed for %s; using snippets only', top_url)
        return combined

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
