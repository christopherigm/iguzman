"""Cross-model cache invalidation for category renames/deletes.

Product/Service/MenuItem serializers embed ``category_name`` and
``category_slug`` (source ``category.*``), cached under the item's ``catalog:*``
namespaces. ``category`` is SET_NULL, so deleting a category nulls it on every
item that used it, and renaming/re-slugging a category changes the embedded
value - either way the cached item payloads go stale. The category admins only
invalidate their own ``catalog:*_categories:*`` list namespace, so each category
kind clears its buyable family's caches here instead. A signal covers admin
single + bulk delete, the API view, and any cascade uniformly.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache import invalidate_pattern

from .models import MenuCategory, ProductCategory, ServiceCategory


def _invalidate_family(family):
    invalidate_pattern(f"catalog:{family}s:*")  # list endpoints (plural prefix)
    invalidate_pattern(f"catalog:{family}:*")   # detail endpoints (per-pk)


@receiver(post_save, sender=ProductCategory)
@receiver(post_delete, sender=ProductCategory)
def invalidate_products_on_category_change(sender, instance, **kwargs):
    _invalidate_family("product")


@receiver(post_save, sender=ServiceCategory)
@receiver(post_delete, sender=ServiceCategory)
def invalidate_services_on_category_change(sender, instance, **kwargs):
    _invalidate_family("service")


@receiver(post_save, sender=MenuCategory)
@receiver(post_delete, sender=MenuCategory)
def invalidate_menu_items_on_category_change(sender, instance, **kwargs):
    _invalidate_family("menu_item")
