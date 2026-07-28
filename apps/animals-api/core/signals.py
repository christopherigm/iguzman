"""Cache invalidation for the site-settings payload.

The same rule as ``catalog/signals.py``: a receiver, not a line in the view's
write path, because an edit can arrive from the Django admin, a management
command or a shell session as easily as from a PATCH - and only a receiver
covers all of them.

The System payload is read on **every** page of the public site (it carries the
site name, the palette, the fonts and the watermark settings), so a stale one is
the most visible kind there is: a logo replaced in the CMS would keep serving
the old file for the full TTL, which reads exactly like a failed upload.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate
from . import cache_keys as keys
from .models import System


@receiver(post_save, sender=System)
@receiver(post_delete, sender=System)
def invalidate_on_system_change(sender, instance, **kwargs):
    invalidate(keys.SYSTEM)
