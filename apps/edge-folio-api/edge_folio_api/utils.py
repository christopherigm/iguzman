"""Shared utility functions for EdgeFolio API."""

_SUPPORTED_LOCALES = frozenset({'en', 'es', 'de', 'fr', 'pt'})

_LOCALE_NAMES = {
    'en': 'English',
    'es': 'Spanish',
    'de': 'German',
    'fr': 'French',
    'pt': 'Portuguese',
}


def locale_name(locale: str) -> str:
    """Return the English name of a supported locale."""
    return _LOCALE_NAMES.get(locale, 'English')


def parse_accept_language(header: str) -> str:
    """Extract the primary language tag from an Accept-Language header.

    ``"es-ES,es;q=0.9,en;q=0.8"`` → ``"es"``.
    Falls back to ``"en"`` when the header is missing or the tag is not supported.
    """
    if not header:
        return 'en'
    primary = header.split(',')[0].strip().split('-')[0].split('_')[0].lower()
    return primary if primary in _SUPPORTED_LOCALES else 'en'
