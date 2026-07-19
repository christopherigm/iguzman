from decimal import Decimal

from django.test import TestCase

from catalog.models import (
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemIngredient,
)
from core.models import System
from core.site_payload import serialize_system, apply_payload


class SitePayloadIngredientRoundTripTests(TestCase):
    """A serialize -> apply round-trip must carry the reusable Ingredient
    catalog and re-link each menu-item ingredient to it by slug."""

    def _build_source(self):
        system = System.objects.create(site_name="Bakery", host="bakery.test")
        butter = Ingredient.objects.create(
            system=system, name="Butter", slug="butter", unit="g",
            nutrition_basis_quantity=Decimal("100"), calories=Decimal("717"),
            total_fat=Decimal("81"),
        )
        cat = MenuCategory.objects.create(
            system=system, name="Breads", slug="breads",
        )
        item = MenuItem.objects.create(
            system=system, category=cat, name="Banana Bread", slug="banana-bread",
            price=Decimal("5.00"),
        )
        MenuItemIngredient.objects.create(
            menu_item=item, ingredient=butter, quantity=Decimal("20"), unit="g",
            price=Decimal("0.00"), sort_order=0,
        )
        return system

    def test_ingredient_catalog_is_serialized(self):
        self._build_source()
        payload = serialize_system(System.objects.get(host="bakery.test"))
        self.assertEqual(len(payload["ingredients"]), 1)
        ing = payload["ingredients"][0]
        self.assertEqual(ing["slug"], "butter")
        self.assertEqual(ing["calories"], "717.00")
        # The menu-item ingredient references the catalog entry by slug.
        mii = payload["menu_categories"][0]["menu_items"][0]["ingredients"][0]
        self.assertEqual(mii["ingredient"], "butter")
        self.assertNotIn("name", mii)

    def test_apply_into_a_fresh_db_relinks_by_slug(self):
        source = self._build_source()
        payload = serialize_system(source)
        # Wipe everything and re-apply the payload as if into another database.
        MenuItemIngredient.objects.all().delete()
        MenuItem.objects.all().delete()
        Ingredient.objects.all().delete()
        MenuCategory.objects.all().delete()
        System.objects.all().delete()

        apply_payload(payload)

        butter = Ingredient.objects.get(slug="butter")
        self.assertEqual(butter.calories, Decimal("717.00"))
        mii = MenuItemIngredient.objects.get()
        self.assertEqual(mii.ingredient_id, butter.id)
        self.assertEqual(mii.calories, 143)  # round(717 * 20/100)
