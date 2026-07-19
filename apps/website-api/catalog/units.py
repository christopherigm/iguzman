"""Same-dimension unit conversion for ingredient nutrition scaling.

Nutrition on an ``Ingredient`` is stated per a fixed reference amount in the
ingredient's own ``unit`` (e.g. per 100 g, per 1 pc). A recipe portion on a
``MenuItemIngredient`` may be expressed in a *different* unit of the same
physical dimension (e.g. the ingredient is measured in grams but the recipe
calls for a quantity in kilograms). ``convert_quantity`` maps a portion into the
ingredient's basis unit so the nutrient values can be scaled.

Only conversions *within a single dimension* are supported (mass<->mass,
volume<->volume). Count-style units (pieces, slices, scoops) are treated as
distinct dimensions with no cross-conversion: a portion counted in slices cannot
be re-expressed in pieces without physical knowledge we do not model here.
Cross-dimension conversions (e.g. tablespoons -> grams) require a per-ingredient
density and are intentionally out of scope for now; the caller treats a ``None``
result as "cannot compute" and omits the nutrient.
"""

from decimal import Decimal


# Each dimension maps a unit to its factor in that dimension's canonical base
# unit (grams for mass, millilitres for volume). Count units each live in their
# own single-member dimension so only an exact-unit match converts.
_MASS = {
    'g': Decimal('1'),
    'kg': Decimal('1000'),
    'mg': Decimal('0.001'),
    'oz': Decimal('28.349523125'),
    'lb': Decimal('453.59237'),
}

_VOLUME = {
    'ml': Decimal('1'),
    'l': Decimal('1000'),
    'cup': Decimal('236.5882365'),
    'tbsp': Decimal('14.78676478'),
    'tsp': Decimal('4.92892159'),
}

# Count units: no cross-conversion, but listed so an exact match returns 1.
_COUNT = {
    'pc': Decimal('1'),
    'slice': Decimal('1'),
    'scoop': Decimal('1'),
}

_DIMENSIONS = (_MASS, _VOLUME)


def _mass_or_volume_factor(unit):
    """Return the (dimension, base-factor) for a mass/volume unit, or (None, None)."""
    for dimension in _DIMENSIONS:
        if unit in dimension:
            return dimension, dimension[unit]
    return None, None


def convert_quantity(quantity, from_unit, to_unit):
    """Express ``quantity`` of ``from_unit`` in ``to_unit``.

    Returns a ``Decimal`` when the two units share a physical dimension
    (mass<->mass or volume<->volume), or an exact count-unit match. Returns
    ``None`` when the units are not inter-convertible (different dimensions, or
    two different count units), or when any argument is missing.
    """
    if quantity is None or not from_unit or not to_unit:
        return None

    qty = Decimal(str(quantity))

    if from_unit == to_unit:
        return qty

    # Count units only convert to themselves (handled above); a mismatch here is
    # non-convertible.
    if from_unit in _COUNT or to_unit in _COUNT:
        return None

    from_dim, from_factor = _mass_or_volume_factor(from_unit)
    to_dim, to_factor = _mass_or_volume_factor(to_unit)
    if from_dim is None or to_dim is None or from_dim is not to_dim:
        return None

    # quantity -> base unit -> target unit
    return qty * from_factor / to_factor
