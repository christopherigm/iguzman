import base64

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.test import TestCase

from decimal import Decimal

from core.models import Branch, Brand, System

from .models import (
    Product, ProductImage, MenuCategory, MenuItem, MenuItemIngredient,
    MenuItemIngredientOption, MenuSize, Ingredient, RecipeStep, Service,
    normalize_selection,
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


class MenuItemCategoryTests(TestCase):
    """The tenant's own `MenuCategory` is the *only* sectioning a menu has, and
    it is required - it groups the menu page, fills the navbar's Menu dropdown
    and is a segment of every item's URL (`/menu/<category>/<slug>`).

    It replaced a structural `kind` enum (food/drink/dessert/side/appetizer)
    that sat alongside it and could only ever be a second, disagreeing
    sectioning of one menu. What is pinned here is what that removal has to keep
    working: the `?category=` filter, the variant reference carrying the segment
    it links through, and the fact that an item cannot be filed under nothing.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Bar", host="bar.test")
        self.dishes = MenuCategory.objects.create(
            system=self.system, name="Platillos", slug="k-platillos",
        )
        self.drinks = MenuCategory.objects.create(
            system=self.system, name="Bebidas", slug="k-bebidas",
        )
        self.dish = MenuItem.objects.create(
            system=self.system, category=self.dishes, name="Taco",
            slug="k-taco", price=Decimal("8.00"),
        )
        self.drink = MenuItem.objects.create(
            system=self.system, category=self.drinks, name="Michelada",
            slug="k-michelada", price=Decimal("6.00"),
        )
        self.flan = MenuItem.objects.create(
            system=self.system, category=self.dishes, name="Flan",
            slug="k-flan", price=Decimal("4.00"),
        )
        self.url = f"/api/catalog/menu-items/?system={self.system.id}"

    def _names(self, response):
        return sorted(row["name"] for row in response.json())

    def test_public_read_exposes_the_category_and_its_slug(self):
        """`category_slug` is the first segment of the item's detail URL, so a
        card cannot link anywhere without it."""
        rows = {r["name"]: r for r in self.client.get(self.url).json()}
        self.assertEqual(rows["Michelada"]["category_slug"], "k-bebidas")
        self.assertEqual(rows["Michelada"]["category_name"], "Bebidas")

    def test_filter_returns_only_that_category(self):
        response = self.client.get(f"{self.url}&category={self.drinks.id}")
        self.assertEqual(self._names(response), ["Michelada"])

    def test_unfiltered_list_returns_every_category(self):
        self.assertEqual(
            self._names(self.client.get(self.url)), ["Flan", "Michelada", "Taco"]
        )

    def test_filtered_and_unfiltered_lists_do_not_share_a_cache_entry(self):
        self.assertEqual(
            self._names(self.client.get(f"{self.url}&category={self.drinks.id}")),
            ["Michelada"],
        )
        self.assertEqual(
            self._names(self.client.get(self.url)), ["Flan", "Michelada", "Taco"]
        )

    def test_variant_reference_carries_its_own_category_slug(self):
        """A variant thumbnail links to the sibling's own URL, whose first
        segment is the sibling's category - not the current page's. Nothing
        stops the CMS from pairing across categories, which is exactly when
        assuming would 404."""
        self.dish.variants.add(self.drink)

        rows = {r["name"]: r for r in self.client.get(self.url).json()}
        variants = {v["slug"]: v["category_slug"] for v in rows["Taco"]["variants"]}

        self.assertEqual(variants, {"k-michelada": "k-bebidas"})

    def test_the_write_serializer_refuses_an_item_with_no_category(self):
        """Optional on Product and Service, required here: an uncategorized item
        has no section to appear in and no URL to live at."""
        from .serializers import MenuItemWriteSerializer

        serializer = MenuItemWriteSerializer(data={
            "system": self.system.id, "slug": "k-orphan",
            "name": "Orphan", "price": "5.00",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("category", serializer.errors)

    def test_deleting_a_category_deletes_its_items(self):
        """CASCADE, not PROTECT - there is no "no category" state for an item to
        fall back to, so the row cannot outlive its section."""
        self.drinks.delete()
        self.assertFalse(MenuItem.objects.filter(pk=self.drink.pk).exists())
        self.assertTrue(MenuItem.objects.filter(pk=self.dish.pk).exists())

    def test_system_payload_counts_the_menu(self):
        # The navbar decides whether to render a Menu entry at all from this.
        payload = self.client.get(
            "/api/system/", HTTP_X_WEBSITE_HOST="bar.test"
        ).json()
        self.assertEqual(payload["menu_item_count"], 3)

    def test_system_payload_ignores_disabled_items(self):
        self.drink.enabled = False
        self.drink.save()
        payload = self.client.get(
            "/api/system/", HTTP_X_WEBSITE_HOST="bar.test"
        ).json()
        self.assertEqual(payload["menu_item_count"], 2)


class SystemPayloadInvalidationTests(TestCase):
    """The System payload is cached for an hour and carries counts of *other*
    models, so a catalog or branch write has to clear it (see
    `core.cache.invalidate_system_payload`).

    Every test here reads the endpoint once *before* writing, so the assertion is
    against a populated cache - that is the whole failure mode. Without the
    signals these all pass on a cold cache and fail in production, which is how
    a menu item write left the navbar without a Menu link for up to an hour.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Bar", host="inv.test")
        self.category = MenuCategory.objects.create(
            system=self.system, name="Bebidas", slug="inv-bebidas",
        )
        self.url = "/api/system/"
        self.host = {"HTTP_X_WEBSITE_HOST": "inv.test"}

    def _payload(self):
        return self.client.get(self.url, **self.host).json()

    def test_creating_the_first_menu_item_updates_the_count(self):
        self.assertEqual(self._payload()["menu_item_count"], 0)
        MenuItem.objects.create(
            system=self.system, category=self.category, name="Agua",
            slug="inv-agua", price=Decimal("2.00"),
        )
        self.assertEqual(self._payload()["menu_item_count"], 1)

    def test_disabling_the_last_menu_item_updates_the_count(self):
        item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Michelada",
            slug="inv-michelada", price=Decimal("6.00"),
        )
        self.assertEqual(self._payload()["menu_item_count"], 1)

        # Nothing but `enabled` moves, so no other write path would notice the
        # payload had gone stale.
        item.enabled = False
        item.save()
        self.assertEqual(self._payload()["menu_item_count"], 0)

    def test_deleting_a_menu_item_updates_the_count(self):
        item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Flan",
            slug="inv-flan", price=Decimal("4.00"),
        )
        self.assertEqual(self._payload()["menu_item_count"], 1)
        item.delete()
        self.assertEqual(self._payload()["menu_item_count"], 0)

    def test_product_and_service_counts_are_invalidated_too(self):
        # Same class of bug, same fix: these drive the Products/Services links.
        self.assertEqual(self._payload()["product_count"], 0)
        Product.objects.create(
            system=self.system, name="Mug", slug="inv-mug", price=Decimal("9.00"),
        )
        self.assertEqual(self._payload()["product_count"], 1)

        self.assertEqual(self._payload()["service_count"], 0)
        Service.objects.create(
            system=self.system, name="Catering", slug="inv-catering",
            price=Decimal("99.00"),
        )
        self.assertEqual(self._payload()["service_count"], 1)

    def test_branch_count_is_invalidated(self):
        # `branch_count` is what decides whether the Contact link renders at all.
        self.assertEqual(self._payload()["branch_count"], 0)
        Branch.objects.create(system=self.system, name="Centro")
        self.assertEqual(self._payload()["branch_count"], 1)


