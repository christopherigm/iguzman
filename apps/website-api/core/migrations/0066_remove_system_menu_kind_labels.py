"""Drop the ten ``System`` label columns for the five ``MenuItem`` kinds.

``kind_label_<kind>`` let a tenant rename what the storefront called each thing
it sells - a pizzeria's "Food" section reading "Pizzas". With ``MenuItem.kind``
gone (``catalog.0037``) a menu is sectioned by the tenant's own ``MenuCategory``
rows, which are already their own copy, so there is nothing left for these five
pairs to rename. ``product`` and ``service`` keep theirs: those two families
have no per-tenant category name standing in for the label.

The stored overrides are dropped with the columns. A tenant that had renamed
"Food" to "Pizzas" should name the category itself "Pizzas" instead - which is
what the navbar and the menu page now read.
"""

from django.db import migrations


KINDS = ("food", "drink", "dessert", "side", "appetizer")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0065_system_en_kind_label_appetizer_and_more"),
    ]

    operations = [
        migrations.RemoveField(model_name="system", name=column)
        for kind in KINDS
        for column in (f"kind_label_{kind}", f"en_kind_label_{kind}")
    ]
