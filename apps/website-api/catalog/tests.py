import base64

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.test import TestCase

from decimal import Decimal

from core.models import Brand, System

from .models import (
    Product, ProductImage, MenuItem, MenuItemIngredient,
    MenuItemIngredientOption, Ingredient, RecipeStep, normalize_selection,
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


class MenuItemKindTests(TestCase):
    """`kind` is what separates a drink from a dish without a second model, and
    what the storefront filters a bar/drinks list on - so the default, the
    round-trip and the ?kind= filter are pinned here.

    The filter is deliberately single-valued: `_list_key` builds the cache key
    from `query_params.items()`, which yields only the LAST value of a repeated
    key, so a repeatable ?kind= would let two different filter combinations
    share one cache entry.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Bar", host="bar.test")
        self.dish = MenuItem.objects.create(
            system=self.system, name="Taco", slug="k-taco", price=Decimal("8.00"),
        )
        self.drink = MenuItem.objects.create(
            system=self.system, name="Michelada", slug="k-michelada",
            price=Decimal("6.00"), kind="drink",
        )
        self.dessert = MenuItem.objects.create(
            system=self.system, name="Flan", slug="k-flan",
            price=Decimal("4.00"), kind="dessert",
        )
        self.url = f"/api/catalog/menu-items/?system={self.system.id}"

    def _names(self, response):
        return sorted(row["name"] for row in response.json())

    def test_default_is_food(self):
        self.assertEqual(self.dish.kind, "food")

    def test_public_read_exposes_kind(self):
        rows = {r["name"]: r["kind"] for r in self.client.get(self.url).json()}
        self.assertEqual(rows["Michelada"], "drink")
        self.assertEqual(rows["Taco"], "food")

    def test_filter_returns_only_that_kind(self):
        response = self.client.get(f"{self.url}&kind=drink")
        self.assertEqual(self._names(response), ["Michelada"])

    def test_unfiltered_list_returns_every_kind(self):
        self.assertEqual(
            self._names(self.client.get(self.url)), ["Flan", "Michelada", "Taco"]
        )

    def test_bogus_kind_is_ignored_rather_than_emptying_the_menu(self):
        # An unknown value must not silently filter the whole menu away, which
        # is what `qs.filter(kind=<junk>)` would do.
        response = self.client.get(f"{self.url}&kind=beverage")
        self.assertEqual(self._names(response), ["Flan", "Michelada", "Taco"])

    def test_filtered_and_unfiltered_lists_do_not_share_a_cache_entry(self):
        self.assertEqual(self._names(self.client.get(f"{self.url}&kind=drink")),
                         ["Michelada"])
        self.assertEqual(
            self._names(self.client.get(self.url)), ["Flan", "Michelada", "Taco"]
        )

    def test_system_payload_counts_every_kind(self):
        # The navbar decides which per-kind links to render from this one field,
        # so every choice must be present - a kind the tenant has none of has to
        # come back as 0 rather than be missing.
        counts = self.client.get(
            "/api/system/", HTTP_X_WEBSITE_HOST="bar.test"
        ).json()["menu_item_kind_counts"]
        self.assertEqual(
            counts,
            {"food": 1, "drink": 1, "dessert": 1, "side": 0, "appetizer": 0},
        )

    def test_system_payload_ignores_disabled_items(self):
        self.drink.enabled = False
        self.drink.save()
        cache.clear()
        counts = self.client.get(
            "/api/system/", HTTP_X_WEBSITE_HOST="bar.test"
        ).json()["menu_item_kind_counts"]
        self.assertEqual(counts["drink"], 0)


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
            system=self.system, name="Burrito", slug="burrito", price=Decimal("10.00"),
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
            system=self.system, name="Latte", slug="latte", price=Decimal("4.00"),
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
            system=self.system, name="Latte", slug="latte", price=Decimal("4.00"),
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
            system=self.system, name="Latte", slug="latte", price=Decimal("4.00"),
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
