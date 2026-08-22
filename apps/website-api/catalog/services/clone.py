"""Deep-clone a buyable (Product, Service, MenuItem) into a new record.

The CMS's "Clone" button exists so an operator can build a variant of an item
without re-typing it: the clone is a full, independent copy - its own row, its
own child rows, and its **own image files** - that can then be edited freely.

Two rules the whole module turns on:

  * **Image files are copied, never shared.** Two rows pointing at one file look
    fine until the operator deletes or replaces the image on one of them and it
    vanishes from the other. Every ``ImageField`` is duplicated in storage under
    a fresh name (``core.models.picture`` mints a uuid), so the copies are
    unrelated from the moment they exist.
  * **Unique fields are not copied.** ``sku`` is ``unique=True`` on all three
    models, so a clone must start with none - carrying it over would fail the
    insert (or, worse, make two rows fight over one identifier). ``slug`` is
    likewise regenerated from the clone's new name.
"""

import os

from django.core.files.storage import default_storage
from django.db import transaction

from core.models import picture


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def unique_slug(model, name: str, system_id) -> str:
    """A slug for `name`, namespaced to the system, that no row of `model` holds.

    The shape (``{site_prefix}-{name}``) and the transliteration both come from
    `core.services.reslug`, which is the single definition shared with the CMS's
    `buildSlug` and with "Recreate IDs". This module used to carry its own copy
    building ``{system_id}-{name}``, so a cloned dish and the same dish typed
    into the form came out with different slugs.

    Cloning is the one flow that reliably collides: "Pizza (copy)" cloned twice
    yields the same base slug, and `slug` is `unique=True`. Collisions get a
    numeric suffix rather than an error, because the operator asked for a copy,
    not for a lecture about slugs.
    """
    from core.models import System
    from core.services.reslug import build_slug

    prefix = (
        System.objects.filter(pk=system_id)
        .values_list("site_prefix", flat=True)
        .first()
    )
    # A system that has somehow lost its prefix falls back to its id, which is
    # what this module used to build every slug from - unique, if unlovely.
    # Refusing the clone over it would be a worse answer than an ugly URL.
    base = build_slug(name, prefix or str(system_id))
    candidate = base
    suffix = 2
    while model.objects.filter(slug=candidate).exists():
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def copy_image(source_field):
    """Duplicate a FieldFile in storage and return the new name, or ''.

    Copies the stored bytes directly instead of re-saving through the field, so
    a `ResizedImageField` doesn't re-encode (and re-degrade) an image that was
    already processed when it was first uploaded.
    """
    if not source_field:
        return ''
    old_name = source_field.name
    if not old_name or not default_storage.exists(old_name):
        return ''
    # `picture()` only reads the instance's class name for the folder, and the
    # copy lives beside the original, so the source's own instance is the right
    # thing to hand it.
    new_name = picture(source_field.instance, os.path.basename(old_name))
    with default_storage.open(old_name, 'rb') as handle:
        return default_storage.save(new_name, handle)


def _copy_fields(source, exclude):
    """Concrete, non-inherited field values of `source`, minus `exclude`.

    Uses `attname` so foreign keys come back as `<field>_id` and no related
    object has to be fetched. M2M fields are absent by construction (they aren't
    in `_meta.concrete_fields`) and are handled explicitly per model.
    """
    data = {}
    for field in source._meta.concrete_fields:
        if field.primary_key or field.name in exclude or field.attname in exclude:
            continue
        data[field.attname] = getattr(source, field.attname)
    return data


# Never carried onto a clone:
#   pk/created/modified - the clone is a new row with its own timestamps
#   slug                - regenerated from the clone's name
#   sku                 - unique=True; the clone starts without an identifier
#   image               - copied as a file, not as a shared reference
_BASE_EXCLUDE = {'id', 'created', 'modified', 'slug', 'sku', 'image'}


