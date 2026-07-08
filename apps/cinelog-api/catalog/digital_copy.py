"""
Digital-copy URL resolution.

An ownership's ``digital_copy_url`` is one of two things:

* a plain provider/direct URL (YouTube, Prime, a public media file) - returned
  to the client verbatim, or
* an ``s3://<bucket_id>/<key>`` reference into one of the user's registered
  :class:`users.models.S3Bucket` credentials - which we sign into a short-lived
  https GET URL so the web / TV players can stream the private file directly.

Signed URLs are cached (per user + bucket + key) for a little under their TTL so
a page that serializes the same title repeatedly doesn't rebuild a boto3 client
and re-sign every time, and so the returned URL is stable within its window.
"""

from django.conf import settings
from django.core.cache import cache

S3_REF_PREFIX = 's3://'


def is_s3_ref(value: str) -> bool:
    return bool(value) and value.startswith(S3_REF_PREFIX)


def parse_s3_ref(value: str):
    """Split ``s3://<bucket_id>/<key>`` into ``(bucket_id, key)`` or ``None``."""
    if not is_s3_ref(value):
        return None
    bucket_id, _, key = value[len(S3_REF_PREFIX):].partition('/')
    if not bucket_id or not key:
        return None
    return bucket_id, key


def sign_digital_copy_url(value: str, user) -> str:
    """
    Resolve a stored ``digital_copy_url`` to a client-consumable URL.

    Plain URLs pass through unchanged. An ``s3://`` reference is signed with the
    matching bucket's credentials (owned by ``user``); an unresolvable reference
    (bucket deleted, bad credentials) returns '' so the player button hides
    rather than surfacing a broken link.
    """
    parsed = parse_s3_ref(value)
    if parsed is None:
        return value

    bucket_id, key = parsed
    cache_key = f'dcsign:{user.id}:{bucket_id}:{key}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Imported lazily to avoid a users<->catalog import cycle at module load.
    from users.models import S3Bucket
    from users.s3 import S3Error, presign_get_url

    try:
        bucket = S3Bucket.objects.get(pk=int(bucket_id), user=user)
    except (S3Bucket.DoesNotExist, ValueError, TypeError):
        return ''

    try:
        signed = presign_get_url(bucket, key)
    except S3Error:
        return ''

    ttl = settings.S3_DIGITAL_COPY_URL_TTL
    # Expire the cache an hour before the URL itself so we never hand back a URL
    # that's about to lapse mid-playback.
    cache.set(cache_key, signed, max(ttl - 3600, 60))
    return signed
