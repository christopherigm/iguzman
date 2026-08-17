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

3. **Sizes -> the menu.** A ``MenuSize`` is nested on its category's payload
   *and*, through ``MenuItem.effective_sizes`` ("own rows else the category's"),
   on the payload of every dish that inherits it. A category-level size write
   therefore invalidates the whole menu-item namespace: which dishes inherit is
   not something this receiver can enumerate cheaply, and a dish showing a size
   the tenant just retired is a price the customer can still select.

4. **Recommendations -> the source, and every cart.** A
   ``CatalogRecommendation`` is nested on its source's payload (``own_recommendations``
   on an item, ``recommendations`` on a category) *and*, resolved through
   ``RecommendationSource.effective_recommendations``, on the **cart** payload of
   anyone holding a matching line. See ``invalidate_on_recommendation_change``.

5. **Items -> the System payload.** ``SystemSerializer`` embeds
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
    CatalogRecommendation, MenuCategory, MenuItem, MenuSize, Product,
    ProductCategory, Service, ServiceCategory,
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


# ── Sizes -> the category and every dish that inherits them ──────────────────

@receiver(post_save, sender=MenuSize)
@receiver(post_delete, sender=MenuSize)
def invalidate_menu_on_size_change(sender, instance, **kwargs):
    if instance.category_id:
        invalidate_pattern(f"catalog:menu_category_sizes:{instance.category_id}:*")
        _invalidate_categories("menu")
    if instance.menu_item_id:
        invalidate_pattern(f"catalog:menu_item_sizes:{instance.menu_item_id}:*")
    # Both owners land here: an item-level override changes that dish's payload,
    # and a category-level row changes every dish that has none of its own.
    _invalidate_family("menu_item")


# ── Recommendations -> the source's payload, and every cached cart ────────────

@receiver(post_save, sender=CatalogRecommendation)
@receiver(post_delete, sender=CatalogRecommendation)
def invalidate_on_recommendation_change(sender, instance, **kwargs):
    """Clear the source's own namespace and **every** cached cart.

    Two directions, and the second is the one that would be missed:

    1. The row is nested on its source's payload (``own_recommendations`` on an
       item, ``recommendations`` on a category). The whole family is cleared, not
       just the one pk, because a *category*-level row changes the effective list
       of every item that has none of its own - which is not something this
       receiver can enumerate cheaply. Same reasoning, and same bluntness, as
       ``invalidate_menu_on_size_change``.
    2. ``users:cart:*`` - the cart payload carries the resolved "don't forget
       these" strip (``catalog/recommendations.py``), so a tenant adding a drink
       to its Pizzas category has to reach the cart of everyone currently holding
       a pizza. That is every cached cart, since which of them hold a matching
       line is exactly what this receiver cannot know.

    ⚠ Only *recommendation* writes are covered. A recommended item going out of
    stock leaves it on a cached cart strip for up to ``CART_CACHE_TTL``, the same
    staleness a cached cart already carries for a price change - clearing every
    cart on every catalog save would cost far more than the dead card it saves.
    """
    for family in ('product', 'service', 'menu_item'):
        if getattr(instance, f'{family}_id'):
            _invalidate_family(family)
    if instance.product_category_id:
        _invalidate_family("product")
        _invalidate_categories("product")
    if instance.service_category_id:
        _invalidate_family("service")
        _invalidate_categories("service")
    if instance.menu_category_id:
        _invalidate_family("menu_item")
        _invalidate_categories("menu")
    invalidate_pattern("users:cart:*")