def _clone_row(source, model, overrides=None, exclude=()):
    """Create a copy of `source` with `overrides` applied.

    Relations in `overrides` must be given by **attname** (`product_id=…`), not
    by field name. `_copy_fields` emits attnames, and when `Model.__init__` is
    handed both `product=<obj>` and `product_id=<old id>` the raw id is applied
    last - silently attaching the copy to the row it was copied from.
    """
    data = _copy_fields(source, _BASE_EXCLUDE | set(exclude))
    # `image` is excluded above so the clone gets a copied file rather than the
    # original's name; models without one (a MenuItemIngredient row) simply
    # don't get the key back.
    if any(f.name == 'image' for f in model._meta.concrete_fields):
        data['image'] = copy_image(getattr(source, 'image', None))
    data.update(overrides or {})
    return model.objects.create(**data)


def _clone_gallery(images, model, parent_attname, parent):
    """Copy a set of gallery image rows onto `parent`."""
    for image in images:
        _clone_row(image, model, overrides={parent_attname: parent.pk})


# ---------------------------------------------------------------------------
# Public API - one function per buyable family
# ---------------------------------------------------------------------------

@transaction.atomic
def clone_product(product, name, en_name):
    """Copy a Product and its gallery.

    The `variants` M2M (sibling products) is copied as-is, so the clone joins the
    same family the original belongs to. The relation is symmetrical, so the
    clone is *not* linked to the original itself - a copy is not automatically an
    alternative version of what it was copied from; the operator links it if it is.
    """
    from catalog.models import Product, ProductImage

    clone = _clone_row(
        product,
        Product,
        overrides={
            'name': name,
            'en_name': en_name,
            'slug': unique_slug(Product, name, product.system_id),
            'sku': None,
        },
    )

    _clone_gallery(product.images.all(), ProductImage, 'product_id', clone)

    clone.variants.set(product.variants.all())

    return clone


@transaction.atomic
def clone_service(service, name, en_name):
    """Copy a Service and its gallery.

    The `variants` M2M (sibling services) is copied as-is - see `clone_product`
    for why the clone is not linked to the original.
    """
    from catalog.models import Service, ServiceImage

    clone = _clone_row(
        service,
        Service,
        overrides={
            'name': name,
            'en_name': en_name,
            'slug': unique_slug(Service, name, service.system_id),
            'sku': None,
        },
    )

    _clone_gallery(service.images.all(), ServiceImage, 'service_id', clone)

    clone.variants.set(service.variants.all())

    return clone


@transaction.atomic
def clone_menu_item(menu_item, name, en_name):
    """Copy a MenuItem, its gallery, its priced ingredients (with their choice
    options), its size overrides and its internal recipe steps.

    Ingredients themselves are *not* copied: `Ingredient` is a System-scoped,
    deliberately shared catalog record, so the clone's rows point at the same
    ingredients the original used - which is also what keeps the shared cost and
    nutrition data in one place.

    The `variants` M2M (sibling dishes) is copied as-is, so the clone joins the
    same family the original belongs to. The relation is symmetrical, so the
    clone is *not* linked to the original itself - a copy is not automatically an
    alternative version of what it was copied from; the operator links it if it is.
    """
    from catalog.models import (
        MenuItem, MenuItemImage, MenuItemIngredient,
        MenuItemIngredientOption, MenuSize, RecipeStep,
    )

    clone = _clone_row(
        menu_item,
        MenuItem,
        overrides={
            'name': name,
            'en_name': en_name,
            'slug': unique_slug(MenuItem, name, menu_item.system_id),
            'sku': None,
        },
    )

    _clone_gallery(menu_item.images.all(), MenuItemImage, 'menu_item_id', clone)

    for row in menu_item.ingredients.all():
        row_clone = _clone_row(
            row, MenuItemIngredient, overrides={'menu_item_id': clone.pk}
        )
        for option in row.options.all():
            _clone_row(
                option,
                MenuItemIngredientOption,
                overrides={'menu_item_ingredient_id': row_clone.pk},
            )

    # The dish's *own* size rows, i.e. its override of the category list. A dish
    # that inherits has none, and the clone inherits the same way - copying the
    # resolved list would silently turn an inheriting dish into an overriding
    # one, and it would then stop following the category it was filed under.
    for size in menu_item.own_sizes.all():
        _clone_row(size, MenuSize, overrides={'menu_item_id': clone.pk, 'category_id': None})

    for step in menu_item.recipe_steps.all():
        _clone_row(step, RecipeStep, overrides={'menu_item_id': clone.pk})

    clone.variants.set(menu_item.variants.all())

    return clone
