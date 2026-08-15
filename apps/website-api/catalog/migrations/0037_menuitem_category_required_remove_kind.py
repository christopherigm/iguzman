"""Make ``MenuItem.category`` required and drop ``MenuItem.kind``.

The menu used to be sectioned twice: by the tenant's own ``MenuCategory`` rows
*and* by a structural ``kind`` enum (food/drink/dessert/side/appetizer) that
drove the navbar dropdown, the per-kind listing pages and every item URL. Two
sectionings of one menu can only ever disagree, so the category is now the only
one - which means it can no longer be null.

Order matters, and the three steps cannot be collapsed:

1. **Backfill.** Every item with no category is moved into a per-System
   catch-all category ("Otros"). Deliberately *not* derived from the item's
   ``kind`` - that was the explicit call when this landed; an operator re-files
   them in the CMS afterwards, where they can see what they are doing.
2. **AlterField.** Postgres refuses ``SET NOT NULL`` on a column that still has
   nulls, so this only works after step 1.
3. **RemoveField.** Last, so the backfill above could still have read ``kind``
   had we wanted it to.

The reverse path restores a nullable column with a ``food`` default; the
original per-item kinds are gone and cannot be recovered from here.
"""

from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


# Named in Spanish because every tenant this runs against is a Spanish-language
# site, and the name is customer-facing the moment it appears in the navbar.
FALLBACK_NAME = "Otros"
FALLBACK_EN_NAME = "Other"


def _file_uncategorized_items(apps, schema_editor):
    MenuCategory = apps.get_model("catalog", "MenuCategory")
    MenuItem = apps.get_model("catalog", "MenuItem")

    # `system` is itself nullable on MenuItem, so group by it rather than
    # assuming one: a row with no System gets a category with no System too,
    # which keeps the FK satisfiable without inventing a tenant for it.
    system_ids = (
        MenuItem.objects.filter(category__isnull=True)
        .values_list("system_id", flat=True)
        .distinct()
    )

    for system_id in system_ids:
        # `slug` is globally unique across every tenant, so it carries the
        # System id - two sites both needing an "Otros" would otherwise collide.
        slug = slugify(f"{FALLBACK_NAME}-{system_id or 'orphan'}")
        category = MenuCategory.objects.filter(slug=slug).first()
        if category is None:
            category = MenuCategory.objects.create(
                system_id=system_id,
                name=FALLBACK_NAME,
                en_name=FALLBACK_EN_NAME,
                slug=slug,
                # Last in the navbar and on the menu page: it is where the
                # unsorted items live, not a section the tenant authored.
                sort_order=9999,
            )
        MenuItem.objects.filter(
            category__isnull=True, system_id=system_id
        ).update(category=category)


def _noop(apps, schema_editor):
    """Reverse of the backfill: nothing to undo.

    The "Otros" categories are left in place on purpose - by the time anyone
    reverses this, items may have been filed into them by hand, and deleting a
    category cascades to its items.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0036_menuitem_eta_minutes"),
    ]

    operations = [
        migrations.RunPython(_file_uncategorized_items, _noop),
        migrations.AlterField(
            model_name="menuitem",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="menu_items",
                to="catalog.menucategory",
            ),
        ),
        migrations.RemoveField(
            model_name="menuitem",
            name="kind",
        ),
    ]
