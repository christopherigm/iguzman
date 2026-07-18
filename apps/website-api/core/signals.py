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

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate_pattern
from .models import Brand


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
