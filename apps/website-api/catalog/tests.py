from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase

from decimal import Decimal

from core.models import Brand, System

from .models import (
    Product, MenuItem, MenuItemIngredient, Ingredient, normalize_selection,
)


class IncludeDisabledTests(TestCase):
    """?include_disabled=true must only ever work for a system admin.

    The catalog list endpoints are public (AllowAny GET) and also feed the
    customer-facing site, so a leak here publishes unfinished content.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.live = Product.objects.create(
            system=self.system, name="Live", slug="live", enabled=True
        )
        self.draft = Product.objects.create(
            system=self.system, name="Draft", slug="draft", enabled=False
        )
        self.url = f"/api/catalog/products/?system={self.system.id}"

    def _client_for(self, username, is_admin):
        """A logged-in client. The profile already exists (post_save signal on
        User creates it), so update that row rather than adding a second one."""
        user = User.objects.create_user(username, password="x")
        user.profile.system = self.system
        user.profile.is_admin = is_admin
        user.profile.save()
        client = self.client_class()
        client.force_login(user)
        return client

    def _admin_client(self):
        return self._client_for("admin", is_admin=True)

    def _names(self, response):
        return sorted(row["name"] for row in response.json())

    def test_public_list_excludes_disabled(self):
        self.assertEqual(self._names(self.client.get(self.url)), ["Live"])

    def test_public_cannot_opt_into_disabled(self):
        response = self.client.get(f"{self.url}&include_disabled=true")
        self.assertEqual(self._names(response), ["Live"])

    def test_admin_sees_disabled(self):
        response = self._admin_client().get(f"{self.url}&include_disabled=true")
        self.assertEqual(self._names(response), ["Draft", "Live"])

    def test_admin_response_is_not_cached_for_the_public(self):
        """The cache key is keyed off the resolved flag, not the raw param, so an
        anonymous caller replaying the admin's URL gets its own entry."""
        admin_response = self._admin_client().get(f"{self.url}&include_disabled=true")
        self.assertEqual(self._names(admin_response), ["Draft", "Live"])

        response = self.client.get(f"{self.url}&include_disabled=true")
        self.assertEqual(self._names(response), ["Live"])

    def test_public_response_does_not_mask_disabled_for_admin(self):
        """The reverse order: a warm public entry must not starve the admin."""
        self.assertEqual(self._names(self.client.get(self.url)), ["Live"])

        response = self._admin_client().get(f"{self.url}&include_disabled=true")
        self.assertEqual(self._names(response), ["Draft", "Live"])

    def test_non_admin_user_cannot_opt_into_disabled(self):
        client = self._client_for("member", is_admin=False)

        response = client.get(f"{self.url}&include_disabled=true")
        self.assertEqual(self._names(response), ["Live"])


