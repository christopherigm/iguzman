"""Thin client for the `scraper` microservice (https://scraper.iguzman.com.mx).

Ported from `website-api/core/services/scraper.py`: a `POST /search` web search
whose result snippets are concatenated for an LLM, falling back to a full-page
`POST /extract` of the top result when those snippets are too thin to be useful.

Every AI/scrape call in this stack lives in the backend, alongside
`core/services/llm.py` - the frontend is a public journal and holds no API keys.

**The service is optional.** `is_configured()` is false when `SCRAPER_API_KEY` is
unset, and the research endpoint then works from the model's own knowledge
instead of live sources - the same degradation shape as Groq→OpenRouter. A
missing key is a smaller answer, never a 500.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# When the combined search snippets are shorter than this, fall back to a full
# page extraction of the top result to gather richer text for the LLM.
_THIN_SNIPPET_THRESHOLD = 300
_SEARCH_RESULTS = 5

# Both calls hit live web pages and can be slow: `/search` runs a web search and
# `/extract` renders a full page. This runs inside the request, under gunicorn's
# worker timeout (GUNICORN_TIMEOUT, 600 in the cluster), so search + a fallback
# extract + the LLM call must fit inside it with room to spare.
_SEARCH_TIMEOUT = 45
_EXTRACT_TIMEOUT = 45


def is_configured() -> bool:
    """Whether the scraper can be called at all."""
    return bool(settings.SCRAPER_BASE_URL and settings.SCRAPER_API_KEY)


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


def search_results(query: str) -> list[dict]:
    """Web-search results for `query`: a list of ``{title, url, snippet}``.

    Each result keeps its URL so an extracted fact can be attributed back to the
    page it came from - which is what lets the research endpoint return its
    sources and lets the caller reject any URL the model invented.

    Returns ``[]`` when the scraper is not configured or found nothing; results
    with no URL are dropped. Network/HTTP errors on the search call propagate.
    """
    if not is_configured():
        return []

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


def scrape_text(query: str) -> str:
    """Gather raw web text for an arbitrary `query`.

    Runs the search and concatenates the result snippets. When those snippets are
    thin, falls back to a full-page extraction of the top result to pull richer
    content (a species description, say, that a snippet truncates).

    Returns the combined raw text, or '' when the scraper is unconfigured or
    found nothing. Errors on the search call propagate to the caller.
    """
    results = search_results(query)
    if not results:
        logger.info('Scraper returned no results for query %r', query)
        return ''

    combined = '\n\n'.join(
        f"{r['title']}\n{r['snippet']}".strip() for r in results if r['title'] or r['snippet']
    )
    if len(combined) >= _THIN_SNIPPET_THRESHOLD:
        return combined

    top_url = next((r['url'] for r in results), None)
    extracted = _safe_extract(top_url) if top_url else ''
    if not extracted:
        return combined
    return f'{combined}\n\n{extracted}' if combined else extracted