class MenuItemPricingTests(TestCase):
    """The base-price + add-on-delta arithmetic is the money path for menu items,
    so it is pinned here: it is what the cart, checkout and storefront all call."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Cocina", host="cocina.test")
        self.category = MenuCategory.objects.create(
            system=self.system, name="Platillos", slug="taco-platillos",
        )
        self.item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Taco",
            slug="taco", price=Decimal("8.00"),
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
        # Included by default: free and locked into the dish (part of the base).
        self.tortilla = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=tortilla_ing, price=Decimal("0.00"),
            is_removable=False, max_quantity=1,
        )
        # An optional add-on charged per unit, up to 2 (e.g. extra pork).
        self.pork = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=pork_ing, price=Decimal("3.00"),
            is_removable=True, max_quantity=2,
        )
        # Another optional add-on: each unit charged.
        self.cheese = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=cheese_ing, price=Decimal("1.50"),
            is_removable=True, max_quantity=2,
        )

    def test_base_price_when_left_as_listed(self):
        self.assertEqual(self.item.price_for_selection([]), Decimal("8.00"))

    def test_removing_an_included_ingredient_does_not_refund(self):
        selection = normalize_selection(
            [{"ingredient": self.tortilla.id, "quantity": 0}], self.item.ingredients.all()
        )
        self.assertEqual(selection, [{"ingredient": self.tortilla.id, "quantity": 0}])
        self.assertEqual(self.item.price_for_selection(selection), Decimal("8.00"))

    def test_add_on_charges_every_selected_unit(self):
        # Two units of the pork add-on @ 3.00 each, on top of the 8.00 base.
        selection = [{"ingredient": self.pork.id, "quantity": 2}]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("14.00"))

    def test_optional_add_on_charges_every_unit(self):
        selection = [{"ingredient": self.cheese.id, "quantity": 2}]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("11.00"))

    def test_combined_selection(self):
        selection = [
            {"ingredient": self.pork.id, "quantity": 1},    # +3.00
            {"ingredient": self.cheese.id, "quantity": 1},  # +1.50
        ]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("12.50"))

    def test_free_portions_are_not_charged(self):
        # Cheese with one free portion: the first unit is free, only the second
        # is charged (@1.50), on top of the 8.00 base.
        self.cheese.number_of_free_portions = 1
        self.cheese.save()
        self.assertEqual(
            self.item.price_for_selection([{"ingredient": self.cheese.id, "quantity": 1}]),
            Decimal("8.00"),
        )
        self.assertEqual(
            self.item.price_for_selection([{"ingredient": self.cheese.id, "quantity": 2}]),
            Decimal("9.50"),
        )

    def test_default_quantity_is_priced_even_when_untouched(self):
        # Pork pre-selected at 1 (no free portions) is charged from the base
        # price, and an empty/omitted selection prices it at that default.
        self.pork.default_quantity = 1
        self.pork.save()
        self.assertEqual(self.item.price_for_selection([]), Decimal("11.00"))
        # Leaving pork at its default drops the row; the price is unchanged.
        selection = normalize_selection(
            [{"ingredient": self.pork.id, "quantity": 1}], self.item.ingredients.all()
        )
        self.assertEqual(selection, [])
        self.assertEqual(self.item.price_for_selection(selection), Decimal("11.00"))
        # Removing the pre-selected default down to 0 refunds its up-charge.
        selection = normalize_selection(
            [{"ingredient": self.pork.id, "quantity": 0}], self.item.ingredients.all()
        )
        self.assertEqual(selection, [{"ingredient": self.pork.id, "quantity": 0}])
        self.assertEqual(self.item.price_for_selection(selection), Decimal("8.00"))

    def test_normalize_clamps_and_drops_noops(self):
        selection = normalize_selection(
            [
                {"ingredient": self.cheese.id, "quantity": 99},  # clamped to 2
                {"ingredient": self.pork.id, "quantity": 0},     # == included (0), dropped
                {"ingredient": 999999, "quantity": 5},           # unknown, dropped
            ],
            self.item.ingredients.all(),
        )
        self.assertEqual(selection, [{"ingredient": self.cheese.id, "quantity": 2}])

    def test_internal_ingredient_is_excluded_from_price(self):
        # An internal (kitchen-only) ingredient never affects the customer's
        # total, even when it carries an up-charge and is named in a selection.
        oil_ing = Ingredient.objects.create(
            system=self.system, name="Oil", slug="oil", unit="ml",
        )
        oil = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=oil_ing, price=Decimal("5.00"),
            is_removable=True, max_quantity=3, is_internal=True,
        )
        self.assertEqual(
            self.item.price_for_selection([{"ingredient": oil.id, "quantity": 3}]),
            Decimal("8.00"),
        )
        # It is also dropped from a normalised selection: not customer-selectable.
        self.assertEqual(
            normalize_selection(
                [{"ingredient": oil.id, "quantity": 3}], self.item.ingredients.all()
            ),
            [],
        )

    def test_selection_ignores_foreign_ingredients(self):
        other = MenuItem.objects.create(
            system=self.system, category=self.category, name="Burrito",
            slug="burrito", price=Decimal("10.00"),
        )
        rice_ing = Ingredient.objects.create(
            system=self.system, name="Rice", slug="rice", unit="g",
        )
        foreign = MenuItemIngredient.objects.create(
            menu_item=other, ingredient=rice_ing, price=Decimal("2.00"), is_removable=True,
        )
        # A selection naming an ingredient from a different item must not price it.
        self.assertEqual(
            self.item.price_for_selection([{"ingredient": foreign.id, "quantity": 1}]),
            Decimal("8.00"),
        )


class MenuItemChoiceGroupTests(TestCase):
    """Single-select choice groups: a group whose default ingredient can be
    swapped for a priced alternative (e.g. Sweetener -> Organic sugar / Splenda).
    Pinned separately because the ``option`` field threads through pricing,
    normalisation, and the no-refund invariant."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Cafe", host="cafe.test")
        self.item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="latte-bebidas",
            ),
            name="Latte", slug="latte", price=Decimal("4.00"),
        )
        self.refined = Ingredient.objects.create(
            system=self.system, name="Refined sugar", slug="refined", unit="g",
        )
        self.organic = Ingredient.objects.create(
            system=self.system, name="Organic sugar", slug="organic", unit="g",
        )
        self.splenda = Ingredient.objects.create(
            system=self.system, name="Splenda", slug="splenda", unit="g",
        )
        # Sweetener: included by default at Refined sugar (free), max 2 units.
        self.sweetener = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.refined, price=Decimal("0.00"),
            is_removable=True, max_quantity=2, default_quantity=1,
            number_of_free_portions=1,
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=self.sweetener, ingredient=self.organic,
            price=Decimal("0.50"), sort_order=0,
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=self.sweetener, ingredient=self.splenda,
            price=Decimal("0.25"), sort_order=1,
        )

    def test_default_option_left_as_listed_is_base_price(self):
        self.assertEqual(self.item.price_for_selection([]), Decimal("4.00"))

    def test_picking_a_priced_option_charges_its_delta_over_the_free_unit(self):
        # One Organic sugar (@0.50) with one free portion baked into the base:
        # the premium delta is still charged even though the unit is "included".
        selection = [{"ingredient": self.sweetener.id, "quantity": 1, "option": self.organic.id}]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("4.50"))

    def test_option_price_scales_with_quantity(self):
        selection = [{"ingredient": self.sweetener.id, "quantity": 2, "option": self.organic.id}]
        self.assertEqual(self.item.price_for_selection(selection), Decimal("5.00"))

    def test_normalize_records_a_non_default_option_even_at_default_quantity(self):
        selection = normalize_selection(
            [{"ingredient": self.sweetener.id, "quantity": 1, "option": self.splenda.id}],
            self.item.ingredients.all(),
        )
        self.assertEqual(
            selection,
            [{"ingredient": self.sweetener.id, "quantity": 1, "option": self.splenda.id}],
        )
        self.assertEqual(self.item.price_for_selection(selection), Decimal("4.25"))

    def test_normalize_drops_the_default_option_at_default_quantity(self):
        selection = normalize_selection(
            [{"ingredient": self.sweetener.id, "quantity": 1, "option": self.refined.id}],
            self.item.ingredients.all(),
        )
        self.assertEqual(selection, [])

    def test_bogus_option_falls_back_to_default(self):
        # An option id that is not one of this group's choices is dropped by
        # normalisation and priced as the default (no crash, no premium).
        selection = normalize_selection(
            [{"ingredient": self.sweetener.id, "quantity": 1, "option": 999999}],
            self.item.ingredients.all(),
        )
        self.assertEqual(selection, [])
        self.assertEqual(
            self.item.price_for_selection(
                [{"ingredient": self.sweetener.id, "quantity": 1, "option": 999999}]
            ),
            Decimal("4.00"),
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
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Panes", slug="bread-panes",
            ),
            name="Bread", slug="bread", price=Decimal("5.00"),
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
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Panes", slug="pretzel-panes",
            ),
            name="Pretzel", slug="pretzel", price=Decimal("3"),
        )
        MenuItemIngredient.objects.create(menu_item=item, ingredient=ing)
        res = client.delete(f"/api/catalog/ingredients/{ing.id}/", **self._host())
        self.assertEqual(res.status_code, 409)
        self.assertTrue(Ingredient.objects.filter(pk=ing.id).exists())


