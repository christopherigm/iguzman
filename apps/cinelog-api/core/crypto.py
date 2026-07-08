"""
Symmetric encryption for secrets that must be stored recoverably (unlike a
password, which is one-way hashed). Used to keep users' S3 secret access keys
encrypted at rest - we have to be able to decrypt them again to sign requests
against their bucket.

The Fernet key comes from ``settings.S3_CREDENTIALS_ENCRYPTION_KEY`` when set;
otherwise it is derived deterministically from Django's ``SECRET_KEY`` so the
feature works out of the box. Deriving from ``SECRET_KEY`` means rotating that
key would make existing ciphertexts undecryptable - set a dedicated
``S3_CREDENTIALS_ENCRYPTION_KEY`` in any environment where ``SECRET_KEY`` rotates.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet
from django.conf import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    configured = getattr(settings, 'S3_CREDENTIALS_ENCRYPTION_KEY', '') or ''
    if configured:
        # Accept a ready-made urlsafe-base64 Fernet key verbatim; fall back to
        # deriving a valid key from an arbitrary passphrase.
        try:
            return Fernet(configured.encode())
        except (ValueError, TypeError):
            source = configured.encode()
    else:
        source = settings.SECRET_KEY.encode()

    digest = hashlib.sha256(source).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string, returning an ASCII ciphertext token safe to store."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Reverse :func:`encrypt`, returning the original plaintext string."""
    return _fernet().decrypt(token.encode()).decode()
