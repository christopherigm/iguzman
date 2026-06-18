"""System-funded JSearch trial credentials for newly-verified users.

A trial credential lets a user try the job-search feature on the platform's
JSearch key before bringing their own. It is a lifetime allowance of
``TRIAL_CALL_LIMIT`` searches (it never resets) and stores no key of its own -
fetches run on ``settings.JSEARCH_API_KEY``.
"""

import logging

from django.conf import settings
from django.core.cache import cache

from .models import TRIAL_CALL_LIMIT, TRIAL_LABEL, TRIAL_PROVIDER, UserApiCredential

logger = logging.getLogger(__name__)


def grant_trial_credential(user) -> UserApiCredential | None:
    """Give a newly-verified user a JSearch trial credential.

    No-op (returns ``None``) when the platform JSearch key isn't configured or
    the user already holds a JSearch credential (trial or BYOK) - the
    ``(user, provider)`` unique constraint allows only one. Safe to call more
    than once. Busts the user's credentials cache when a row is created.
    """
    if not settings.JSEARCH_API_KEY:
        logger.info('grant_trial_credential: JSEARCH_API_KEY not configured; skipping for user=%s', user.id)
        return None

    credential, created = UserApiCredential.objects.get_or_create(
        user=user,
        provider=TRIAL_PROVIDER,
        defaults={
            'is_trial': True,
            'call_limit': TRIAL_CALL_LIMIT,
            'label': TRIAL_LABEL,
            'is_active': True,
        },
    )
    if not created:
        return None

    cache.delete(f'jobs:credentials:{user.id}')
    logger.info('grant_trial_credential: granted %d-search trial to user=%s', TRIAL_CALL_LIMIT, user.id)
    return credential
