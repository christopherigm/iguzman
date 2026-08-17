"""What is holding an Ingredient down, and the two ways to let it go.

``MenuItemIngredient.ingredient`` and ``MenuItemIngredientOption.ingredient`` are
both PROTECT, so a shared ingredient still referenced by a dish cannot be
deleted. That refusal is correct - silently pulling an ingredient out from under
a dish would change what is being sold - but on its own it is a dead end: the
CMS's ingredient list could only report "still in use" and leave the admin to go
and find every dish by hand.

This module is what turns that into a choice. ``ingredient_usages`` names every
blocking reference (which dish, which choice group, and what *role* the
ingredient plays in it), and the two resolvers below are the two answers an admin
can give:

* ``detach_ingredient`` - keep the dishes as close to what they were as
  possible. A plain row goes, an alternative option goes, and a **group's
  default** is replaced by promoting the group's first remaining alternative into
  the default slot (a group cannot exist without a default, and the alternatives
  are by definition interchangeable with it). A group whose only ingredient is
  this one has nothing to promote, so it goes too.
* ``delete_ingredient_groups`` - the blunt answer: every ``MenuItemIngredient``
  row that touches this ingredient is deleted, taking the whole choice group with
  it.

⚠ Both resolvers are the *whole* answer for an ingredient - they run over every
usage, because the ingredient itself is System-wide and a partial detach would
still leave the delete refused.
"""

from django.db import transaction

from ..models import MenuItemIngredient, MenuItemIngredientOption

# The role an ingredient plays in the row that references it. `plain` is an
# ordinary single-ingredient row; the other two are the two halves of a
# single-select choice group (its default, and one of its alternatives).
ROLE_PLAIN = 'plain'
ROLE_GROUP_DEFAULT = 'group_default'
ROLE_GROUP_OPTION = 'group_option'


def _row_usage(row, role, ingredient_id):
    """Describe one blocking reference for the API's 409 payload."""
    options = list(row.options.all())
    return {
        'menu_item_ingredient': row.id,
        'menu_item': row.menu_item_id,
        'menu_item_name': row.menu_item.name if row.menu_item_id else None,
        'role': role,
        'group_name': row.group_name or None,
        'group_en_name': row.group_en_name or None,
        'option_count': len(options),
        # Whether "delete only the ingredient" can keep this group alive: a
        # default with no other alternative to promote takes the group with it.
        'can_promote': role == ROLE_GROUP_DEFAULT
        and any(o.ingredient_id != ingredient_id for o in options),
    }


def ingredient_usages(ingredient):
    """Every ``MenuItemIngredient`` reference blocking this ingredient's delete.

    Returns a list of plain dicts (see ``_row_usage``), one per referencing row -
    an ingredient that is a group's default on one dish and an alternative on
    another appears twice, once in each role.
    """
    usages = []

    own = (
        MenuItemIngredient.objects
        .filter(ingredient=ingredient)
        .select_related('menu_item')
        .prefetch_related('options')
    )
    for row in own:
        role = ROLE_GROUP_DEFAULT if row.options.all() else ROLE_PLAIN
        usages.append(_row_usage(row, role, ingredient.id))

    as_option = (
        MenuItemIngredientOption.objects
        .filter(ingredient=ingredient)
        .select_related('menu_item_ingredient__menu_item')
        .prefetch_related('menu_item_ingredient__options')
    )
    for option in as_option:
        usages.append(
            _row_usage(option.menu_item_ingredient, ROLE_GROUP_OPTION, ingredient.id)
        )

    return usages


def affected_menu_item_ids(ingredient):
    """The menu items whose cached payloads a resolver will invalidate."""
    ids = set(
        MenuItemIngredient.objects
        .filter(ingredient=ingredient)
        .values_list('menu_item_id', flat=True)
    )
    ids.update(
        MenuItemIngredientOption.objects
        .filter(ingredient=ingredient)
        .values_list('menu_item_ingredient__menu_item_id', flat=True)
    )
    return ids


@transaction.atomic
def detach_ingredient(ingredient):
    """Remove ``ingredient`` from every dish that references it, keeping the
    dishes otherwise intact.

    Plain rows and alternative options are deleted outright. A group whose
    *default* this is has its first remaining alternative promoted into the
    default slot (carrying that option's own price, since price travels with the
    ingredient that is being charged for); a group with no alternative left to
    promote is deleted, because a choice group cannot exist without a default.
    """
    # Alternatives first: promoting one below must not then re-delete it.
    MenuItemIngredientOption.objects.filter(ingredient=ingredient).delete()

    rows = (
        MenuItemIngredient.objects
        .filter(ingredient=ingredient)
        .prefetch_related('options')
    )
    for row in rows:
        promoted = next(iter(row.options.all()), None)
        if promoted is None:
            row.delete()
            continue
        row.ingredient = promoted.ingredient
        row.price = promoted.price
        row.save(update_fields=['ingredient', 'price'])
        promoted.delete()


@transaction.atomic
def delete_ingredient_groups(ingredient):
    """Delete every ``MenuItemIngredient`` row referencing ``ingredient`` - as its
    default or as one of its alternatives - taking the whole choice group with it.

    The options go with the row (``MenuItemIngredientOption.menu_item_ingredient``
    is CASCADE), so the alternatives are deleted too; the *ingredients* those
    alternatives pointed at are untouched, since they are shared catalog records
    of their own.
    """
    row_ids = set(
        MenuItemIngredient.objects
        .filter(ingredient=ingredient)
        .values_list('id', flat=True)
    )
    row_ids.update(
        MenuItemIngredientOption.objects
        .filter(ingredient=ingredient)
        .values_list('menu_item_ingredient_id', flat=True)
    )
    MenuItemIngredient.objects.filter(id__in=row_ids).delete()
