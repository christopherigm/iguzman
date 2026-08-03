"""Cross-model cache invalidation for core models that catalog payloads embed.

A Product/Service/MenuItem serializer embeds ``brand_name`` (source
``brand.name``), and those payloads are cached under ``catalog:*`` namespaces.
``Buyable.brand`` is SET_NULL, so deleting a Brand nulls it on every item that
used it, and renaming a Brand changes the embedded name - either way the cached
catalog payloads keep serving the old brand until their TTL. Brand's own
admin/view only invalidate ``core:brand*``, so the catalog namespaces are cleared
here instead. A signal (rather than a line in each delete path) covers every
route uniformly: admin single + bulk delete, the API view, and any cascade.
"""

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate_pattern, invalidate_system_payload
from .models import Branch, BranchHours, Brand, SiteBackup, System
from .storage import forget_system


def _invalidate_catalog_for_brand():
    # Brand lives on the Buyable base, so all three families can embed it.
    for family in ("products", "services", "menu_items"):
        invalidate_pattern(f"catalog:{family}:*")  # list endpoints
    for family in ("product", "service", "menu_item"):
        invalidate_pattern(f"catalog:{family}:*")  # detail endpoints (per-pk)


@receiver(post_save, sender=Brand)
@receiver(post_delete, sender=Brand)
def invalidate_catalog_on_brand_change(sender, instance, **kwargs):
    _invalidate_catalog_for_brand()


@receiver(post_save, sender=Branch)
@receiver(post_delete, sender=Branch)
def invalidate_system_on_branch_change(sender, instance, **kwargs):
    """``branch_count`` rides along in the cached System payload, and it is what
    decides whether the public Contact link is rendered at all. Same reasoning as
    the catalog counts in ``catalog/signals.py`` - the count changes while the
    System row itself does not, so nothing else would clear it."""
    invalidate_system_payload()


@receiver(post_save, sender=BranchHours)
@receiver(post_delete, sender=BranchHours)
def invalidate_branch_on_hours_change(sender, instance, **kwargs):
    """A branch's hours are nested in its cached payload, and it is what the
    public booking calendar reads its opening days from.

    Needed as a signal rather than a line in the write path because there are
    three of them: the CMS (`BranchWriteSerializer`, which replaces the whole
    week), the Django admin's inline (saved through `save_formset`, which
    `BranchAdmin.save_model` never sees), and any cascade. A tenant that closes
    Saturdays and still sees Saturdays offered for the next five minutes reads
    that as the setting not working."""
    cache.delete(f"core:branch:{instance.branch_id}")
    invalidate_pattern("core:branches:*")


@receiver(post_save, sender=System)
def forget_storage_config(sender, instance, **kwargs):
    """Drop this worker's memoised R2 config so the next upload re-reads it.

    ``core.storage`` memoises a tenant's storage settings per process to keep
    ``url()`` - called once per image per page render - off the database. The
    memo expires on its own within ``CONFIG_TTL_SECONDS``; this only shortens the
    wait to zero on the worker that handled the save, which is the one whose
    operator is about to press "Test connection" and expect their edit to count.
    The other workers catch up on the TTL.
    """
    forget_system(instance.pk)


@receiver(post_delete, sender=SiteBackup)
def delete_backup_file(sender, instance, **kwargs):
    """Remove the archive from disk when its history row goes.

    Django stopped deleting FileField files on row delete in 1.3, so without this
    every deleted restore point would leave its zip - by far the largest file this
    app writes - orphaned on the media volume forever. A signal rather than a line
    in the delete view so the Django admin and any cascade (deleting a System
    takes its backups with it) are covered by the same code.
    """
    if instance.file:
        instance.file.delete(save=False)
