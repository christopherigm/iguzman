import logging

import requests
from django.core.files.base import ContentFile

from .scraper import search_image

logger = logging.getLogger(__name__)

_TIMEOUT = 15
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB - generous for a w1280 backdrop, caps abuse.

# Map the handful of image content types we accept to a file extension.
_EXT_BY_TYPE = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
}


def _download_image(url: str) -> ContentFile | None:
    """
    Fetch `url` and return its bytes as a named ContentFile, or None when the
    response is not a usable image (wrong content type, empty, oversized) or the
    request fails. Never raises - the backdrop is always best-effort.
    """
    try:
        resp = requests.get(url, timeout=_TIMEOUT)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning('backdrop: download failed for %s: %s', url, exc)
        return None

    content_type = resp.headers.get('Content-Type', '').split(';')[0].strip().lower()
    ext = _EXT_BY_TYPE.get(content_type)
    if not ext:
        logger.info('backdrop: %s is not a supported image (%s)', url, content_type)
        return None

    content = resp.content
    if not content or len(content) > _MAX_BYTES:
        logger.info('backdrop: %s rejected (size %d bytes)', url, len(content))
        return None

    return ContentFile(content, name=f'backdrop.{ext}')


def fetch_backdrop(tmdb_backdrop_url: str, title: str, year: int | None) -> ContentFile | None:
    """
    Resolve a wallpaper for a film and return its downloaded bytes.

    TMDB backdrop is preferred (wide, clean, authoritative). When TMDB has no
    backdrop (or the download fails), fall back to a web image search via the
    scraper microservice. Returns None when no usable image can be found - the
    caller treats the wallpaper as optional.
    """
    if tmdb_backdrop_url:
        image = _download_image(tmdb_backdrop_url)
        if image:
            return image

    if not title:
        return None

    query = f'{title} {year} movie wallpaper' if year else f'{title} movie wallpaper'
    try:
        image_url = search_image(query)
    except Exception as exc:
        logger.warning('backdrop: scraper image search failed for %r: %s', query, exc)
        return None

    return _download_image(image_url) if image_url else None
