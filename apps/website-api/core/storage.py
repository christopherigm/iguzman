"""Cloudflare R2 media storage, routed per tenant.

Production stores every uploaded file - images and backup archives alike - in
Cloudflare R2, and **only** there. The browser fetches media from Cloudflare's
edge instead of the API pod, and the pod is stateless: the hostPath volume that
a node failure used to take with it, and the nginx sidecar that published it
under ``/media/``, are gone.

With ``R2_ACCOUNT_ID`` unset, ``settings.py`` never installs any of this and
files go to ``MEDIA_ROOT`` on local disk - that is **development only**, so
``runserver`` and the test suite need no Cloudflare account. It is not a
production fallback: there is no durable path under a pod any more, so uploads
would survive only until the next rollout.

Two levels of bucket
--------------------

* The **platform** bucket (``R2_*`` env vars) is the default for every tenant.
  One bucket, one Cloudflare account, paths namespaced per tenant.
* A tenant on its own domain can connect **its own R2 account** in the CMS
  (``/admin/system`` → Storage). Its uploads then go to its bucket and serve from
  its own CDN hostname, so the customer owns their assets and their bandwidth
  bill. Files already on the platform bucket stay there and keep working - a
  legacy, unprefixed name always resolves to the platform bucket, so switching
  a tenant over splits its media across two buckets rather than breaking it.

How a file finds its bucket
---------------------------

``TenantMediaStorage`` reads the tenant out of the file's **name** (see
``core.tenant_paths`` for why it cannot come from a request or from
``FileField(storage=…)``), then delegates every operation to that tenant's
backend. Names with no tenant prefix - everything written before this landed -
resolve to the platform bucket.

⚠ **This bucket is public.** A custom domain on an R2 bucket serves every object
in it, with no notion of an ACL. That is what makes images fast, and it also
means a **backup archive is one correct URL away from anonymous download** - and
a backup is the tenant's whole database, customer accounts and order history
included. The nginx ``^~ /media/backups/`` deny rule that used to be the second
lock went with the sidecar and has no equivalent on a bucket - R2 has no
per-object ACLs. What still protects it: ``backup_upload_path`` gives
every archive a uuid4 name, ``SiteBackupSerializer`` never exposes ``file``, and
``SiteBackupDownloadView`` (which matches the row against the caller's System) is
the only path that ever produces a URL for one. To restore a real second lock,
add a Cloudflare WAF rule on the public hostname blocking ``/t/*/backups/*``;
requests through the S3 endpoint - which is all this code uses - are unaffected
by it.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from django.conf import settings
from django.core.files.storage import Storage

from core.tenant_paths import system_id_from_name

logger = logging.getLogger(__name__)

# How long a worker may keep serving a tenant's storage config before re-reading
# it. A credential change in the CMS therefore reaches every gunicorn worker
# within this window (the worker that handled the save is cleared immediately by
# the post_save receiver in core.signals). Kept short because the cost of being
# stale is uploads going to the old bucket; kept non-zero because `url()` runs
# once per image per page render and must not be a database query.
CONFIG_TTL_SECONDS = 60

# Fields read off System to build a tenant backend. The secret stays **encrypted**
# in this cache: the memo outlives the request, and a plaintext R2 key sitting in
# a long-lived process dict is a credential at rest for no benefit - decrypting
# costs microseconds and happens once per backend build, not per lookup.
_CONFIG_FIELDS = (
    "storage_enabled",
    "storage_account_id",
    "storage_access_key_id",
    "storage_secret_access_key_encrypted",
    "storage_bucket_name",
    "storage_public_domain",
)

# system_id -> (expires_at, config | None)
_config_memo: dict[int, tuple[float, dict | None]] = {}
# fingerprint -> S3Boto3Storage. Backends are stateless and hold a boto3 session,
# so building one per request would throw away connection pooling.
_backend_memo: dict[tuple, Storage] = {}


# --------------------------------------------------------------------------- #
# Building backends
# --------------------------------------------------------------------------- #

def build_r2_storage(
    *,
    account_id: str,
    access_key_id: str,
    secret_access_key: str,
    bucket_name: str,
    public_domain: str = "",
) -> Storage:
    """An S3Boto3Storage pointed at one R2 bucket.

    ``public_domain`` is the custom hostname mapped to the bucket in Cloudflare.
    With one, URLs are plain unsigned ``https://<domain>/<key>`` - cacheable,
    CDN-served, stable. Without one there is no public route to the object at
    all, so URLs fall back to **presigned** S3-endpoint links: they work, but
    they expire, change on every render, and defeat both CDN and browser caching.
    A tenant without a custom domain is configured, just slow.
    """
    from storages.backends.s3boto3 import S3Boto3Storage

    return S3Boto3Storage(
        bucket_name=bucket_name,
        access_key=access_key_id,
        secret_key=secret_access_key,
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        custom_domain=public_domain or None,
        # R2 has no regions; the SDK still requires the field to sign.
        region_name="auto",
        querystring_auth=not public_domain,
        # R2 rejects ACL headers outright - it has no per-object ACLs.
        default_acl=None,
        # Names are uuid4-based, so a collision means something is wrong; suffix
        # rather than silently overwrite whatever is already at that key.
        file_overwrite=False,
    )


def _cached_backend(key: tuple, **kwargs) -> Storage:
    backend = _backend_memo.get(key)
    if backend is None:
        backend = build_r2_storage(**kwargs)
        _backend_memo[key] = backend
    return backend


def platform_storage() -> Storage:
    """The default bucket - every tenant that has not connected its own."""
    account_id = getattr(settings, "R2_ACCOUNT_ID", "")
    bucket = getattr(settings, "R2_BUCKET_NAME", "")
    domain = getattr(settings, "R2_PUBLIC_DOMAIN", "")
    return _cached_backend(
        ("platform", account_id, bucket, domain),
        account_id=account_id,
        access_key_id=getattr(settings, "R2_ACCESS_KEY_ID", ""),
        secret_access_key=getattr(settings, "R2_SECRET_ACCESS_KEY", ""),
        bucket_name=bucket,
        public_domain=domain,
    )


# --------------------------------------------------------------------------- #
# Per-tenant configuration
# --------------------------------------------------------------------------- #

def config_from_system(system) -> dict | None:
    """A System's own R2 config, or None when it uses the platform bucket.

    All of enabled + account + key + secret + bucket must be present: a
    half-filled form must not silently start writing somewhere unreachable, so an
    incomplete config is *no* config and the tenant stays on the platform bucket.
    """
    if system is None or not getattr(system, "storage_enabled", False):
        return None
    cfg = {f: getattr(system, f, "") for f in _CONFIG_FIELDS}
    return cfg if _is_complete(cfg) else None


def _is_complete(cfg: dict) -> bool:
    return bool(
        cfg.get("storage_enabled")
        and cfg.get("storage_account_id")
        and cfg.get("storage_access_key_id")
        and cfg.get("storage_secret_access_key_encrypted")
        and cfg.get("storage_bucket_name")
    )


def _tenant_config(system_id: int) -> dict | None:
    now = time.monotonic()
    hit = _config_memo.get(system_id)
    if hit is not None and hit[0] > now:
        return hit[1]

    from django.db import DatabaseError

    from core.models import System

    try:
        row = System.objects.filter(pk=system_id).values(*_CONFIG_FIELDS).first()
    except DatabaseError:
        # This runs inside `url()`, which is called once per image per page
        # render - so a database hiccup here would 500 every page that shows a
        # picture. The column not existing yet is the realistic case: between a
        # deploy and its migration, every request would otherwise fail on an
        # image URL. Fall back to the platform bucket, which is where the file
        # is anyway until a tenant configures otherwise, and memoise the miss so
        # a broken connection is not retried once per image.
        logger.exception("Cannot read storage config for system %s", system_id)
        _config_memo[system_id] = (now + CONFIG_TTL_SECONDS, None)
        return None

    cfg = row if row and _is_complete(row) else None
    _config_memo[system_id] = (now + CONFIG_TTL_SECONDS, cfg)
    return cfg


def forget_system(system_id: int | None = None) -> None:
    """Drop memoised storage config, so the next lookup re-reads the database.

    Called from ``core.signals`` when a System is saved. It only clears *this*
    worker - the others catch up within ``CONFIG_TTL_SECONDS``.
    """
    if system_id is None:
        _config_memo.clear()
    else:
        _config_memo.pop(system_id, None)


def tenant_storage(system_id: int | None) -> Storage | None:
    """The tenant's own backend, or None if it uses the platform bucket."""
    if not system_id:
        return None
    cfg = _tenant_config(system_id)
    if cfg is None:
        return None

    from core.crypto import decrypt

    try:
        secret = decrypt(cfg["storage_secret_access_key_encrypted"])
    except Exception:
        # Ciphertext from another environment, or the encryption key rotated.
        # Falling back to the platform bucket keeps the site serving; failing
        # here would 500 every page that renders an image.
        logger.exception("Cannot decrypt R2 secret for system %s", system_id)
        return None

    return _cached_backend(
        (
            "tenant",
            system_id,
            cfg["storage_account_id"],
            cfg["storage_bucket_name"],
            cfg["storage_public_domain"],
            cfg["storage_access_key_id"],
        ),
        account_id=cfg["storage_account_id"],
        access_key_id=cfg["storage_access_key_id"],
        secret_access_key=secret,
        bucket_name=cfg["storage_bucket_name"],
        public_domain=cfg["storage_public_domain"],
    )


