"""Symmetric encryption helpers for BYOK provider credentials.

User-supplied API keys are encrypted at rest with Fernet. The key comes from
``settings.JOBS_ENCRYPTION_KEY`` (kept separate from ``SECRET_KEY`` so it can be
rotated independently). For local development, when no key is configured, a
deterministic key is derived from ``SECRET_KEY`` so the feature works without
extra setup - production must always set a real ``JOBS_ENCRYPTION_KEY``.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet
from django.conf import settings


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    key = settings.JOBS_ENCRYPTION_KEY
    if not key:
        # Dev fallback: derive a stable 32-byte url-safe key from SECRET_KEY.
        digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    if isinstance(key, str):
        key = key.encode()
    return Fernet(key)


def encrypt_key(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
