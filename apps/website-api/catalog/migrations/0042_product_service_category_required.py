"""Make ``Product.category`` and ``Service.category`` required.

The catalog's three families now share one URL shape,
``/<family>/<category>/<item>`` - the same one the menu already had. That makes
the category slug the *first segment of every item's address*, so an item
without a category has no page to be reached at. The column therefore can no
longer be null, exactly as ``MenuItem.category`` stopped being null in 0037.

This mirrors that migration step for step, and for the same reasons:

1. **Backfill.** Every product/service with no category is moved into a
   per-System catch-all ("Otros"), so nothing is deleted and no tenant loses a
   row. An operator re-files them in the CMS afterwards, where they can see what
   they are doing.
2. **AlterField.** Postgres refuses ``SET NOT NULL`` on a column that still
   holds nulls, so this only works after step 1.

The reverse path restores nullable columns; the catch-all categories are left
in place - see ``_noop``.
"""

from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


# Named in Spanish for the same reason 0037's is: every tenant this runs against
# is a Spanish-language site, and the name is customer-facing the moment it
# appears in a breadcrumb or the catalog listing.
FALLBACK_NAME = "Otros"
FALLBACK_EN_NAME = "Other"


def _backfill(apps, category_model, item_model, related_name):
    """File every uncategorized row of one family under a per-System catch-all."""
    Category = apps.get_model("catalog", category_model)
    Item = apps.get_model("catalog", item_model)

    # `system` is itself nullable on the item, so group by it rather than
    # assuming one: a row with no System gets a category with no System too,
    # which keeps the FK satisfiable without inventing a tenant for it.
    system_ids = (
        Item.objects.filter(category__isnull=True)
        .values_list("system_id", flat=True)
        .distinct()
    )

    for system_id in system_ids:
        # `slug` is globally unique across every tenant, so it carries the
        # System id - two sites both needing an "Otros" would otherwise collide.
        # The family is in there too: a tenant selling both products and
        # services needs one catch-all per family, and they are separate tables
        # sharing one slug namespace only by convention.
        slug = slugify(f"{FALLBACK_NAME}-{related_name}-{system_id or 'orphan'}")
        category = Category.objects.filter(slug=slug).first()
        if category is None:
            category = Category.objects.create(
                system_id=system_id,
                name=FALLBACK_NAME,
                en_name=FALLBACK_EN_NAME,
                slug=slug,
                # Last in every listing: it is where the unsorted items live,
                # not a section the tenant authored.
                sort_order=9999,
            )
        Item.objects.filter(category__isnull=True, system_id=system_id).update(
            category=category
        )


def _file_uncategorized(apps, schema_editor):
    _backfill(apps, "ProductCategory", "Product", "products")
    _backfill(apps, "ServiceCategory", "Service", "services")


def _noop(apps, schema_editor):
    """Reverse of the backfill: nothing to undo.

    The "Otros" categories are left in place on purpose - by the time anyone
    reverses this, items may have been filed into them by hand, and deleting a
    category cascades to its items.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0041_menucategory_points_award_menuitem_points_award_and_more"),
    ]

    operations = [
        migrations.RunPython(_file_uncategorized, _noop),
        migrations.AlterField(
            model_name="product",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="products",
                to="catalog.productcategory",
            ),
        ),
        migrations.AlterField(
            model_name="service",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="services",
                to="catalog.servicecategory",
            ),
        ),
    ]
