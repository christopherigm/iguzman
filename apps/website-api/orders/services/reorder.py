"""Turning a past order back into cart references.

One rule, in one place, because two callers ask it in two shapes: the
`OrderReorderView` that writes the lines into a cart, and `OrderLineSerializer`,
which reports per line whether it can be re-ordered at all - the order page gates
its "Order again" button on that. Derived separately they would drift, and the
symptom would be a button that offers something the endpoint then refuses.
"""


def reorder_ref(line):
    """This order line as a cart **reference** - ``{kind, id, quantity, ...}`` -
    or None when it can no longer be bought.

    The mirror image of `_line_still_sellable`, and deliberately the strict one
    where that is forgiving: settling an order the customer already agreed to
    must survive the tenant tidying the catalog, but *starting a new one* cannot
    put an item in a cart that no longer exists. So a deleted item, a disabled
    one, an out-of-stock product and an unavailable dish are all simply left out.

    A bookable service is left out too, for the reason the order page swaps that
    line's button for "Book again": an appointment needs an hour and a place a
    cart line has nowhere to hold.

    Nothing here decides a price. The reference names *which* item, its size and
    its ingredients, exactly as the cart's own write path and a guest's
    localStorage do; both re-price it from the catalog, and both re-check the
    size and the selection against what the dish still offers.
    """
    target = line.product or line.service or line.menu_item
    if target is None or not target.enabled:
        return None
    if line.kind == "product" and not target.in_stock:
        return None
    if line.kind == "service" and target.booking_enabled:
        return None
    if line.kind == "menu_item" and not target.is_available:
        return None

    ref = {"kind": line.kind, "id": target.pk, "quantity": line.quantity}
    if line.kind != "menu_item":
        return ref

    # `menu_size` is SET_NULL provenance, so a size the tenant has retired comes
    # back as None - and an **absent** `size` is what both write paths read as
    # "the dish's default", the same answer a customer opening the dish today
    # would get. Omitted rather than sent as null so a ref is byte-for-byte the
    # shape a guest's localStorage already stores.
    if line.menu_size_id:
        ref["size"] = line.menu_size_id
    # ⚠ Every row written before the ids existed carries names only, and a name
    # cannot be turned back into the row it was copied from - so such a dish is
    # re-ordered **as it is listed** rather than guessed at from a string the
    # tenant may since have reused. `normalize_selection` on the write path drops
    # anything that no longer belongs to the dish, so a since-deleted ingredient
    # falls out here too.
    ref["customization"] = [
        {
            "ingredient": row["ingredient"],
            "quantity": int(row.get("quantity", 0)),
            **({"option": row["option"]} if row.get("option") else {}),
        }
        for row in (line.customization or [])
        if isinstance(row, dict) and row.get("ingredient")
    ]
    return ref
