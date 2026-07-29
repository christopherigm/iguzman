"""Absolute URLs for stored media, from contexts that have no request.

A port of website-api's ``core/media.py``, and for the same reason:
``FileField.url`` returns whatever the active storage backend produces, which
changed shape when R2 landed. On the local filesystem it is a path
(``/media/site/…``); on R2 it is already an absolute URL on the CDN hostname.
A caller that writes ``f"{MEDIA_BASE_URL}{file.url}"`` would therefore emit
``https://animals-api.iguzman.com.mx https://r2.iguzman.com.mx/…`` glued
together in production - which fails silently, since an email client just shows
a broken image.

Views and serializers that *do* have a request keep using
``request.build_absolute_uri(file.url)``: that needs no change, because it
returns an already-absolute URL untouched. This module is for the paths that
have no request at all - the branded emails in ``core/email.py``, today.
"""

from __future__ import annotations

from django.conf import settings


def absolute_media_url(file_or_url) -> str:
    """An absolute URL for a FileField/FieldFile or a raw ``.url`` string.

    Returns ``""`` for an empty field, so callers can test the result rather
    than guarding the field first.
    """
    if not file_or_url:
        return ""

    url = file_or_url if isinstance(file_or_url, str) else getattr(file_or_url, "url", "")
    if not url:
        return ""
    if url.startswith(("http://", "https://", "//")):
        return url
    return f"{settings.MEDIA_BASE_URL}{url}"
