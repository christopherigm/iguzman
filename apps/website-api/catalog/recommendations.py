"""The "don't forget these" strip a cart is offered under its own lines.

One entry point - ``cart_recommendations`` - shared by the signed-in cart
(``users.views._cart_payload``) and the anonymous one
(``users.guest.cart_payload``), so a guest and an account are offered the same
extras for the same basket. It is the counterpart of ``users/guest.py``'s rule
that nothing about a cart is ever taken from the client: what to recommend is
decided here, from the catalog, and arrives already filtered.

The four things it decides, in order, and why each one is here rather than in the
browser:

* **Union, then dedupe.** Three pizzas that all recommend the same soda offer it
  **once**. Only this side can see the whole basket at once.
* **Nothing already in the cart.** A recommendation the customer has taken is not
  a recommendation any more, and re-offering it beside its own cart line reads as
  a broken page. Matched on the item alone, ignoring size and customization - a
  cart holding *any* Coca has taken the "add a Coca" prompt.
* **Nothing unbuyable**, via ``offerable_recommendations``.
* **Nothing in a currency the basket cannot check out in.** ``Buyable.currency``
  is per item and checkout refuses a mixed-currency cart (``MIXED_CURRENCY``), so
  offering an item in another currency would be inviting the customer into a cart
  that cannot be paid for.
"""

import operator
from functools import reduce

from django.db.models import Q

from .models import (
    RECOMMENDATION_CATEGORY_FIELD,
    RECOMMENDATION_ITEM_FIELD,
    CatalogRecommendation,
    MenuCategory,
    MenuItem,
    Product,
    ProductCategory,
    Service,
    ServiceCategory,
    offerable_recommendations,
)

# How many cards the strip may hold. A bound on the payload rather than a
# business rule: a tenant that recommends six drinks on every one of five
# categories would otherwise turn the foot of the cart into a second catalog
# page, and the customer stops reading long before that.
MAX_CART_RECOMMENDATIONS = 8

_MODELS = {'product': Product, 'service': Service, 'menu_item': MenuItem}

# Every source a recommendation may hang off, keyed by the name the CMS uses in
# `?source=`. The three item kinds are the same strings the cart and favorites
# endpoints already speak, so a caller never has to learn a second vocabulary.
SOURCE_MODELS = {
    'product': Product,
    'service': Service,
    'menu_item': MenuItem,
    'product_category': ProductCategory,
    'service_category': ServiceCategory,
    'menu_category': MenuCategory,
}

# Which of those inherit from a category (and therefore answer with their *own*
# rows) versus define the list for others.
ITEM_SOURCES = frozenset(_MODELS)

# The rows every full buyable payload needs, kept in step with the list and
# detail querysets in `catalog/views.py` - a card serialized without these is a
# query per image, per ingredient and per size.
_PREFETCH = {
    'product': ('images', 'variants', 'variants__images'),
    'service': ('images', 'variants', 'variants__images'),
    'menu_item': (
        'images', 'ingredients__ingredient', 'ingredients__options__ingredient',
        'own_sizes', 'category__sizes', 'variants', 'variants__images',
    ),
}

# The rows a source's own list needs to resolve its targets. Three lookups
# because the target is one of three tables and `select_related` cannot span a
# reverse relation. Used by the CMS read endpoint (`RecommendationListView`);
# ⚠ deliberately **not** attached to the catalog list/detail querysets, because
# the item and category payloads carry no recommendations at all - see the note
# above `RecommendationRefSerializer` in `serializers.py`.
OWN_RECOMMENDATION_PREFETCH = (
    'own_recommendations__recommended_product',
    'own_recommendations__recommended_service',
    'own_recommendations__recommended_menu_item',
)

CATEGORY_RECOMMENDATION_PREFETCH = (
    'recommendations__recommended_product',
    'recommendations__recommended_service',
    'recommendations__recommended_menu_item',
)


def rows_for_sources(item_ids, category_ids):
    """Every enabled recommendation row hanging off the given sources, in **one**
    query.

    ``item_ids`` / ``category_ids`` are ``{kind: {id, ...}}``. Batched rather than
    read through each item's own relation because a cart of ten lines would
    otherwise be twenty lazy queries - and the cart page is the one page a
    customer is most impatient on.

    Ordered by ``(sort_order, id)`` so the caller can group in Python and keep the
    tenant's arrangement without re-sorting.
    """
    terms = []
    for kind, ids in item_ids.items():
        if ids:
            terms.append(Q(**{f'{RECOMMENDATION_ITEM_FIELD[kind]}__in': sorted(ids)}))
    for kind, ids in category_ids.items():
        if ids:
            terms.append(Q(**{f'{RECOMMENDATION_CATEGORY_FIELD[kind]}__in': sorted(ids)}))
    if not terms:
        return []
    return list(
        CatalogRecommendation.objects
        .filter(reduce(operator.or_, terms), enabled=True)
        .select_related(
            'recommended_product', 'recommended_service', 'recommended_menu_item',
        )
        .order_by('sort_order', 'id')
    )


