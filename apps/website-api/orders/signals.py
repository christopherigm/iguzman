"""Cache invalidation for booking availability.

The availability payload is derived from every active Booking at a branch **and
from the resources those bookings sit on**, so a write to either makes it wrong.
The views already clear it on the paths they own (checkout, the CMS actions), but
those are not the only ways they change: the Django admin, a cancelled order
cascading, a management command and a shell session all bypass them. A signal
covers every route uniformly, which is the same reasoning `core/signals.py`
records for the System payload.

Deliberately coarse - it drops the whole `orders:availability:*` namespace rather
than the keys covering this booking's own dates. Working out which cached ranges
overlap one appointment would be more code than the query it saves, and the
payload it protects is a minute old at most anyway.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.models import BookingResource, Branch, BranchHours, ResourcePool

from .cache import invalidate_availability
from .models import Booking


@receiver(post_save, sender=Booking)
@receiver(post_delete, sender=Booking)
def invalidate_availability_on_booking_change(sender, instance, **kwargs):
    invalidate_availability()


# The supply side of the same payload. Editing a boat from ten seats to eight
# changes what every calendar at that branch may offer, and a tenant who does it
# has to see the effect now - not whenever the next booking happens to clear the
# namespace for them. Disabling a pool, or deleting a resource outright, is the
# same story in its sharpest form: those seats stop existing immediately.
@receiver(post_save, sender=ResourcePool)
@receiver(post_delete, sender=ResourcePool)
@receiver(post_save, sender=BookingResource)
@receiver(post_delete, sender=BookingResource)
def invalidate_availability_on_resource_change(sender, instance, **kwargs):
    invalidate_availability()


# Everything else the engine reads: the branch's own capacity, grid, notice and
# horizon, and the weekday hours the slots are cut from. `BranchWriteSerializer`
# rewrites the whole week on every save, so this fires as a burst - which is
# fine, `invalidate_availability` is a namespace delete either way.
@receiver(post_save, sender=Branch)
@receiver(post_delete, sender=Branch)
@receiver(post_save, sender=BranchHours)
@receiver(post_delete, sender=BranchHours)
def invalidate_availability_on_branch_change(sender, instance, **kwargs):
    invalidate_availability()
