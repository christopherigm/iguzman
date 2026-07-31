"""Short-lived proof that a clip upload was legitimately reserved.

The clip itself never reaches this service - it is uploaded to the handler in
``apps/animals``, which has no way of its own to decide whether the caller is
allowed to write to a given media row. It could ask this API, but the answer
depends on things the read payload deliberately does not publish (a sighting's
``created_by``), so that would mean either a second privileged endpoint or a
looser serializer.

A ticket avoids both. The reserve endpoints - which *have* already made that
decision, under ``IsSiteAdmin`` or ``IsContributor`` - hand the browser a token
naming the row it may upload to, signed with the secret the handler already
shares (``VIDEO_HANDLER_TOKEN``). The handler verifies it locally and needs no
round-trip at all.

⚠ The signature covers the **media id and the sighting id together**. Signing the
media id alone would let a ticket for one entry's clip be replayed against
another's, since the handler is told both by the caller.
"""

import base64
import hashlib
import hmac
import json
import time

from django.conf import settings

# Long enough for a contributor on a slow connection to finish a multi-GB upload,
# short enough that a leaked ticket is not a standing permission. The upload has
# to *start* inside this window, not finish - the handler checks the ticket once,
# when the transfer is initiated.
TICKET_TTL_SECONDS = 6 * 60 * 60


def _sign(payload: bytes) -> str:
    return hmac.new(
        settings.VIDEO_HANDLER_TOKEN.encode(), payload, hashlib.sha256
    ).hexdigest()


def issue_upload_ticket(media) -> str:
    """A signed ``<payload>.<signature>`` naming the row this upload may write.

    Returns an empty string when no secret is configured - the handler refuses an
    unsigned ticket, so video simply does not work rather than working without
    authorisation.
    """
    if not settings.VIDEO_HANDLER_TOKEN:
        return ''

    payload = json.dumps(
        {
            'media_id': media.pk,
            'sighting_id': media.sighting_id,
            'expires': int(time.time()) + TICKET_TTL_SECONDS,
        },
        separators=(',', ':'),
        sort_keys=True,
    ).encode()

    encoded = base64.urlsafe_b64encode(payload).decode().rstrip('=')
    return f'{encoded}.{_sign(payload)}'
