import logging

from .extract import extract_tech_specs
from .scraper import scrape_text

logger = logging.getLogger(__name__)

# All-empty result reused on every miss / failure - tech specs are best-effort
# and a barcode without a good disc-spec page simply lands no specs.
_EMPTY = {
    'audio_formats': [],
    'hdr_formats': [],
    'spoken_languages': [],
    'subtitle_languages': [],
}


def _query(barcode: str, title: str, year: int | None) -> str:
    """
    Build a search query biased toward a disc's technical-spec page.

    A barcode pins the exact physical release (blu-ray.com lists the UPC), so it
    leads the query when present; the title/year and the "blu-ray.com … specs"
    keywords steer the engine toward the spec sheet rather than a review.
    """
    parts = []
    if barcode:
        parts.append(barcode)
    if title:
        parts.append(title)
    if year:
        parts.append(str(year))
    parts.append('blu-ray.com audio subtitles HDR specifications')
    return ' '.join(parts)


def _has_specs(specs: dict) -> bool:
    """True when a scrape produced at least one usable spec signal."""
    return any(specs.get(key) for key in _EMPTY)


def _scrape_specs(query: str) -> dict:
    """Scrape one query and LLM-normalize it; all-empty on any miss / failure."""
    try:
        raw = scrape_text(query)
    except Exception as exc:
        logger.warning('tech specs: scrape failed for %r: %s', query, exc)
        return dict(_EMPTY)
    if not raw:
        return dict(_EMPTY)

    try:
        return extract_tech_specs(raw)
    except Exception as exc:
        logger.warning('tech specs: extract failed for %r: %s', query, exc)
        return dict(_EMPTY)


def fetch_tech_specs(barcode: str = '', title: str = '', year: int | None = None) -> dict:
    """
    Resolve a disc's technical specs (audio formats, HDR, audio + subtitle
    languages) by scraping a spec-oriented web search and LLM-normalizing the
    result onto the catalog's controlled vocabulary.

    A barcode pins the exact physical release, so when present it leads the first
    query; a barcode that only surfaces retail/listing pages (no spec signal)
    then falls back to a clean ``title + year`` query - the same one the refetch
    path uses - so both paths resolve the same specs. The fallback costs one extra
    scrape + LLM pass, and only on a barcode miss.

    Returns a dict with keys ``audio_formats`` / ``hdr_formats`` (canonical codes)
    and ``spoken_languages`` / ``subtitle_languages`` (English names). Fully
    best-effort: any scrape / LLM failure, or a page with no usable spec signal,
    yields all-empty lists and never raises.
    """
    if not (barcode or title):
        return dict(_EMPTY)

    if barcode:
        specs = _scrape_specs(_query(barcode, title, year))
        if _has_specs(specs) or not title:
            return specs
        # Barcode page carried no usable specs - retry on the title + year query.

    return _scrape_specs(_query('', title, year))
