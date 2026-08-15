"""Cross-model cache invalidation between a buyable family and its categories.

Two directions, both stale-making, both handled here so a single signal covers
admin single + bulk delete, the API views, and any cascade uniformly:

1. **Category -> items.** Product/Service/MenuItem serializers embed
   ``category_name`` and ``category_slug`` (source ``category.*``), cached under
   the item's ``catalog:*`` namespaces. ``category`` is SET_NULL, so deleting a
   category nulls it on every item that used it, and renaming/re-slugging a
   category changes the embedded value - either way the cached item payloads go
   stale.

2. **Items -> category.** Each category serializer exposes ``item_count``
   (``obj.<family>s.filter(enabled=True).count()``), baked into the cached
   category list + detail payloads. Adding, deleting, enabling/disabling, or
   re-categorising an item changes that count, so the category caches go stale.
   ``post_save`` fires on create *and* update (covering an ``enabled`` toggle or
   a ``category`` reassignment); ``post_delete`` covers removals.

3. **Items -> the System payload.** ``SystemSerializer`` embeds
   ``product_count``, ``service_count`` and ``menu_item_count``, and that
   payload is cached for a whole hour. The storefront navbar builds its links
   from those numbers, so an item write - creating the tenant's first menu item,
   or disabling the last one - has to clear it too, or the Menu entry stays
   missing (or stays after the menu is gone) until the TTL lapses.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.cache import invalidate_pattern, invalidate_system_payload

from .models import (
    MenuCategory, MenuItem, Product, ProductCategory, Service, ServiceCategory,
)


def _invalidate_family(family):
    invalidate_pattern(f"catalog:{family}s:*")  # list endpoints (plural prefix)
    invalidate_pattern(f"catalog:{family}:*")   # detail endpoints (per-pk)


def _invalidate_categories(family):
    invalidate_pattern(f"catalog:{family}_categories:*")  # list (item_count)
    invalidate_pattern(f"catalog:{family}_category:*")    # detail (item_count)


# ── Category -> item caches ──────────────────────────────────────────────────

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


# ── Item -> category caches (item_count) ─────────────────────────────────────

@receiver(post_save, sender=Product)
@receiver(post_delete, sender=Product)
def invalidate_product_categories_on_item_change(sender, instance, **kwargs):
    _invalidate_categories("product")
    invalidate_system_payload()


@receiver(post_save, sender=Service)
@receiver(post_delete, sender=Service)
def invalidate_service_categories_on_item_change(sender, instance, **kwargs):
    _invalidate_categories("service")
    invalidate_system_payload()


@receiver(post_save, sender=MenuItem)
@receiver(post_delete, sender=MenuItem)
def invalidate_menu_categories_on_item_change(sender, instance, **kwargs):
    _invalidate_categories("menu")
    invalidate_system_payload()
