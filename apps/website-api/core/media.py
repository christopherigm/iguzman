"""Absolute URLs for stored media, from contexts that have no request.

`FileField.url` returns whatever the active storage backend produces, and that
changed shape when R2 landed: on the local filesystem it is a path
(``/media/pictures/…``), on R2 it is already an absolute URL on the tenant's CDN
hostname. Every caller that used to write ``f"{MEDIA_BASE_URL}{file.url}"`` -
the branded emails, mostly - would otherwise emit
``https://website-api.iguzman.com.mx https://cdn.example.com/…`` glued together,
which fails silently: an email client just shows a broken image.

Views and serializers that *do* have a request keep using
``request.build_absolute_uri(file.url)``, which needs no change - it returns an
already-absolute URL untouched.
"""

from __future__ import annotations

from django.conf import settings


def absolute_media_url(file_or_url) -> str:
    """An absolute URL for a FileField/FieldFile or a raw ``.url`` string.

    Returns ``""`` for an empty field, so callers can test the result rather than
    guarding the field first.
    """
    if not file_or_url:
        return ""

    url = file_or_url if isinstance(file_or_url, str) else getattr(file_or_url, "url", "")
    if not url:
        return ""
    if url.startswith(("http://", "https://", "//")):
        return url
    return f"{settings.MEDIA_BASE_URL}{url}"
