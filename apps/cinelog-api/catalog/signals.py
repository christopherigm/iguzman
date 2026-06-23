"""
Keep the related-movies cache fresh.

Any movie added, edited, or removed can change the suggestions shown for other
movies, so we invalidate the whole related cache (a cheap version bump) on every
Movie save/delete regardless of which code path made the change - the barcode
scan fast path, an Inbox accept, or a manual edit all funnel through here.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate_related_cache
from .models import Movie


@receiver(post_save, sender=Movie)
@receiver(post_delete, sender=Movie)
def _bust_related_cache(sender, **kwargs):
    invalidate_related_cache()
