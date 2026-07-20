"""The anonymous visitor's cart and favorites.

A guest has no rows: their cart lives in the browser's localStorage as a list of
bare **references** - kind, id, variant, ingredient selection, quantity - and is
sent here to be priced. Nothing about money is ever taken from the client. The
reference names *what* was chosen; every price, label, image and stock flag is
read back out of the catalog on this side, exactly as it is for a signed-in
cart. That is the whole reason the browser holds references rather than a
rendered cart: a client that could name a price could name its own.

The resolved lines are **unsaved** `CartItem` instances. `CartItemSerializer` is
a plain `Serializer` reading attributes, and `unit_price` / `line_total` /
`target` / `kind` are model properties that never touch the database - so the
same serializer renders a guest's cart and a user's, and the two can never drift
into showing different numbers for the same choice.

Used by three callers, which is why it lives here rather than in a view:
`GuestResolveView` (render the cart), `CheckoutView`'s guest branch (charge it),
and `GuestMergeView` (turn it into rows at login).
"""

from catalog.models import (
    MenuItem,
    Product,
    ProductVariant,
    Service,
    ServiceVariant,
    normalize_selection,
)

from .models import CartItem

# What one browser may put in a cart. Not a business rule - a bound on the work
# a single unauthenticated request can ask for, since these refs arrive with no
# account behind them.
MAX_GUEST_LINES = 50
MAX_QUANTITY = 99

_MODELS = {"product": Product, "service": Service, "menu_item": MenuItem}


def _dedupe_key(kind, target_id, variant_id, selection):
    """What makes two references the same line.

    The same triple a signed-in cart is deduped by: item, variant, and - for a
    menu line - the ingredient selection, which is part of that line's identity
    (two of the same dish customised differently are two lines). The selection is
    already normalised to a sorted list, so equal choices compare equal.
    """
    return (kind, target_id, variant_id, repr(selection))


def resolve_guest_cart(system, refs):
    """Price a list of guest cart references against `system`'s catalog.

    Returns unsaved `CartItem` instances in the order given, with `.id` set to
    the reference's index **in the list that was sent** - the guest cart's line
    handle, standing in for the row id a signed-in line is addressed by, so the
    cart page can key, re-quantify and remove lines the same way in both modes.

    The index must be the input's, not the output's: references that no longer
    resolve are dropped, so a position in the returned list would address the
    wrong entry in the browser's array the moment one item went away - and the
    customer would remove a line they did not click.

    References that no longer resolve are **dropped, not rejected**: a guest cart
    can sit in localStorage for weeks, and an item that has since been disabled
    or deleted must not make the whole cart un-renderable. The caller sees the
    difference as a shorter list than it sent. Every lookup is scoped to
    `system`, and a variant is looked up *through* its parent, so a crafted id
    cannot pull in another tenant's item or pair a variant with the wrong one.
    """
    if system is None:
        return []

    items = []
    seen = {}

    for index, ref in enumerate(refs[:MAX_GUEST_LINES]):
        kind = ref.get("kind")
        model = _MODELS.get(kind)
        if model is None:
            continue

        target = model.objects.filter(
            pk=ref.get("id"), system=system, enabled=True,
        ).first()
        if target is None:
            continue

        variant = None
        selection = []

        if kind == "menu_item":
            ingredients = list(
                target.ingredients.filter(enabled=True).prefetch_related("options")
            )
            selection = normalize_selection(ref.get("customization") or [], ingredients)
        elif ref.get("variant_id") is not None:
            variant_model = ProductVariant if kind == "product" else ServiceVariant
            variant = variant_model.objects.filter(
                pk=ref["variant_id"], enabled=True, **{kind: target},
            ).first()
            # A variant that no longer resolves drops the line rather than
            # silently falling back to the base item: the customer chose a size,
            # and quietly charging them for a different one is worse than
            # dropping it.
            if variant is None:
                continue

        quantity = min(max(int(ref.get("quantity") or 1), 1), MAX_QUANTITY)

        key = _dedupe_key(kind, target.pk, getattr(variant, "pk", None), selection)
        existing = seen.get(key)
        if existing is not None:
            # Two references to the same line are one line of the summed
            # quantity, matching what a repeated add does to a signed-in cart.
            existing.quantity = min(existing.quantity + quantity, MAX_QUANTITY)
            continue

        item = CartItem(
            system=system,
            quantity=quantity,
            customization=selection,
            **{
                kind: target,
                **({f"{kind}_variant": variant} if variant is not None else {}),
            },
        )
        # The guest line's handle: where this reference sits in the browser's
        # own array, which is the only thing the client can act on.
        item.id = index
        items.append(item)
        seen[key] = item

    return items


def resolve_guest_favorites(system, refs):
    """The catalog items behind a list of `{"kind", "id"}` favorite references.

    Returns `(kind, target)` pairs, scoped to `system` and skipping anything that
    no longer resolves - the same forgiving read as the cart, for the same
    reason: a heart saved months ago must not break the favorites page when the
    item behind it is gone.
    """
    if system is None:
        return []

    out = []
    seen = set()

    for ref in refs[:MAX_GUEST_LINES]:
        kind = ref.get("kind")
        model = _MODELS.get(kind)
        if model is None:
            continue

        key = (kind, ref.get("id"))
        if key in seen:
            continue

        target = model.objects.filter(
            pk=ref.get("id"), system=system, enabled=True,
        ).first()
        if target is None:
            continue

        seen.add(key)
        out.append((kind, target))

    return out


def cart_payload(items, context):
    """Lines, total quantity and a subtotal per currency - the cart page's shape.

    Deliberately the same payload `_cart_payload` builds for a signed-in cart,
    including the per-currency grouping (`Buyable.currency` is per item, so
    summing across currencies would be arithmetic on incomparable units). The
    frontend renders one `Cart` type either way.
    """
    from decimal import Decimal

    from .serializers import CartItemSerializer

    data = CartItemSerializer(items, many=True, context=context).data

    totals = {}
    for item in items:
        currency = item.target.currency
        totals[currency] = totals.get(currency, Decimal("0")) + item.line_total

    return {
        "items": data,
        "count": sum(item.quantity for item in items),
        "totals": [
            {"currency": currency, "subtotal": str(subtotal)}
            for currency, subtotal in sorted(totals.items())
        ],
    }