class CloneTests(TestCase):
    """The CMS "Clone" button, which is a deep copy - not a second row pointing
    at the first one's children and files."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Deli", host="deli.test")

    def _admin_client(self):
        user = User.objects.create_user("owner", password="x")
        user.profile.system = self.system
        user.profile.is_admin = True
        user.profile.save()
        client = self.client_class()
        client.force_login(user)
        return client

    def _image(self, name="pic.png"):
        """A 1x1 PNG, small enough that the resize pipeline leaves it alone."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        raw = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
            "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        return SimpleUploadedFile(name, raw, content_type="image/png")

    def _clone(self, client, path, **body):
        payload = {"name": "Copy", "en_name": "Copy EN"}
        payload.update(body)
        return client.post(
            path, data=payload, content_type="application/json",
            **{"HTTP_X_WEBSITE_HOST": "deli.test"},
        )

    # ── auth ────────────────────────────────────────────────────────────────

    def test_clone_requires_admin(self):
        product = Product.objects.create(system=self.system, name="Mug", slug="mug")
        res = self._clone(self.client_class(), f"/api/catalog/products/{product.id}/clone/")
        self.assertIn(res.status_code, (401, 403))
        self.assertEqual(Product.objects.count(), 1)

    def test_clone_rejects_a_blank_name(self):
        product = Product.objects.create(system=self.system, name="Mug", slug="mug")
        res = self._clone(
            self._admin_client(), f"/api/catalog/products/{product.id}/clone/", name="  "
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Product.objects.count(), 1)

    # ── product ─────────────────────────────────────────────────────────────

    def test_product_clone_copies_gallery_files_and_drops_the_sku(self):
        product = Product.objects.create(
            system=self.system, name="Mug", slug="mug", sku="MUG-1",
            price=Decimal("12.00"), image=self._image(),
        )
        gallery = ProductImage.objects.create(product=product, image=self._image("g.png"))

        res = self._clone(self._admin_client(), f"/api/catalog/products/{product.id}/clone/")
        self.assertEqual(res.status_code, 201, res.content)

        clone = Product.objects.get(pk=res.json()["id"])
        self.assertNotEqual(clone.id, product.id)
        self.assertEqual(clone.name, "Copy")
        self.assertEqual(clone.en_name, "Copy EN")
        self.assertEqual(clone.price, Decimal("12.00"))
        # sku is unique=True - a copied one would collide.
        self.assertIsNone(clone.sku)
        self.assertEqual(clone.slug, f"{self.system.id}-copy")

        # Own file, and the file really exists: deleting one must not blank the other.
        self.assertTrue(clone.image.name)
        self.assertNotEqual(clone.image.name, product.image.name)
        self.assertTrue(default_storage.exists(clone.image.name))

        clone_gallery = clone.images.get()
        self.assertNotEqual(clone_gallery.id, gallery.id)
        self.assertNotEqual(clone_gallery.image.name, gallery.image.name)
        self.assertTrue(default_storage.exists(clone_gallery.image.name))

    def test_product_clone_joins_the_originals_variant_family(self):
        product = Product.objects.create(system=self.system, name="Mug", slug="mug")
        sibling = Product.objects.create(system=self.system, name="Mug XL", slug="mug-xl")
        product.variants.add(sibling)

        res = self._clone(self._admin_client(), f"/api/catalog/products/{product.id}/clone/")
        clone = Product.objects.get(pk=res.json()["id"])

        # Siblings are standalone products, so the family is linked, not copied.
        self.assertEqual(list(clone.variants.all()), [sibling])
        # A copy is not automatically an alternative version of its original.
        self.assertNotIn(product, clone.variants.all())

    def test_cloning_the_same_name_twice_still_yields_unique_slugs(self):
        product = Product.objects.create(system=self.system, name="Mug", slug="mug")
        client = self._admin_client()
        first = self._clone(client, f"/api/catalog/products/{product.id}/clone/")
        second = self._clone(client, f"/api/catalog/products/{product.id}/clone/")
        self.assertEqual(second.status_code, 201, second.content)
        self.assertNotEqual(first.json()["slug"], second.json()["slug"])

    # ── menu item ───────────────────────────────────────────────────────────

    def test_menu_item_clone_copies_ingredients_options_and_recipe(self):
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="latte-group-bebidas",
            ),
            name="Latte", slug="latte", price=Decimal("4.00"),
        )
        sugar = Ingredient.objects.create(system=self.system, name="Sugar", slug="sugar", unit="g")
        splenda = Ingredient.objects.create(system=self.system, name="Splenda", slug="splenda", unit="g")
        row = MenuItemIngredient.objects.create(
            menu_item=item, ingredient=sugar, group_name="Sweetener",
            price=Decimal("0.50"), is_removable=True, max_quantity=3,
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=row, ingredient=splenda, price=Decimal("0.75"),
        )
        RecipeStep.objects.create(
            menu_item=item, step_number=1, instruction="Steam the milk",
            image=self._image("step.png"),
        )

        res = self._clone(self._admin_client(), f"/api/catalog/menu-items/{item.id}/clone/")
        self.assertEqual(res.status_code, 201, res.content)
        clone = MenuItem.objects.get(pk=res.json()["id"])

        clone_row = clone.ingredients.get()
        self.assertNotEqual(clone_row.id, row.id)
        self.assertEqual(clone_row.group_name, "Sweetener")
        self.assertEqual(clone_row.price, Decimal("0.50"))
        # The shared Ingredient catalog is referenced, never duplicated.
        self.assertEqual(clone_row.ingredient_id, sugar.id)
        self.assertEqual(Ingredient.objects.count(), 2)

        clone_option = clone_row.options.get()
        self.assertEqual(clone_option.ingredient_id, splenda.id)
        self.assertEqual(clone_option.price, Decimal("0.75"))

        clone_step = clone.recipe_steps.get()
        self.assertEqual(clone_step.instruction, "Steam the milk")
        self.assertTrue(default_storage.exists(clone_step.image.name))

        # A copy is not automatically an alternative version of its original.
        self.assertNotIn(item, clone.variants.all())

    def test_menu_item_clone_prices_a_selection_off_its_own_rows(self):
        """The clone's pricing must run on the clone's ingredient ids, not the
        original's - otherwise a customised order on the copy prices as base."""
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="latte-upcharge-bebidas",
            ),
            name="Latte", slug="latte", price=Decimal("4.00"),
        )
        sugar = Ingredient.objects.create(system=self.system, name="Sugar", slug="sugar", unit="g")
        MenuItemIngredient.objects.create(
            menu_item=item, ingredient=sugar, price=Decimal("0.50"),
            is_removable=True, max_quantity=3,
        )

        res = self._clone(self._admin_client(), f"/api/catalog/menu-items/{item.id}/clone/")
        clone = MenuItem.objects.get(pk=res.json()["id"])
        clone_row = clone.ingredients.get()

        selection = [{"ingredient": clone_row.id, "quantity": 2}]
        self.assertEqual(clone.price_for_selection(selection), Decimal("5.00"))