# --------------------------------------------------------------------------- #
# The default storage
# --------------------------------------------------------------------------- #

class TenantMediaStorage(Storage):
    """Routes each file to its tenant's bucket, decided by the file's own name.

    A thin delegator, deliberately: it owns no I/O of its own, so anything
    django-storages fixes or gains applies here untouched. Every method that
    takes a ``name`` resolves a backend from it; the two that do not
    (``generate_filename``, ``get_valid_name``) are pure string handling and go
    to the platform backend, which is safe because all backends here are the same
    class and normalise names identically.
    """

    def backend_for(self, name: str) -> Storage:
        return tenant_storage(system_id_from_name(name)) or platform_storage()

    # -- reads ------------------------------------------------------------- #
    def _open(self, name, mode="rb"):
        return self.backend_for(name)._open(name, mode)

    def exists(self, name):
        return self.backend_for(name).exists(name)

    def size(self, name):
        return self.backend_for(name).size(name)

    def url(self, name):
        return self.backend_for(name).url(name)

    def listdir(self, path):
        return self.backend_for(path).listdir(path)

    def get_accessed_time(self, name):
        return self.backend_for(name).get_accessed_time(name)

    def get_created_time(self, name):
        return self.backend_for(name).get_created_time(name)

    def get_modified_time(self, name):
        return self.backend_for(name).get_modified_time(name)

    def path(self, name):
        # No local path exists for an object in a bucket. Raising
        # NotImplementedError is the documented contract and is what callers
        # (including Django's own ImageField validation) check for.
        return self.backend_for(name).path(name)

    # -- writes ------------------------------------------------------------ #
    def _save(self, name, content):
        return self.backend_for(name)._save(name, content)

    def delete(self, name):
        return self.backend_for(name).delete(name)

    def get_available_name(self, name, max_length=None):
        return self.backend_for(name).get_available_name(name, max_length=max_length)

    # -- naming ------------------------------------------------------------ #
    def generate_filename(self, filename):
        return platform_storage().generate_filename(filename)

    def get_valid_name(self, name):
        return platform_storage().get_valid_name(name)