def recommendations_for_cart(items):
    """``[(kind, buyable)]`` to offer this basket, deduped, filtered and capped.

    ``items`` are ``CartItem`` instances - saved rows for a signed-in customer,
    unsaved ones for a guest (see ``users/guest.py``); nothing here touches
    anything a guest line lacks, which is what lets both carts share it.
    """
    lines = [(item.kind, item.target) for item in items if item.target is not None]
    if not lines:
        return []

    item_ids = {kind: set() for kind in _MODELS}
    category_ids = {kind: set() for kind in _MODELS}
    for kind, target in lines:
        item_ids[kind].add(target.pk)
        if target.category_id:
            category_ids[kind].add(target.category_id)

    rows = rows_for_sources(item_ids, category_ids)

    by_item = {}
    by_category = {}
    for row in rows:
        for kind in _MODELS:
            source_id = getattr(row, f'{RECOMMENDATION_ITEM_FIELD[kind]}_id')
            if source_id:
                by_item.setdefault((kind, source_id), []).append(row)
            category_id = getattr(row, f'{RECOMMENDATION_CATEGORY_FIELD[kind]}_id')
            if category_id:
                by_category.setdefault((kind, category_id), []).append(row)

    # What the basket can be paid for in. A single-currency cart (every real one)
    # simply keeps its own currency.
    currencies = {target.currency for _, target in lines}
    # The item alone, deliberately: a customer holding a Coca in any size has
    # already taken the "add a Coca" prompt.
    in_cart = {(kind, target.pk) for kind, target in lines}

    picked = []
    seen = set()
    for kind, target in lines:
        # Own rows *replace* the category's - the same rule, resolved from the
        # same two lists, as `RecommendationSource.effective_recommendation_rows`.
        # Decided on the presence of rows, never on whether their targets are
        # offerable today.
        source_rows = (
            by_item.get((kind, target.pk))
            or by_category.get((kind, target.category_id))
            or []
        )
        for target_kind, recommended in offerable_recommendations(source_rows):
            key = (target_kind, recommended.pk)
            if key in seen or key in in_cart:
                continue
            if recommended.currency not in currencies:
                continue
            seen.add(key)
            picked.append(key)
            if len(picked) >= MAX_CART_RECOMMENDATIONS:
                return picked
    return picked


def cart_recommendations(items, context):
    """The strip as the cart payload carries it: ``[{"kind", "item"}]``.

    Shaped like a guest's resolved favorites (and like every cart line) so the
    storefront renders each entry with the ordinary catalog card rather than a
    cut-down "recommendation card" that would drift from it - the add button, the
    heart, the customiser and the price all have to behave exactly as they do in
    a grid, because adding one of these to the cart is the entire point.

    Returns ``[]`` for an empty cart, and quietly drops anything that has
    disappeared between the two queries.
    """
    picked = recommendations_for_cart(items)
    if not picked:
        return []

    # Re-read the chosen targets with the nesting a full card needs. Two steps
    # rather than one deep prefetch off the cart: the strip is capped, so this is
    # a bounded query per family, where prefetching every recommendation's images
    # and ingredients through the cart would pull the ones about to be discarded
    # as already-in-cart or out of stock.
    wanted = {}
    for kind, pk in picked:
        wanted.setdefault(kind, []).append(pk)

    resolved = {}
    for kind, pks in wanted.items():
        qs = (
            _MODELS[kind].objects
            .filter(pk__in=pks)
            .select_related('brand', 'category', 'system')
            .prefetch_related(*_PREFETCH[kind])
        )
        for obj in qs:
            resolved[(kind, obj.pk)] = obj

    # Imported here, not at module scope: `catalog.serializers` reaches back into
    # this app's models and `users` imports this module at app-load, so a
    # top-level import would make the graph a cycle - the same reason
    # `users.views._favorite_item_payload` defers its own import.
    from .serializers import MenuItemSerializer, ProductSerializer, ServiceSerializer

    serializers = {
        'product': ProductSerializer,
        'service': ServiceSerializer,
        'menu_item': MenuItemSerializer,
    }

    payload = []
    for key in picked:
        obj = resolved.get(key)
        if obj is None:
            continue
        kind = key[0]
        payload.append({
            'kind': kind,
            'item': serializers[kind](obj, context=context).data,
        })
    return payload