class ServiceSlugReadTests(TestCase):
    """`?slug=` on the services *list* endpoint is the storefront's detail read.

    `getService(slug)` in the website's `lib/catalog.ts` has no other route to a
    single service, so this query has to answer with everything a detail page
    needs. Served with the list serializer it silently omitted the party bounds,
    and the booking page's counter - gated on `max > min` - never rendered while
    its heading priced a party of `NaN`.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Tours", host="tours.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Marina", booking_capacity=4,
        )
        self.service = Service.objects.create(
            system=self.system, name="Boat tour", slug="boat-tour",
            price=Decimal("500.00"), duration=120,
            booking_enabled=True, booking_party_enabled=True,
            booking_party_min=2, booking_party_max=12,
        )
        self.url = "/api/catalog/services/?slug=boat-tour"

    def _row(self, url=None):
        rows = self.client.get(url or self.url, HTTP_X_WEBSITE_HOST="tours.test").json()
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_slug_read_carries_the_party_bounds(self):
        row = self._row()
        self.assertEqual(row["booking_party_min"], 2)
        self.assertEqual(row["booking_party_max"], 12)
        self.assertIn("booking_party_limit", row)

    def test_party_limit_is_capped_by_the_biggest_resource(self):
        """The ceiling is `min(what the service allows, what one resource holds)`
        - here the branch's implicit four-seat resource, not the service's 12."""
        self.assertEqual(self._row()["booking_party_limit"], 4)

    def test_grid_read_stays_on_the_cheap_serializer(self):
        """The split exists to keep `booking_party_limit`'s walk over pools and
        resources off a catalog grid - an unfiltered list must not grow it."""
        rows = self.client.get(
            "/api/catalog/services/", HTTP_X_WEBSITE_HOST="tours.test"
        ).json()
        self.assertEqual(len(rows), 1)
        self.assertIn("booking_party_enabled", rows[0])
        self.assertNotIn("booking_party_limit", rows[0])
        self.assertNotIn("booking_party_min", rows[0])


class MenuSizeTests(TestCase):
    """Sizes are the second axis of a menu item's price, so the resolution rules
    (inherit / override / off) and the arithmetic are pinned here - the cart, the
    till and the storefront all read them through `price_for_selection`."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="piccolo.test")
        self.category = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="size-pizzas",
        )
        self.item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Margarita",
            slug="size-margarita", price=Decimal("200.00"),
        )
        self.small = MenuSize.objects.create(
            category=self.category, name="Chica", portion=Decimal("4"), unit="in",
            price_delta=Decimal("-40.00"), sort_order=0,
        )
        self.medium = MenuSize.objects.create(
            category=self.category, name="Mediana", portion=Decimal("8"), unit="in",
            price_delta=Decimal("0.00"), is_default=True, sort_order=1,
        )
        self.large = MenuSize.objects.create(
            category=self.category, name="Grande", portion=Decimal("12"), unit="in",
            price_delta=Decimal("40.00"), sort_order=2,
        )

    # ── resolution ───────────────────────────────────────────────────────────

    def test_dish_inherits_its_category_sizes(self):
        self.assertEqual(
            [s.name for s in self.item.effective_sizes],
            ["Chica", "Mediana", "Grande"],
        )

    def test_own_rows_replace_the_category_list_entirely(self):
        # The point of "replace, not merge": an edge-case dish can *drop* a size.
        MenuSize.objects.create(
            menu_item=self.item, name="Individual", price_delta=Decimal("0.00"),
        )
        self.assertEqual([s.name for s in self.item.effective_sizes], ["Individual"])

    def test_switch_off_sells_the_dish_in_one_size(self):
        self.item.sizes_enabled = False
        self.item.save()
        self.assertEqual(self.item.effective_sizes, [])
        self.assertIsNone(self.item.default_size)
        self.assertEqual(self.item.price_for_selection([]), Decimal("200.00"))

    def test_disabled_rows_never_reach_a_customer(self):
        self.large.enabled = False
        self.large.save()
        self.assertEqual(
            [s.name for s in self.item.effective_sizes], ["Chica", "Mediana"],
        )

    def test_default_is_the_flagged_row(self):
        self.assertEqual(self.item.default_size, self.medium)

    def test_default_falls_back_to_the_first_in_display_order(self):
        self.medium.is_default = False
        self.medium.save()
        self.assertEqual(self.item.default_size, self.small)

    def test_system_is_derived_from_the_owner(self):
        # Never authored: it is what scopes the row for backup and for which R2
        # bucket its image is written to.
        self.assertEqual(self.small.system_id, self.system.pk)
        own = MenuSize.objects.create(menu_item=self.item, name="Individual")
        self.assertEqual(own.system_id, self.system.pk)

    # ── pricing ──────────────────────────────────────────────────────────────

    def test_no_size_named_prices_at_the_default(self):
        self.assertEqual(self.item.price_for_selection([]), Decimal("200.00"))

    def test_a_small_size_discounts_the_base(self):
        self.assertEqual(
            self.item.price_for_selection([], self.small), Decimal("160.00"),
        )

    def test_a_large_size_adds_to_the_base(self):
        self.assertEqual(
            self.item.price_for_selection([], self.large), Decimal("240.00"),
        )

    def test_size_does_not_scale_ingredient_upcharges(self):
        cheese_ing = Ingredient.objects.create(
            system=self.system, name="Queso", slug="size-queso", unit="g",
        )
        cheese = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=cheese_ing, price=Decimal("25.00"),
            is_removable=True, max_quantity=2,
        )
        selection = [{"ingredient": cheese.id, "quantity": 1}]
        # +25 on the small and on the large alike: one pricing axis.
        self.assertEqual(
            self.item.price_for_selection(selection, self.small), Decimal("185.00"),
        )
        self.assertEqual(
            self.item.price_for_selection(selection, self.large), Decimal("265.00"),
        )

    def test_a_delta_bigger_than_the_base_floors_at_zero(self):
        self.small.price_delta = Decimal("-500.00")
        self.small.save()
        self.assertEqual(
            self.item.price_for_selection([], self.small), Decimal("0.00"),
        )

    # ── resolve_size never trusts an id ──────────────────────────────────────

    def test_resolve_size_falls_back_to_the_default(self):
        self.assertEqual(self.item.resolve_size(None), self.medium)
        self.assertEqual(self.item.resolve_size(999999), self.medium)

    def test_a_size_from_another_dish_prices_as_the_default(self):
        other_category = MenuCategory.objects.create(
            system=self.system, name="Bebidas", slug="size-bebidas",
        )
        foreign = MenuSize.objects.create(
            category=other_category, name="Litro", price_delta=Decimal("500.00"),
        )
        self.assertEqual(self.item.resolve_size(foreign.id), self.medium)
        self.assertEqual(
            self.item.price_for_selection([], self.item.resolve_size(foreign.id)),
            Decimal("200.00"),
        )

    def test_an_overridden_dish_refuses_its_categorys_sizes(self):
        own = MenuSize.objects.create(
            menu_item=self.item, name="Individual", price_delta=Decimal("-100.00"),
        )
        self.assertEqual(self.item.resolve_size(self.large.id), own)

    # ── measurement ──────────────────────────────────────────────────────────

    def test_measurement_trims_the_trailing_zeros(self):
        self.assertEqual(self.large.measurement, "12 in")

    def test_measurement_is_none_without_both_halves(self):
        self.assertIsNone(
            MenuSize.objects.create(category=self.category, name="Familiar").measurement,
        )
        self.assertIsNone(
            MenuSize.objects.create(
                category=self.category, name="Chico", portion=Decimal("4"),
            ).measurement,
        )

    # ── the payload the storefront reads ─────────────────────────────────────

    def test_menu_item_payload_carries_the_effective_sizes(self):
        res = self.client.get(
            f"/api/catalog/menu-items/{self.item.pk}/", HTTP_X_WEBSITE_HOST="piccolo.test",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [s["name"] for s in res.json()["sizes"]], ["Chica", "Mediana", "Grande"],
        )
        self.assertTrue(res.json()["sizes_enabled"])

    def test_category_payload_carries_its_own_sizes(self):
        res = self.client.get(
            f"/api/catalog/menu-categories/{self.category.pk}/",
            HTTP_X_WEBSITE_HOST="piccolo.test",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["sizes"]), 3)