class ListCacheInvalidationTests(TestCase):
    """A write must be visible in the next list read.

    These run on LocMemCache (no REDIS_URL), which has no delete_pattern(): the
    invalidation helper used to no-op there, so the admin list served pre-write
    data for the whole TTL and a toggle looked like a lost write.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        user = User.objects.create_user("admin", password="x")
        user.profile.system = self.system
        user.profile.is_admin = True
        user.profile.save()
        self.client.force_login(user)

    def _enabled_flags(self, url):
        return [row["enabled"] for row in self.client.get(url).json()]

    def _assert_toggle_is_visible(self, list_url, detail_url):
        self.assertEqual(self._enabled_flags(list_url), [True])  # warm the cache

        response = self.client.patch(
            detail_url, {"enabled": False}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)

        self.assertEqual(self._enabled_flags(list_url), [False])

    def test_product_toggle_is_visible_in_the_list(self):
        product = Product.objects.create(
            system=self.system, name="Live", slug="live", enabled=True
        )
        self._assert_toggle_is_visible(
            f"/api/catalog/products/?system={self.system.id}&include_disabled=true",
            f"/api/catalog/products/{product.id}/",
        )

    def test_brand_toggle_is_visible_in_the_list(self):
        brand = Brand.objects.create(
            system=self.system, name="Acme", slug="acme", enabled=True
        )
        self._assert_toggle_is_visible(
            f"/api/brands/?system={self.system.id}&include_disabled=true",
            f"/api/brands/{brand.id}/",
        )


class MenuItemPricingTests(TestCase):
    """The base-price + add-on-delta arithmetic is the money path for menu items,
    so it is pinned here: it is what the cart, checkout and storefront all call."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Cocina", host="cocina.test")
        self.item = MenuItem.objects.create(
            system=self.system, name="Taco", slug="taco", price=Decimal("8.00"),
        )
        # Shared, reusable ingredients (identity + nutrition live here now).
        tortilla_ing = Ingredient.objects.create(
            system=self.system, name="Tortilla", slug="tortilla", unit="pc",
        )
        pork_ing = Ingredient.objects.create(
            system=self.system, name="Pork", slug="pork", unit="g",
        )
        cheese_ing = Ingredient.objects.create(
            system=self.system, name="Cheese", slug="cheese", unit="g",
        )
        # A free included, removable default.
        self.tortilla = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=tortilla_ing, price=Decimal("0.00"),
            is_default=True, is_removable=True, max_quantity=1,
        )
        # A default that can be doubled: first unit free, extra costs 3.
        self.pork = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=pork_ing, price=Decimal("3.00"),
            is_default=True, is_removable=True, max_quantity=2,
        )
        # An optional add-on: each unit charged.
        self.cheese = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=cheese_ing, price=Decimal("1.50"),
            is_default=False, is_removable=True, max_quantity=2,
        )

    def test_base_price_when_left_as_listed(self):
        self.assertEqual(self.item.price_for_selection([]), Decimal("8.00"))

    def test_removing_a_default_does_not_refund(self):
        selection = normalize_selection(
            [{"ingredient": self.tortilla.id, "quantity": 0}], self.item.ingredients.all()
        )
        self.assertEqual(selection, [{"ingredient": self.tortilla.id, "quantity": 0}])
        self.assertEqual(self.item.price_for_selection(selection), Decimal("8.00"))

    def test_extra_of_a_default_charges_only_beyond_the_included_unit(self):
        # Double pork: 1 free (base) + 1 extra @ 3.00
        selection = [{"ingredient": self.pork.id, "quantity": 2}]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("11.00"))

    def test_optional_add_on_charges_every_unit(self):
        selection = [{"ingredient": self.cheese.id, "quantity": 2}]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("11.00"))

    def test_combined_selection(self):
        selection = [
            {"ingredient": self.pork.id, "quantity": 2},   # +3.00
            {"ingredient": self.cheese.id, "quantity": 1},  # +1.50
        ]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("12.50"))

    def test_normalize_clamps_and_drops_noops(self):
        selection = normalize_selection(
            [
                {"ingredient": self.cheese.id, "quantity": 99},  # clamped to 2
                {"ingredient": self.pork.id, "quantity": 1},     # == included, dropped
                {"ingredient": 999999, "quantity": 5},           # unknown, dropped
            ],
            self.item.ingredients.all(),
        )
        self.assertEqual(selection, [{"ingredient": self.cheese.id, "quantity": 2}])

    def test_selection_ignores_foreign_ingredients(self):
        other = MenuItem.objects.create(
            system=self.system, name="Burrito", slug="burrito", price=Decimal("10.00"),
        )
        rice_ing = Ingredient.objects.create(
            system=self.system, name="Rice", slug="rice", unit="g",
        )
        foreign = MenuItemIngredient.objects.create(
            menu_item=other, ingredient=rice_ing, price=Decimal("2.00"), is_default=False,
        )
        # A selection naming an ingredient from a different item must not price it.
        self.assertEqual(
            self.item.price_for_selection([{"ingredient": foreign.id, "quantity": 1}]),
            Decimal("8.00"),
        )


class UnitConversionTests(TestCase):
    """convert_quantity only bridges units within one physical dimension."""

    def test_within_mass(self):
        from .units import convert_quantity
        self.assertEqual(convert_quantity(2000, "g", "kg"), Decimal("2"))
        self.assertEqual(convert_quantity(2, "kg", "g"), Decimal("2000"))

    def test_within_volume(self):
        from .units import convert_quantity
        self.assertEqual(convert_quantity(1, "l", "ml"), Decimal("1000"))

    def test_same_unit_is_identity(self):
        from .units import convert_quantity
        self.assertEqual(convert_quantity(3, "pc", "pc"), Decimal("3"))

    def test_cross_dimension_and_distinct_count_units_are_unconvertible(self):
        from .units import convert_quantity
        self.assertIsNone(convert_quantity(1, "g", "ml"))     # mass vs volume
        self.assertIsNone(convert_quantity(1, "pc", "slice"))  # two count units
        self.assertIsNone(convert_quantity(1, "g", None))      # missing unit


