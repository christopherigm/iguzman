"""
Symmetric encryption for secrets that must be stored recoverably (unlike a
password, which is one-way hashed). Used to keep each System's Stripe secret
key and webhook signing secret encrypted at rest - we have to be able to
decrypt them again to call Stripe on that tenant's behalf and to verify the
signature on its webhooks.

The Fernet key comes from ``settings.STRIPE_CREDENTIALS_ENCRYPTION_KEY`` when
set; otherwise it is derived deterministically from Django's ``SECRET_KEY`` so
the feature works out of the box. Deriving from ``SECRET_KEY`` means rotating
that key would make existing ciphertexts undecryptable - set a dedicated
``STRIPE_CREDENTIALS_ENCRYPTION_KEY`` in any environment where ``SECRET_KEY``
may rotate. This mirrors ``cinelog-api/core/crypto.py``.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet
from django.conf import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    configured = getattr(settings, 'STRIPE_CREDENTIALS_ENCRYPTION_KEY', '') or ''
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
