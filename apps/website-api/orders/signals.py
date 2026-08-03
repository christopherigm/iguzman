"""Cache invalidation for booking availability.

The availability payload is derived from every active Booking at a branch, so
any write to one makes it wrong. The views already clear it on the paths they
own (checkout, the CMS actions), but those are not the only ways a Booking
changes: the Django admin, a cancelled order cascading, a management command and
a shell session all bypass them. A signal covers every route uniformly, which is
the same reasoning `core/signals.py` records for the System payload.

Deliberately coarse - it drops the whole `orders:availability:*` namespace rather
than the keys covering this booking's own dates. Working out which cached ranges
overlap one appointment would be more code than the query it saves, and the
payload it protects is a minute old at most anyway.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate_availability
from .models import Booking


@receiver(post_save, sender=Booking)
@receiver(post_delete, sender=Booking)
def invalidate_availability_on_booking_change(sender, instance, **kwargs):
    invalidate_availability()