# --------------------------------------------------------------------------- #
# Credential checking (the CMS "Test connection" button)
# --------------------------------------------------------------------------- #

TEST_KEY = ".connection-test"


def test_credentials(
    *,
    account_id: str,
    access_key_id: str,
    secret_access_key: str,
    bucket_name: str,
    public_domain: str = "",
) -> dict[str, Any]:
    """Write, read back and delete one tiny object. Returns {ok, detail}.

    A round-trip rather than a bucket listing, because listing succeeds with
    read-only credentials and the failure would then only surface later, on a
    customer's upload. Errors are returned rather than raised so the CMS can show
    the operator what Cloudflare actually said - a wrong bucket name and a wrong
    secret are very different fixes.
    """
    from botocore.exceptions import BotoCoreError, ClientError
    from django.core.files.base import ContentFile

    missing = [
        label
        for label, value in (
            ("account ID", account_id),
            ("access key ID", access_key_id),
            ("secret access key", secret_access_key),
            ("bucket name", bucket_name),
        )
        if not value
    ]
    if missing:
        return {"ok": False, "detail": f"Missing: {', '.join(missing)}."}

    storage = build_r2_storage(
        account_id=account_id,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        bucket_name=bucket_name,
        public_domain=public_domain,
    )

    written = None
    try:
        written = storage.save(TEST_KEY, ContentFile(b"ok"))
        with storage.open(written) as fh:
            if fh.read() != b"ok":
                return {"ok": False, "detail": "Wrote an object but read back different bytes."}
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        detail = exc.response.get("Error", {}).get("Message", str(exc))
        if code in ("NoSuchBucket", "404"):
            return {"ok": False, "detail": f"Bucket '{bucket_name}' not found in this account."}
        if code in ("InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied", "403"):
            return {"ok": False, "detail": "Credentials rejected by Cloudflare (check the key pair and its bucket permissions)."}
        return {"ok": False, "detail": f"{code}: {detail}" if code else detail}
    except BotoCoreError as exc:
        # Endpoint unreachable / DNS - almost always a mistyped account ID.
        return {"ok": False, "detail": f"Could not reach the R2 endpoint for account '{account_id}'. {exc}"}
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator, not swallowed
        logger.exception("R2 connection test failed")
        return {"ok": False, "detail": str(exc)}
    finally:
        if written:
            try:
                storage.delete(written)
            except Exception:
                logger.warning("Could not clean up R2 test object %s", written)

    if not public_domain:
        return {
            "ok": True,
            "detail": "Connected. No public domain set, so images will be served with expiring signed links instead of from the CDN.",
        }
    return {"ok": True, "detail": "Connected. Read, wrote and deleted a test object."}
