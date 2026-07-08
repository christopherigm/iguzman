"""
Per-user S3 access: build a boto3 client from a stored :class:`S3Bucket`, sign
short-lived GET URLs for a user's own media, and list bucket objects for the
web app's file picker.

Signing is a local operation (an HMAC over the request) - no network round-trip
- so presigning per movie is cheap; listing does hit the provider.
"""

from django.conf import settings

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError


class S3Error(Exception):
    """A bucket operation failed (bad credentials, missing permission, ...)."""


def _client(bucket):
    return boto3.client(
        's3',
        endpoint_url=bucket.endpoint_url,
        region_name=bucket.region or 'auto',
        aws_access_key_id=bucket.access_key_id,
        aws_secret_access_key=bucket.secret_access_key,
        # SigV4 + path-style addressing works across S3-compatible providers
        # (R2, B2, MinIO) whose custom endpoints don't support virtual-host style.
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'}),
    )


def presign_get_url(bucket, key: str, expires_in: int | None = None) -> str:
    """Return a presigned GET URL for ``key`` in ``bucket``, valid for the TTL."""
    if expires_in is None:
        expires_in = settings.S3_DIGITAL_COPY_URL_TTL
    try:
        return _client(bucket).generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket.bucket_name, 'Key': key},
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3Error(str(exc)) from exc


def list_objects(bucket, prefix: str = '', max_keys: int = 1000) -> list[dict]:
    """
    List objects in ``bucket`` under ``prefix`` (requires ListBucket permission).

    Returns lightweight dicts the picker renders. Folder placeholder keys (those
    ending in ``/``) are dropped - only real objects are selectable.
    """
    try:
        response = _client(bucket).list_objects_v2(
            Bucket=bucket.bucket_name,
            Prefix=prefix,
            MaxKeys=max_keys,
        )
    except (BotoCoreError, ClientError) as exc:
        raise S3Error(str(exc)) from exc

    return [
        {
            'key': obj['Key'],
            'size': obj['Size'],
            'last_modified': obj['LastModified'].isoformat(),
        }
        for obj in response.get('Contents', [])
        if not obj['Key'].endswith('/')
    ]
