"""Thin client for the `scraper` microservice (https://scraper.iguzman.com.mx).

Mirrors `cinelog-api/catalog/services/scraper.py`: a `POST /search` web search
whose result snippets are concatenated for an LLM, falling back to a full-page
`POST /extract` of the top result when those snippets are too thin to be useful.

Every AI/scrape call in the website stack lives in the backend (never the Next.js
app), alongside `core/services/llm.py`.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# When the combined search snippets are shorter than this, fall back to a full
# page extraction of the top result to gather richer text for the LLM.
_THIN_SNIPPET_THRESHOLD = 300
_SEARCH_RESULTS = 5
# Both scraper calls hit live web pages and can be slow: `/search` runs a web
# search and `/extract` renders a full page. Unlike cinelog (which scrapes in a
# Celery task), website-api runs this inside the request, under gunicorn's 120s
# worker timeout - so search + a fallback extract + the LLM call must fit there.
# 45 + 45 + LLM_REQUEST_TIMEOUT(20) = 110s, comfortably under 120.
_SEARCH_TIMEOUT = 45
_EXTRACT_TIMEOUT = 45


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


def scrape_text(query: str) -> str:
    """
    Gather raw web text for an arbitrary `query` via the `scraper` microservice.

    Runs `POST /search` and concatenates the result snippets. When those snippets
    are thin, falls back to `POST /extract` on the top result URL to pull fuller
    page content (a nutrition-facts table, say, that a snippet truncates).

    Returns the combined raw text (possibly empty on no results). Network and
    HTTP errors on the `POST /search` call propagate to the caller.
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

    extracted = _safe_extract(top_url)
    if not extracted:
        return combined

    return f'{combined}\n\n{extracted}' if combined else extracted


def search_results(query: str) -> list[dict]:
    """Raw web-search results for `query`: a list of ``{title, url, snippet}``.

    Unlike `scrape_text`, this preserves each result's URL, so a caller can
    attribute extracted facts back to their source page - e.g. the provider links
    a price lookup wants to keep. Results with no URL are dropped. Best-effort:
    returns ``[]`` on no results; network/HTTP errors on the search call
    propagate to the caller.
    """
    out = []
    for r in _search(query):
        url = (r.get('url') or '').strip()
        if not url:
            continue
        out.append({
            'title': (r.get('title') or '').strip(),
            'url': url,
            'snippet': (r.get('snippet') or '').strip(),
        })
    return out
