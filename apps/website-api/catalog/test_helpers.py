"""Shared fixtures for tests that need a catalog row but not a catalog.

``Product.category`` and ``Service.category`` are required - the category slug
is the first segment of every item's URL (``/<family>/<category>/<slug>``), so
an uncategorized item would have no page to be reached at. That makes a
category mandatory in roughly fifty test set-ups that are about carts, orders,
favourites or backups and do not care how the catalog is sectioned.

These give those tests one throwaway category per (family, System) rather than
a hand-rolled one per test. Anything actually *testing* sectioning should build
its own categories explicitly instead - reaching for these there would hide the
thing under test.
"""

from .models import ProductCategory, ServiceCategory


def _get_or_create(model, prefix, system):
    # `slug` is globally unique across every tenant, so it carries the System id
    # - two systems both wanting a throwaway category would otherwise collide.
    system_id = system.pk if system is not None else None
    return model.objects.get_or_create(
        slug=f"{prefix}-{system_id or 'none'}",
        defaults={"system": system, "name": "Test"},
    )[0]


def a_product_category(system=None):
    """A throwaway `ProductCategory` on `system`, reused across one test."""
    return _get_or_create(ProductCategory, "t-product-cat", system)


def a_service_category(system=None):
    """A throwaway `ServiceCategory` on `system`, reused across one test."""
    return _get_or_create(ServiceCategory, "t-service-cat", system)