class MenuSizeEndpointTests(TestCase):
    """The two CRUD surfaces, which share one implementation - so the tests that
    matter are the ones about *which* owner a row lands under."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="piccolo.test")
        self.category = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="ep-pizzas",
        )
        self.item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Margarita",
            slug="ep-margarita", price=Decimal("200.00"),
        )
        self.admin = User.objects.create_user("chef", password="pw")
        self.admin.profile.system = self.system
        self.admin.profile.is_admin = True
        self.admin.profile.save()

    def _login(self):
        self.client.force_login(self.admin)

    def test_create_on_a_category(self):
        self._login()
        res = self.client.post(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/",
            {"name": "Chica", "portion": "4", "unit": "in", "price_delta": "-40.00"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        size = MenuSize.objects.get(pk=res.json()["id"])
        self.assertEqual(size.category_id, self.category.pk)
        self.assertIsNone(size.menu_item_id)
        self.assertEqual(size.system_id, self.system.pk)

    def test_create_on_a_menu_item(self):
        self._login()
        res = self.client.post(
            f"/api/catalog/menu-items/{self.item.pk}/sizes/",
            {"name": "Individual"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        size = MenuSize.objects.get(pk=res.json()["id"])
        self.assertEqual(size.menu_item_id, self.item.pk)
        self.assertIsNone(size.category_id)

    def test_an_item_size_is_not_reachable_through_its_category(self):
        # The detail views scope by the owner in the URL, so a size id lifted from
        # one owner is a 404 on the other rather than an edit.
        size = MenuSize.objects.create(menu_item=self.item, name="Individual")
        self._login()
        res = self.client.patch(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/{size.pk}/",
            {"name": "Hijacked"}, content_type="application/json",
        )
        self.assertEqual(res.status_code, 404)

    def test_flagging_a_default_clears_its_siblings(self):
        first = MenuSize.objects.create(
            category=self.category, name="Chica", is_default=True,
        )
        second = MenuSize.objects.create(category=self.category, name="Grande")
        self._login()
        res = self.client.patch(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/{second.pk}/",
            {"is_default": True}, content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        first.refresh_from_db()
        self.assertFalse(first.is_default)
        self.assertTrue(MenuSize.objects.get(pk=second.pk).is_default)

    def test_a_default_on_one_owner_does_not_clear_the_others(self):
        category_default = MenuSize.objects.create(
            category=self.category, name="Mediana", is_default=True,
        )
        self._login()
        self.client.post(
            f"/api/catalog/menu-items/{self.item.pk}/sizes/",
            {"name": "Individual", "is_default": True},
            content_type="application/json",
        )
        category_default.refresh_from_db()
        self.assertTrue(category_default.is_default)

    def test_writes_require_an_admin(self):
        res = self.client.post(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/",
            {"name": "Chica"}, content_type="application/json",
        )
        self.assertIn(res.status_code, (401, 403))

    def test_a_size_write_invalidates_the_menu_item_payload(self):
        url = f"/api/catalog/menu-items/{self.item.pk}/"
        self.client.get(url, HTTP_X_WEBSITE_HOST="piccolo.test")
        self._login()
        self.client.post(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/",
            {"name": "Grande", "price_delta": "40.00"},
            content_type="application/json",
        )
        self.client.logout()
        res = self.client.get(url, HTTP_X_WEBSITE_HOST="piccolo.test")
        self.assertEqual([s["name"] for s in res.json()["sizes"]], ["Grande"])

    def test_disabled_rows_are_hidden_from_the_public_list(self):
        MenuSize.objects.create(category=self.category, name="Chica", enabled=False)
        res = self.client.get(f"/api/catalog/menu-categories/{self.category.pk}/sizes/")
        self.assertEqual(res.json(), [])
        self._login()
        res = self.client.get(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/?include_disabled=true",
        )
        self.assertEqual(len(res.json()), 1)
