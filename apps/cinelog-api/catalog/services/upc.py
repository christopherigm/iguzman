import re

import requests

_UPC_API_URL = 'https://api.upcitemdb.com/prod/trial/lookup'

_FORMAT_PATTERNS = [
    (re.compile(r'\b4K(?:\s*UHD)?\b|\bUltra\s*HD\b', re.I), '4k'),
    (re.compile(r'\bBlu[- ]?ray\b', re.I), 'bluray'),
    (re.compile(r'\bDVD\b', re.I), 'dvd'),
]

# Strip format keywords and anything inside brackets/parens after the core title.
_STRIP_RE = re.compile(
    r'[\[\(]?\s*(?:4K(?:\s*UHD)?|Ultra\s*HD|Blu[- ]?ray|DVD'
    r'|Collector[\'s]*\s+Edition|Special\s+Edition'
    r'|Extended\s+Edition|Director[\'s]*\s+Cut'
    r'|Theatrical\s+Cut|Anniversary\s+Edition)\s*[\]\)]?',
    re.I,
)


def fetch_upc(barcode: str) -> tuple[str, str] | None:
    """
    Query UPCitemdb for a barcode.
    Returns (clean_title, format_hint) or None on miss/error.
    """
    try:
        resp = requests.get(_UPC_API_URL, params={'upc': barcode}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None

    items = data.get('items') or []
    if not items:
        return None

    raw_title: str = items[0].get('title', '').strip()
    if not raw_title:
        return None

    format_hint = ''
    for pattern, fmt in _FORMAT_PATTERNS:
        if pattern.search(raw_title):
            format_hint = fmt
            break

    clean = _STRIP_RE.sub(' ', raw_title)
    clean = re.sub(r'\s{2,}', ' ', clean).strip(' ,-:')

    return clean, format_hint