class IngredientNutritionTests(TestCase):
    """Nutrition is stored per-basis on Ingredient and scaled to the portion."""

    def setUp(self):
        self.system = System.objects.create(site_name="Bakery", host="bakery.test")
        self.butter = Ingredient.objects.create(
            system=self.system, name="Butter", slug="butter", unit="g",
            nutrition_basis_quantity=Decimal("100"), calories=Decimal("717"),
            total_fat=Decimal("81"),
        )
        self.orange = Ingredient.objects.create(
            system=self.system, name="Orange", slug="orange", unit="pc",
            nutrition_basis_quantity=Decimal("1"), calories=Decimal("62"),
        )
        self.item = MenuItem.objects.create(
            system=self.system, name="Bread", slug="bread", price=Decimal("5.00"),
        )

    def test_calories_scale_by_mass_portion(self):
        mii = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.butter,
            quantity=Decimal("20"), unit="g",
        )
        self.assertEqual(mii.calories, 143)  # round(717 * 20/100)
        self.assertEqual(mii.nutrient("total_fat"), Decimal("16.2"))

    def test_calories_scale_by_piece_portion(self):
        mii = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.orange,
            quantity=Decimal("2"), unit="pc",
        )
        self.assertEqual(mii.calories, 124)

    def test_unconvertible_portion_yields_no_calories(self):
        # Butter's basis is grams; a portion counted in pieces cannot be scaled.
        mii = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.butter,
            quantity=Decimal("2"), unit="pc",
        )
        self.assertIsNone(mii.calories)

    def test_public_menu_read_exposes_scaled_calories(self):
        MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.butter,
            quantity=Decimal("40"), unit="g",
        )
        res = self.client.get(f"/api/catalog/menu-items/{self.item.id}/")
        self.assertEqual(res.status_code, 200)
        ing = res.json()["ingredients"][0]
        self.assertEqual(ing["name"], "Butter")
        self.assertEqual(ing["calories"], 287)  # round(717 * 40/100 = 286.8)
        self.assertEqual(ing["ingredient"], self.butter.id)


class IngredientEndpointTests(TestCase):
    """The reusable Ingredient catalog is a public-read, admin-write resource."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Bakery", host="bakery.test")

    def _host(self):
        return {"HTTP_X_WEBSITE_HOST": "bakery.test"}

    def _admin_client(self):
        user = User.objects.create_user("chef", password="x")
        user.profile.system = self.system
        user.profile.is_admin = True
        user.profile.save()
        client = self.client_class()
        client.force_login(user)
        return client

    def test_public_can_list(self):
        Ingredient.objects.create(system=self.system, name="Flour", slug="flour", unit="g")
        res = self.client.get("/api/catalog/ingredients/", **self._host())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

    def test_admin_can_create(self):
        client = self._admin_client()
        payload = {
            "system": self.system.id, "name": "Sugar", "slug": "sugar",
            "unit": "g", "nutrition_basis_quantity": "100", "calories": "387",
        }
        res = client.post(
            "/api/catalog/ingredients/", data=payload,
            content_type="application/json", **self._host(),
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Ingredient.objects.get(slug="sugar").calories, Decimal("387"))

    def test_delete_is_blocked_while_in_use(self):
        client = self._admin_client()
        ing = Ingredient.objects.create(system=self.system, name="Salt", slug="salt", unit="g")
        item = MenuItem.objects.create(system=self.system, name="Pretzel", slug="pretzel", price=Decimal("3"))
        MenuItemIngredient.objects.create(menu_item=item, ingredient=ing)
        res = client.delete(f"/api/catalog/ingredients/{ing.id}/", **self._host())
        self.assertEqual(res.status_code, 409)
        self.assertTrue(Ingredient.objects.filter(pk=ing.id).exists())
