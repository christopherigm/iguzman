"""Catalog tests - deliberately few.

One test per subsystem, merging what used to be a case per assertion. What is
kept at full fidelity is the **tenant boundary** and the **pricing arithmetic**,
because both are money. See `CLAUDE.md` -> "Tests - keep the suite small" before
adding to this file.
"""

import base64

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from decimal import Decimal

from core.models import Branch, Brand, System

from .test_helpers import a_product_category, a_service_category
from .models import (
    CatalogRecommendation, Product, ProductCategory, ProductImage, MenuCategory,
    MenuItem, MenuItemIngredient, MenuItemIngredientOption, MenuSize, Ingredient,
    RecipeStep, Service,
    normalize_selection,
)


def admin_client(test, system, username="admin", is_admin=True):
    """A logged-in client. The profile already exists (post_save signal on User
    creates it), so that row is updated rather than a second one added."""
    user = User.objects.create_user(username, password="x")
    user.profile.system = system
    user.profile.is_admin = is_admin
    user.profile.save()
    client = test.client_class()
    client.force_login(user)
    return client


class CatalogListTests(TestCase):
    """The public list endpoints, and the one flag that must never leak.

    `?include_disabled=true` is how the CMS sees unfinished content. These are
    `AllowAny` GETs that also feed the customer-facing site, so the cache key has
    to be derived from the *resolved* flag rather than the raw param - otherwise
    an anonymous caller replaying the admin's URL is served the admin's entry.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Live", slug="live", enabled=True,
        )
        Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Draft", slug="draft", enabled=False,
        )
        self.url = f"/api/catalog/products/?system={self.system.id}"

    def _names(self, response):
        return sorted(row["name"] for row in response.json())

    def test_only_an_admin_may_opt_into_disabled_rows(self):
        opted = f"{self.url}&include_disabled=true"

        # Warm the public entry first, then confirm it does not starve the admin.
        self.assertEqual(self._names(self.client.get(self.url)), ["Live"])
        self.assertEqual(self._names(self.client.get(opted)), ["Live"])
        self.assertEqual(
            self._names(admin_client(self, self.system).get(opted)), ["Draft", "Live"],
        )
        # And the reverse order: a warm admin entry must not reach the public.
        self.assertEqual(self._names(self.client.get(opted)), ["Live"])
        # A signed-in non-admin is still the public.
        member = admin_client(self, self.system, username="member", is_admin=False)
        self.assertEqual(self._names(member.get(opted)), ["Live"])

    def test_a_write_is_visible_in_the_next_list_read(self):
        """These run on LocMemCache (no REDIS_URL), which has no
        `delete_pattern()`: the invalidation helper used to no-op there, so the
        admin list served pre-write data for the whole TTL and a toggle looked
        like a lost write.
        """
        client = admin_client(self, self.system)
        brand = Brand.objects.create(
            system=self.system, name="Acme", slug="acme", enabled=True,
        )
        product = Product.objects.get(slug="live")

        for list_url, detail_url in (
            (f"{self.url}&include_disabled=true", f"/api/catalog/products/{product.id}/"),
            (
                f"/api/brands/?system={self.system.id}&include_disabled=true",
                f"/api/brands/{brand.id}/",
            ),
        ):
            enabled = [row["enabled"] for row in client.get(list_url).json()]
            self.assertIn(True, enabled)  # warm the cache

            res = client.patch(
                detail_url, {"enabled": False}, content_type="application/json",
            )
            self.assertEqual(res.status_code, 200, res.content)

            self.assertNotIn(
                True, [row["enabled"] for row in client.get(list_url).json()], list_url,
            )


class MenuItemCategoryTests(TestCase):
    """The tenant's own `MenuCategory` is the *only* sectioning a menu has, and
    it is required - it groups the menu page, fills the navbar's Menu dropdown
    and is the first segment of every item's URL (`/menu/<category>/<slug>`).

    It replaced a structural `kind` enum that sat alongside it and could only
    ever be a second, disagreeing sectioning of one menu.
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
        MenuItem.objects.create(
            system=self.system, category=self.dishes, name="Flan",
            slug="k-flan", price=Decimal("4.00"),
        )
        self.url = f"/api/catalog/menu-items/?system={self.system.id}"

    def _names(self, response):
        return sorted(row["name"] for row in response.json())

    def test_the_category_is_required_cascades_and_rides_every_payload(self):
        from .serializers import MenuItemWriteSerializer

        rows = {r["name"]: r for r in self.client.get(self.url).json()}
        # `category_slug` is the first segment of the detail URL, so a card
        # cannot link anywhere without it.
        self.assertEqual(rows["Michelada"]["category_slug"], "k-bebidas")
        self.assertEqual(rows["Michelada"]["category_name"], "Bebidas")

        # A variant thumbnail links to the *sibling's* own URL, whose first
        # segment is the sibling's category - nothing stops the CMS from pairing
        # across categories, which is exactly when assuming would 404.
        self.dish.variants.add(self.drink)
        cache.clear()
        rows = {r["name"]: r for r in self.client.get(self.url).json()}
        self.assertEqual(
            {v["slug"]: v["category_slug"] for v in rows["Taco"]["variants"]},
            {"k-michelada": "k-bebidas"},
        )

        # Optional on Product and Service, required here: an uncategorized item
        # has no section to appear in and no URL to live at.
        serializer = MenuItemWriteSerializer(data={
            "system": self.system.id, "slug": "k-orphan",
            "name": "Orphan", "price": "5.00",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("category", serializer.errors)

        # CASCADE, not PROTECT - there is no "no category" state to fall back to,
        # which makes a category delete far more destructive than a product one.
        self.drinks.delete()
        self.assertFalse(MenuItem.objects.filter(pk=self.drink.pk).exists())
        self.assertTrue(MenuItem.objects.filter(pk=self.dish.pk).exists())

    def test_the_filter_and_the_system_counts_follow_a_write(self):
        """The System payload is cached for an hour and carries counts of models
        it does not own, so every read here happens *before* the write - a cold
        cache passes without the signals and fails in production, which is how a
        menu item write left the navbar without a Menu link for an hour.
        """
        cache.clear()
        filtered = f"{self.url}&category={self.drinks.id}"
        self.assertEqual(self._names(self.client.get(filtered)), ["Michelada"])
        # A filtered and an unfiltered list must not share a cache entry.
        self.assertEqual(
            self._names(self.client.get(self.url)), ["Flan", "Michelada", "Taco"],
        )

        def payload():
            return self.client.get(
                "/api/system/", HTTP_X_WEBSITE_HOST="bar.test",
            ).json()

        self.assertEqual(payload()["menu_item_count"], 3)

        # Nothing but `enabled` moves, so no other write path would notice.
        self.drink.enabled = False
        self.drink.save()
        self.assertEqual(payload()["menu_item_count"], 2)

        self.drink.delete()
        self.assertEqual(payload()["menu_item_count"], 2)

        # Same class of bug, same fix: these drive the Products/Services links,
        # and `branch_count` decides whether Contact renders at all.
        self.assertEqual(payload()["product_count"], 0)
        Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Mug", slug="inv-mug", price=Decimal("9.00"),
        )
        self.assertEqual(payload()["product_count"], 1)

        self.assertEqual(payload()["service_count"], 0)
        Service.objects.create(
            category=a_service_category(self.system),
            system=self.system, name="Catering", slug="inv-catering",
            price=Decimal("99.00"),
        )
        self.assertEqual(payload()["service_count"], 1)

        self.assertEqual(payload()["branch_count"], 0)
        Branch.objects.create(system=self.system, name="Centro")
        self.assertEqual(payload()["branch_count"], 1)


class MenuItemPricingTests(TestCase):
    """The base-price + add-on-delta arithmetic: the money path for menu items,
    called by the cart, checkout, the till and the storefront alike."""

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

        def ingredient(name, unit="g"):
            return Ingredient.objects.create(
                system=self.system, name=name, slug=name.lower(), unit=unit,
            )

        # Included by default: free and locked into the dish (part of the base).
        self.tortilla = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=ingredient("Tortilla", "pc"),
            price=Decimal("0.00"), is_removable=False, max_quantity=1,
        )
        # Two optional add-ons, charged per selected unit.
        self.pork = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=ingredient("Pork"),
            price=Decimal("3.00"), is_removable=True, max_quantity=2,
        )
        self.cheese = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=ingredient("Cheese"),
            price=Decimal("1.50"), is_removable=True, max_quantity=2,
        )

    def _price(self, selection):
        return self.item.price_for_selection(selection)

    def test_add_ons_are_charged_per_unit_over_the_base(self):
        self.assertEqual(self._price([]), Decimal("8.00"))
        self.assertEqual(
            self._price([{"ingredient": self.pork.id, "quantity": 2}]), Decimal("14.00"),
        )
        self.assertEqual(
            self._price([
                {"ingredient": self.pork.id, "quantity": 1},    # +3.00
                {"ingredient": self.cheese.id, "quantity": 1},  # +1.50
            ]),
            Decimal("12.50"),
        )

        # Removing an included ingredient does not refund - it was never priced.
        removed = normalize_selection(
            [{"ingredient": self.tortilla.id, "quantity": 0}],
            self.item.ingredients.all(),
        )
        self.assertEqual(removed, [{"ingredient": self.tortilla.id, "quantity": 0}])
        self.assertEqual(self._price(removed), Decimal("8.00"))

        # A free portion is baked into the base; only the units past it are charged.
        self.cheese.number_of_free_portions = 1
        self.cheese.save()
        self.assertEqual(
            self._price([{"ingredient": self.cheese.id, "quantity": 1}]), Decimal("8.00"),
        )
        self.assertEqual(
            self._price([{"ingredient": self.cheese.id, "quantity": 2}]), Decimal("9.50"),
        )

        # A pre-selected default is priced even when the customer never touches
        # it, and removing it down to zero refunds its up-charge.
        self.pork.default_quantity = 1
        self.pork.save()
        self.assertEqual(self._price([]), Decimal("11.00"))
        untouched = normalize_selection(
            [{"ingredient": self.pork.id, "quantity": 1}], self.item.ingredients.all(),
        )
        self.assertEqual(untouched, [])
        self.assertEqual(self._price(untouched), Decimal("11.00"))
        dropped = normalize_selection(
            [{"ingredient": self.pork.id, "quantity": 0}], self.item.ingredients.all(),
        )
        self.assertEqual(self._price(dropped), Decimal("8.00"))

    def test_a_selection_is_clamped_and_never_reaches_another_dishs_rows(self):
        self.assertEqual(
            normalize_selection(
                [
                    {"ingredient": self.cheese.id, "quantity": 99},  # clamped to 2
                    {"ingredient": self.pork.id, "quantity": 0},     # a no-op, dropped
                    {"ingredient": 999999, "quantity": 5},           # unknown, dropped
                ],
                self.item.ingredients.all(),
            ),
            [{"ingredient": self.cheese.id, "quantity": 2}],
        )

        # An internal (kitchen-only) row never affects the customer's total, even
        # when it carries an up-charge and is named in a selection.
        oil = MenuItemIngredient.objects.create(
            menu_item=self.item,
            ingredient=Ingredient.objects.create(
                system=self.system, name="Oil", slug="oil", unit="ml",
            ),
            price=Decimal("5.00"), is_removable=True, max_quantity=3, is_internal=True,
        )
        self.assertEqual(
            self._price([{"ingredient": oil.id, "quantity": 3}]), Decimal("8.00"),
        )
        self.assertEqual(
            normalize_selection(
                [{"ingredient": oil.id, "quantity": 3}], self.item.ingredients.all(),
            ),
            [],
        )

        # And a row belonging to a different dish is not priced here.
        other = MenuItem.objects.create(
            system=self.system, category=self.category, name="Burrito",
            slug="burrito", price=Decimal("10.00"),
        )
        foreign = MenuItemIngredient.objects.create(
            menu_item=other,
            ingredient=Ingredient.objects.create(
                system=self.system, name="Rice", slug="rice", unit="g",
            ),
            price=Decimal("2.00"), is_removable=True,
        )
        self.assertEqual(
            self._price([{"ingredient": foreign.id, "quantity": 1}]), Decimal("8.00"),
        )

    def test_a_choice_group_charges_its_options_delta_over_the_free_unit(self):
        """Single-select groups: a default ingredient swappable for a priced
        alternative (Sweetener -> Organic sugar / Splenda)."""
        refined = Ingredient.objects.create(
            system=self.system, name="Refined sugar", slug="refined", unit="g",
        )
        organic = Ingredient.objects.create(
            system=self.system, name="Organic sugar", slug="organic", unit="g",
        )
        splenda = Ingredient.objects.create(
            system=self.system, name="Splenda", slug="splenda", unit="g",
        )
        sweetener = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=refined, price=Decimal("0.00"),
            is_removable=True, max_quantity=2, default_quantity=1,
            number_of_free_portions=1,
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=sweetener, ingredient=organic,
            price=Decimal("0.50"), sort_order=0,
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=sweetener, ingredient=splenda,
            price=Decimal("0.25"), sort_order=1,
        )

        self.assertEqual(self._price([]), Decimal("8.00"))
        # The premium delta is charged even though the unit itself is "included".
        self.assertEqual(
            self._price([
                {"ingredient": sweetener.id, "quantity": 1, "option": organic.id},
            ]),
            Decimal("8.50"),
        )
        self.assertEqual(
            self._price([
                {"ingredient": sweetener.id, "quantity": 2, "option": organic.id},
            ]),
            Decimal("9.00"),
        )

        rows = self.item.ingredients.all()
        # A non-default option is recorded even at the default quantity...
        self.assertEqual(
            normalize_selection(
                [{"ingredient": sweetener.id, "quantity": 1, "option": splenda.id}], rows,
            ),
            [{"ingredient": sweetener.id, "quantity": 1, "option": splenda.id}],
        )
        # ...while the default option at the default quantity is a no-op, and a
        # bogus id is dropped and priced as the default rather than crashing.
        for option in (refined.id, 999999):
            self.assertEqual(
                normalize_selection(
                    [{"ingredient": sweetener.id, "quantity": 1, "option": option}], rows,
                ),
                [],
            )
        self.assertEqual(
            self._price([
                {"ingredient": sweetener.id, "quantity": 1, "option": 999999},
            ]),
            Decimal("8.00"),
        )


class IngredientTests(TestCase):
    """The reusable Ingredient catalog: nutrition stored per basis and scaled to
    the portion, public to read and admin to write."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Bakery", host="bakery.test")
        self.butter = Ingredient.objects.create(
            system=self.system, name="Butter", slug="butter", unit="g",
            nutrition_basis_quantity=Decimal("100"), calories=Decimal("717"),
            total_fat=Decimal("81"),
        )
        self.item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Panes", slug="bread-panes",
            ),
            name="Bread", slug="bread", price=Decimal("5.00"),
        )
        self.host = {"HTTP_X_WEBSITE_HOST": "bakery.test"}

    def test_nutrition_scales_to_the_portion_and_rides_the_public_read(self):
        from .units import convert_quantity

        # `convert_quantity` only bridges units within one physical dimension.
        self.assertEqual(convert_quantity(2000, "g", "kg"), Decimal("2"))
        self.assertEqual(convert_quantity(1, "l", "ml"), Decimal("1000"))
        self.assertEqual(convert_quantity(3, "pc", "pc"), Decimal("3"))
        self.assertIsNone(convert_quantity(1, "g", "ml"))      # mass vs volume
        self.assertIsNone(convert_quantity(1, "pc", "slice"))  # two count units
        self.assertIsNone(convert_quantity(1, "g", None))      # missing unit

        row = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.butter,
            quantity=Decimal("20"), unit="g",
        )
        self.assertEqual(row.calories, 143)  # round(717 * 20/100)
        self.assertEqual(row.nutrient("total_fat"), Decimal("16.2"))

        orange = Ingredient.objects.create(
            system=self.system, name="Orange", slug="orange", unit="pc",
            nutrition_basis_quantity=Decimal("1"), calories=Decimal("62"),
        )
        self.assertEqual(
            MenuItemIngredient.objects.create(
                menu_item=self.item, ingredient=orange,
                quantity=Decimal("2"), unit="pc",
            ).calories,
            124,
        )
        # Butter's basis is grams; a portion counted in pieces cannot be scaled.
        self.assertIsNone(
            MenuItemIngredient.objects.create(
                menu_item=self.item, ingredient=self.butter,
                quantity=Decimal("2"), unit="pc",
            ).calories
        )

        served = self.client.get(f"/api/catalog/menu-items/{self.item.id}/").json()
        butter_row = next(i for i in served["ingredients"] if i["name"] == "Butter")
        self.assertEqual(butter_row["calories"], 143)
        self.assertEqual(butter_row["ingredient"], self.butter.id)

    def test_the_catalog_is_public_read_admin_write_and_held_while_in_use(self):
        listed = self.client.get("/api/catalog/ingredients/", **self.host)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)

        client = admin_client(self, self.system, username="chef")
        created = client.post(
            "/api/catalog/ingredients/",
            data={
                "system": self.system.id, "name": "Sugar", "slug": "sugar",
                "unit": "g", "nutrition_basis_quantity": "100", "calories": "387",
            },
            content_type="application/json", **self.host,
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(Ingredient.objects.get(slug="sugar").calories, Decimal("387"))

        MenuItemIngredient.objects.create(menu_item=self.item, ingredient=self.butter)
        blocked = client.delete(f"/api/catalog/ingredients/{self.butter.id}/", **self.host)
        self.assertEqual(blocked.status_code, 409)
        self.assertTrue(Ingredient.objects.filter(pk=self.butter.id).exists())

    def test_an_image_picked_from_a_bank_keeps_its_credit_and_an_upload_drops_it(self):
        """The CMS image picker sends a stock photo with the credit its bank's
        API terms require, and `save_to_field` clears any stored credit on every
        upload - so the credit has to be applied *after* the file, or the footer
        thanks nobody for a photo that is on the page. The mirror case matters
        just as much: a customer's own photograph must not stay credited to a
        stranger."""
        client = admin_client(self, self.system, username="chef")
        png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
            "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )

        created = client.post(
            "/api/catalog/ingredients/",
            data={
                "system": self.system.id, "name": "Lemon", "slug": "lemon",
                "unit": "pc", "nutrition_basis_quantity": "1",
                "image": png,
                "attribution": "Photo by P on Pexels",
                "attribution_url": "https://www.pexels.com/photo/7/",
            },
            content_type="application/json", **self.host,
        )
        self.assertEqual(created.status_code, 201, created.content)
        lemon = Ingredient.objects.get(slug="lemon")
        self.assertTrue(lemon.image)
        self.assertEqual(lemon.attribution, "Photo by P on Pexels")
        self.assertEqual(lemon.attribution_url, "https://www.pexels.com/photo/7/")

        # An edit that does not touch the image leaves the credit alone.
        client.patch(
            f"/api/catalog/ingredients/{lemon.id}/",
            data={"name": "Lemon (organic)"},
            content_type="application/json", **self.host,
        )
        lemon.refresh_from_db()
        self.assertEqual(lemon.attribution, "Photo by P on Pexels")

        # The operator's own photograph, uploaded over it, owes nobody.
        client.patch(
            f"/api/catalog/ingredients/{lemon.id}/",
            data={"image": png},
            content_type="application/json", **self.host,
        )
        lemon.refresh_from_db()
        self.assertEqual(lemon.attribution, "")
        self.assertEqual(lemon.attribution_url, "")

    def test_a_blocked_delete_names_its_usages_and_is_resolved_by_a_mode(self):
        """The 409 says *what* is holding the ingredient down, and re-issuing the
        delete with a mode is the admin's answer: `detach` keeps the dishes,
        `groups` takes the whole choice group with it."""
        client = admin_client(self, self.system, username="chef")
        margarine = Ingredient.objects.create(
            system=self.system, name="Margarine", slug="margarine", unit="g",
        )
        lard = Ingredient.objects.create(
            system=self.system, name="Lard", slug="lard", unit="g",
        )

        plain = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.butter,
        )
        led = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=self.butter,
            group_name="Fat", price=Decimal("2.00"),
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=led, ingredient=margarine, price=Decimal("3.00"),
        )
        joined = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=lard, group_name="Spread",
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=joined, ingredient=self.butter,
        )

        body = client.delete(
            f"/api/catalog/ingredients/{self.butter.id}/", **self.host,
        ).json()
        self.assertEqual(body["code"], "INGREDIENT_IN_USE")
        self.assertEqual(
            sorted(u["role"] for u in body["usages"]),
            ["group_default", "group_option", "plain"],
        )
        default = next(u for u in body["usages"] if u["role"] == "group_default")
        self.assertTrue(default["can_promote"])
        self.assertEqual(default["group_name"], "Fat")

        # An unknown mode is refused rather than quietly read as "no mode" - that
        # would delete on a typo the caller meant as an instruction.
        self.assertEqual(
            client.delete(
                f"/api/catalog/ingredients/{self.butter.id}/?mode=nope", **self.host,
            ).status_code,
            400,
        )

        # detach: the plain row and the alternative go; the group the ingredient
        # led survives by promoting margarine, which brings its own price with it.
        detached = client.delete(
            f"/api/catalog/ingredients/{self.butter.id}/?mode=detach", **self.host,
        )
        self.assertEqual(detached.status_code, 204, detached.content)
        self.assertFalse(Ingredient.objects.filter(pk=self.butter.id).exists())
        self.assertFalse(MenuItemIngredient.objects.filter(pk=plain.id).exists())
        led.refresh_from_db()
        self.assertEqual(led.ingredient_id, margarine.id)
        self.assertEqual(led.price, Decimal("3.00"))
        self.assertEqual(led.options.count(), 0)
        self.assertEqual(joined.options.count(), 0)
        # The alternatives point at shared catalog records, which are untouched.
        self.assertTrue(Ingredient.objects.filter(pk=margarine.id).exists())

        # groups: every row referencing the ingredient goes, whole - as its
        # default here, and it is the only ingredient `joined` has left.
        also_lard = MenuItemIngredient.objects.create(
            menu_item=self.item, ingredient=lard, group_name="Fat",
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=also_lard, ingredient=margarine,
        )
        removed = client.delete(
            f"/api/catalog/ingredients/{lard.id}/?mode=groups", **self.host,
        )
        self.assertEqual(removed.status_code, 204, removed.content)
        self.assertFalse(
            MenuItemIngredient.objects.filter(
                pk__in=[also_lard.id, joined.id]
            ).exists()
        )
        self.assertTrue(Ingredient.objects.filter(pk=margarine.id).exists())


class CloneTests(TestCase):
    """The CMS "Clone" button, which is a deep copy - not a second row pointing
    at the first one's children and files."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Deli", host="deli.test")
        self.client_ = admin_client(self, self.system, username="owner")

    def _image(self, name="pic.png"):
        """A 1x1 PNG, small enough that the resize pipeline leaves it alone."""
        raw = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
            "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        return SimpleUploadedFile(name, raw, content_type="image/png")

    def _clone(self, path, client=None, **body):
        payload = {"name": "Copy", "en_name": "Copy EN"}
        payload.update(body)
        return (client or self.client_).post(
            path, data=payload, content_type="application/json",
            HTTP_X_WEBSITE_HOST="deli.test",
        )

    def test_a_product_clone_is_a_deep_copy_with_its_own_files(self):
        product = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Mug", slug="mug", sku="MUG-1",
            price=Decimal("12.00"), image=self._image(),
        )
        gallery = ProductImage.objects.create(product=product, image=self._image("g.png"))
        sibling = Product.objects.create(category=a_product_category(self.system), system=self.system, name="Mug XL", slug="mug-xl")
        product.variants.add(sibling)
        url = f"/api/catalog/products/{product.id}/clone/"

        # Anonymous, and a blank name, both write nothing.
        self.assertIn(self._clone(url, client=self.client_class()).status_code, (401, 403))
        self.assertEqual(self._clone(url, name="  ").status_code, 400)
        self.assertEqual(Product.objects.count(), 2)

        res = self._clone(url)
        self.assertEqual(res.status_code, 201, res.content)
        clone = Product.objects.get(pk=res.json()["id"])
        self.assertEqual(clone.name, "Copy")
        self.assertEqual(clone.en_name, "Copy EN")
        self.assertEqual(clone.price, Decimal("12.00"))
        # `sku` is unique=True - a copied one would collide.
        self.assertIsNone(clone.sku)
        self.assertEqual(clone.slug, f"{self.system.id}-copy")

        # Its own files, really written: deleting one must not blank the other.
        self.assertNotEqual(clone.image.name, product.image.name)
        self.assertTrue(default_storage.exists(clone.image.name))
        clone_gallery = clone.images.get()
        self.assertNotEqual(clone_gallery.image.name, gallery.image.name)
        self.assertTrue(default_storage.exists(clone_gallery.image.name))

        # Siblings are standalone products, so the family is linked, not copied -
        # and a copy is not automatically an alternative version of its original.
        self.assertEqual(list(clone.variants.all()), [sibling])
        self.assertNotIn(product, clone.variants.all())

        # Cloning the same name twice still yields unique slugs.
        second = self._clone(url)
        self.assertEqual(second.status_code, 201, second.content)
        self.assertNotEqual(res.json()["slug"], second.json()["slug"])

    def test_a_menu_item_clone_copies_its_rows_and_prices_off_them(self):
        item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="latte-bebidas",
            ),
            name="Latte", slug="latte", price=Decimal("4.00"),
        )
        sugar = Ingredient.objects.create(
            system=self.system, name="Sugar", slug="sugar", unit="g",
        )
        splenda = Ingredient.objects.create(
            system=self.system, name="Splenda", slug="splenda", unit="g",
        )
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

        res = self._clone(f"/api/catalog/menu-items/{item.id}/clone/")
        self.assertEqual(res.status_code, 201, res.content)
        clone = MenuItem.objects.get(pk=res.json()["id"])

        clone_row = clone.ingredients.get()
        self.assertNotEqual(clone_row.id, row.id)
        self.assertEqual(clone_row.group_name, "Sweetener")
        # The shared Ingredient catalog is referenced, never duplicated.
        self.assertEqual(clone_row.ingredient_id, sugar.id)
        self.assertEqual(Ingredient.objects.count(), 2)
        self.assertEqual(clone_row.options.get().ingredient_id, splenda.id)

        clone_step = clone.recipe_steps.get()
        self.assertEqual(clone_step.instruction, "Steam the milk")
        self.assertTrue(default_storage.exists(clone_step.image.name))
        self.assertNotIn(item, clone.variants.all())

        # ⚠ Pricing must run on the *clone's* ingredient ids - otherwise a
        # customised order on the copy prices as base.
        self.assertEqual(
            clone.price_for_selection([{"ingredient": clone_row.id, "quantity": 2}]),
            Decimal("5.00"),
        )


class ServiceSlugReadTests(TestCase):
    """`?slug=` on the services *list* endpoint is the storefront's detail read.

    `getService(slug)` has no other route to a single service, so this query has
    to answer with everything a detail page needs. Served with the list
    serializer it silently omitted the party bounds, and the booking page's
    counter - gated on `max > min` - never rendered while its heading priced a
    party of `NaN`.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Tours", host="tours.test")
        Branch.objects.create(system=self.system, name="Marina", booking_capacity=4)
        Service.objects.create(
            category=a_service_category(self.system),
            system=self.system, name="Boat tour", slug="boat-tour",
            price=Decimal("500.00"), duration=120,
            booking_enabled=True, booking_party_enabled=True,
            booking_party_min=2, booking_party_max=12,
        )

    def test_the_slug_read_carries_the_party_bounds_the_grid_does_not(self):
        detail = self.client.get(
            "/api/catalog/services/?slug=boat-tour", HTTP_X_WEBSITE_HOST="tours.test",
        ).json()[0]
        self.assertEqual(detail["booking_party_min"], 2)
        self.assertEqual(detail["booking_party_max"], 12)
        # The ceiling is min(what the service allows, what one resource holds) -
        # here the branch's implicit four-seat resource, not the service's 12.
        self.assertEqual(detail["booking_party_limit"], 4)

        # The split exists to keep that walk over pools and resources off a
        # catalog grid, so an unfiltered list must not grow it.
        grid = self.client.get(
            "/api/catalog/services/", HTTP_X_WEBSITE_HOST="tours.test",
        ).json()[0]
        self.assertIn("booking_party_enabled", grid)
        self.assertNotIn("booking_party_limit", grid)
        self.assertNotIn("booking_party_min", grid)


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

    def test_the_effective_list_inherits_overrides_or_switches_off(self):
        self.assertEqual(
            [s.name for s in self.item.effective_sizes], ["Chica", "Mediana", "Grande"],
        )
        self.assertEqual(self.item.default_size, self.medium)
        # `system` is derived from the owner, never authored: it scopes the row
        # for backup and decides which R2 bucket its image is written to.
        self.assertEqual(self.small.system_id, self.system.pk)

        # The default falls back to the first in display order when nobody set
        # the flag, and a disabled row never reaches a customer.
        self.medium.is_default = False
        self.medium.save()
        self.assertEqual(self.item.default_size, self.small)
        self.large.enabled = False
        self.large.save()
        self.assertEqual([s.name for s in self.item.effective_sizes], ["Chica", "Mediana"])

        # Own rows *replace* the category's entirely - the only rule that lets an
        # edge-case dish **drop** a size its category offers.
        own = MenuSize.objects.create(
            menu_item=self.item, name="Individual", price_delta=Decimal("0.00"),
        )
        self.assertEqual([s.name for s in self.item.effective_sizes], ["Individual"])
        self.assertEqual(own.system_id, self.system.pk)

        self.item.sizes_enabled = False
        self.item.save()
        self.assertEqual(self.item.effective_sizes, [])
        self.assertIsNone(self.item.default_size)
        self.assertEqual(self.item.price_for_selection([]), Decimal("200.00"))

    def test_a_size_shifts_the_base_price_and_nothing_else(self):
        self.assertEqual(self.item.price_for_selection([]), Decimal("200.00"))
        self.assertEqual(
            self.item.price_for_selection([], self.small), Decimal("160.00"),
        )
        self.assertEqual(
            self.item.price_for_selection([], self.large), Decimal("240.00"),
        )

        # ⚠ Size does not scale the ingredient up-charges. One pricing axis: a
        # multiplier would have to be applied identically here, in the storefront
        # customiser and in the till, and the first disagreement is a price on
        # screen that is not the price charged.
        cheese = MenuItemIngredient.objects.create(
            menu_item=self.item,
            ingredient=Ingredient.objects.create(
                system=self.system, name="Queso", slug="size-queso", unit="g",
            ),
            price=Decimal("25.00"), is_removable=True, max_quantity=2,
        )
        selection = [{"ingredient": cheese.id, "quantity": 1}]
        self.assertEqual(
            self.item.price_for_selection(selection, self.small), Decimal("185.00"),
        )
        self.assertEqual(
            self.item.price_for_selection(selection, self.large), Decimal("265.00"),
        )

        # A delta bigger than the base is a misconfiguration, not a refund.
        self.small.price_delta = Decimal("-500.00")
        self.small.save()
        self.assertEqual(
            self.item.price_for_selection([], self.small), Decimal("0.00"),
        )

    def test_resolve_size_never_trusts_an_id(self):
        """A size that is stale, forged, or belongs to another dish prices as the
        **default**, so a crafted request buys nothing."""
        self.assertEqual(self.item.resolve_size(None), self.medium)
        self.assertEqual(self.item.resolve_size(999999), self.medium)

        foreign = MenuSize.objects.create(
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="size-bebidas",
            ),
            name="Litro", price_delta=Decimal("500.00"),
        )
        self.assertEqual(self.item.resolve_size(foreign.id), self.medium)
        self.assertEqual(
            self.item.price_for_selection([], self.item.resolve_size(foreign.id)),
            Decimal("200.00"),
        )

        # An overriding dish refuses its own category's sizes too.
        own = MenuSize.objects.create(
            menu_item=self.item, name="Individual", price_delta=Decimal("-100.00"),
        )
        self.assertEqual(self.item.resolve_size(self.large.id), own)

    def test_measurement_prints_without_scientific_notation(self):
        # Decimal("10.00").normalize() is Decimal("1E+1"), which printed as
        # "1E+1 cm" on every size a tenant measured in round tens.
        self.assertEqual(self.large.measurement, "12 in")
        for portion, expected in (("10.00", "10 cm"), ("100.00", "100 cm"),
                                  ("12.50", "12.5 cm")):
            size = MenuSize.objects.create(
                category=self.category, name=f"S{portion}",
                portion=Decimal(portion), unit="cm",
            )
            self.assertEqual(size.measurement, expected)

        # Both halves or nothing.
        self.assertIsNone(
            MenuSize.objects.create(category=self.category, name="Familiar").measurement
        )
        self.assertIsNone(
            MenuSize.objects.create(
                category=self.category, name="Chico", portion=Decimal("4"),
            ).measurement
        )


class MenuSizeEndpointTests(TestCase):
    """The two CRUD surfaces share one implementation, so what matters is *which*
    owner a row lands under - and that a write reaches the public payload."""

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

    def test_a_size_is_created_under_the_owner_named_in_its_url(self):
        self.client.force_login(self.admin)

        on_category = self.client.post(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/",
            {"name": "Chica", "portion": "4", "unit": "in", "price_delta": "-40.00"},
            content_type="application/json",
        )
        self.assertEqual(on_category.status_code, 201, on_category.content)
        size = MenuSize.objects.get(pk=on_category.json()["id"])
        self.assertEqual(size.category_id, self.category.pk)
        self.assertIsNone(size.menu_item_id)
        self.assertEqual(size.system_id, self.system.pk)

        on_item = self.client.post(
            f"/api/catalog/menu-items/{self.item.pk}/sizes/",
            {"name": "Individual", "is_default": True}, content_type="application/json",
        )
        self.assertEqual(on_item.status_code, 201, on_item.content)
        own = MenuSize.objects.get(pk=on_item.json()["id"])
        self.assertEqual(own.menu_item_id, self.item.pk)
        self.assertIsNone(own.category_id)

        # The detail views scope by the owner in the URL, so a size id lifted
        # from one owner is a 404 on the other rather than an edit.
        self.assertEqual(
            self.client.patch(
                f"/api/catalog/menu-categories/{self.category.pk}/sizes/{own.pk}/",
                {"name": "Hijacked"}, content_type="application/json",
            ).status_code,
            404,
        )

        # Rows are PATCHed one at a time by the CMS editor, so flagging a default
        # has to clear its siblings - and only its siblings.
        grande = MenuSize.objects.create(category=self.category, name="Grande")
        res = self.client.patch(
            f"/api/catalog/menu-categories/{self.category.pk}/sizes/{grande.pk}/",
            {"is_default": True}, content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(MenuSize.objects.get(pk=size.pk).is_default)
        self.assertTrue(MenuSize.objects.get(pk=own.pk).is_default)

    def test_writes_need_an_admin_and_reach_the_public_payload(self):
        url = f"/api/catalog/menu-categories/{self.category.pk}/sizes/"
        self.assertIn(
            self.client.post(
                url, {"name": "Chica"}, content_type="application/json",
            ).status_code,
            (401, 403),
        )

        item_url = f"/api/catalog/menu-items/{self.item.pk}/"
        self.client.get(item_url, HTTP_X_WEBSITE_HOST="piccolo.test")  # warm it

        self.client.force_login(self.admin)
        self.client.post(
            url, {"name": "Grande", "price_delta": "40.00"},
            content_type="application/json",
        )
        self.client.logout()

        served = self.client.get(item_url, HTTP_X_WEBSITE_HOST="piccolo.test").json()
        self.assertEqual([s["name"] for s in served["sizes"]], ["Grande"])
        self.assertTrue(served["sizes_enabled"])
        category_payload = self.client.get(
            f"/api/catalog/menu-categories/{self.category.pk}/",
            HTTP_X_WEBSITE_HOST="piccolo.test",
        ).json()
        self.assertEqual([s["name"] for s in category_payload["sizes"]], ["Grande"])

        # Disabled rows are hidden from the public list but not from the CMS.
        MenuSize.objects.create(category=self.category, name="Retirada", enabled=False)
        self.assertEqual([s["name"] for s in self.client.get(url).json()], ["Grande"])
        self.client.force_login(self.admin)
        self.assertEqual(len(self.client.get(f"{url}?include_disabled=true").json()), 2)


class CatalogRecommendationTests(TestCase):
    """The resolution rules behind the cart's "don't forget these" strip.

    Inherit, override, and never offer the unbuyable - the three rules a tenant
    reasons about when it ticks a box in the CMS.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="rec-piccolo.test")
        self.other = System.objects.create(site_name="Otro", host="rec-otro.test")
        self.pizzas = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="rec-pizzas",
        )
        self.drinks = MenuCategory.objects.create(
            system=self.system, name="Bebidas", slug="rec-drinks",
        )
        self.margarita = MenuItem.objects.create(
            system=self.system, category=self.pizzas, name="Margarita",
            slug="rec-margarita", price=Decimal("200.00"),
        )
        self.pepperoni = MenuItem.objects.create(
            system=self.system, category=self.pizzas, name="Pepperoni",
            slug="rec-pepperoni", price=Decimal("220.00"),
        )
        self.coca = MenuItem.objects.create(
            system=self.system, category=self.drinks, name="Coca 355ml",
            slug="rec-coca", price=Decimal("30.00"),
        )
        self.agua = MenuItem.objects.create(
            system=self.system, category=self.drinks, name="Agua",
            slug="rec-agua", price=Decimal("20.00"),
        )

    def _recommend(self, target, **owner):
        return CatalogRecommendation.objects.create(
            recommended_menu_item=target, **owner
        )

    def _names(self, item):
        return [t.name for _, t in item.effective_recommendations]

    def test_the_list_inherits_overrides_and_is_ordered(self):
        self._recommend(self.agua, menu_category=self.pizzas, sort_order=1)
        row = self._recommend(self.coca, menu_category=self.pizzas, sort_order=0)

        # Authored once on the category, and every dish in it inherits.
        self.assertEqual(self._names(self.margarita), ["Coca 355ml", "Agua"])
        self.assertEqual(self._names(self.pepperoni), ["Coca 355ml", "Agua"])
        # `system` is derived from the source (six possible paths up to a tenant
        # cannot be the one `ModelSpec.scope`).
        self.assertEqual(row.system_id, self.system.id)

        # Own rows replace the category's entirely - the only way a dish can
        # *drop* what its category recommends.
        self._recommend(self.agua, menu_item=self.margarita)
        self.assertEqual(self._names(self.margarita), ["Agua"])
        self.assertEqual(self._names(self.pepperoni), ["Coca 355ml", "Agua"])

        # Cross-family: a dish may recommend a Product, and a product category is
        # just as valid a source.
        product = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Mug", slug="rec-mug", price=Decimal("120.00"),
        )
        CatalogRecommendation.objects.create(
            menu_item=self.pepperoni, recommended_product=product,
        )
        self.assertEqual(
            self.pepperoni.effective_recommendations, [("product", product)],
        )
        from_product_category = CatalogRecommendation.objects.create(
            product_category=ProductCategory.objects.create(
                system=self.system, name="Merch", slug="rec-merch",
            ),
            recommended_product=product,
        )
        self.assertEqual(from_product_category.system_id, self.system.id)

        # Deleting the target removes the pairing rather than leaving a dead row -
        # so the dish is back to inheriting its category's list.
        product.delete()
        self.assertEqual(self.pepperoni.own_recommendation_rows, [])
        self.assertEqual(self._names(self.pepperoni), ["Coca 355ml", "Agua"])

    def test_the_unbuyable_is_filtered_but_never_triggers_the_fallback(self):
        """⚠ The fallback is decided on the presence of *rows*, never on whether
        their targets are buyable today. A dish whose single own recommendation
        is out of stock recommends nothing; silently showing its category's list
        instead would read as a lost edit."""
        self._recommend(self.coca, menu_category=self.pizzas)
        self._recommend(self.agua, menu_item=self.margarita)

        self.agua.is_available = False
        self.agua.save()
        self.assertEqual(self.margarita.effective_recommendations, [])

        # On the category itself, an unbuyable target simply drops out.
        self._recommend(self.agua, menu_category=self.pizzas)
        self.assertEqual(self._names(self.pepperoni), ["Coca 355ml"])
        self.coca.enabled = False
        self.coca.save()
        self.assertEqual(self.pepperoni.effective_recommendations, [])

        # A disabled row is ignored, and so is an out-of-stock product target.
        self.coca.enabled = True
        self.coca.save()
        CatalogRecommendation.objects.filter(menu_category=self.pizzas).update(
            enabled=False,
        )
        self.assertEqual(self.pepperoni.effective_recommendations, [])
        CatalogRecommendation.objects.all().delete()
        CatalogRecommendation.objects.create(
            menu_category=self.pizzas,
            recommended_product=Product.objects.create(
                category=a_product_category(self.system),
                system=self.system, name="Taza", slug="rec-taza",
                price=Decimal("120.00"), in_stock=False,
            ),
        )
        self.assertEqual(self.pepperoni.effective_recommendations, [])

    def test_the_replace_all_write_refuses_a_self_or_foreign_reference(self):
        from .serializers import MenuItemWriteSerializer, set_recommendations

        def write(refs):
            set_recommendations(self.margarita, "menu_item", refs)

        write([
            {"kind": "menu_item", "id": self.agua.pk},
            {"kind": "menu_item", "id": self.coca.pk},
        ])
        self.assertEqual(self._names(self.margarita), ["Agua", "Coca 355ml"])

        # Replaces rather than appends, and duplicates collapse.
        write([
            {"kind": "menu_item", "id": self.coca.pk},
            {"kind": "menu_item", "id": self.coca.pk},
        ])
        self.assertEqual(self._names(self.margarita), ["Coca 355ml"])
        self.assertEqual(len(self.margarita.own_recommendation_rows), 1)

        # An empty list clears the override; a self-reference is dropped; and
        # another tenant's item is **skipped, never linked**.
        write([])
        self.assertEqual(self.margarita.own_recommendation_rows, [])
        write([{"kind": "menu_item", "id": self.margarita.pk}])
        self.assertEqual(self.margarita.own_recommendation_rows, [])
        foreign_category = MenuCategory.objects.create(
            system=self.other, name="Otras", slug="rec-otras",
        )
        foreign = MenuItem.objects.create(
            system=self.other, category=foreign_category, name="Refresco",
            slug="rec-foreign", price=Decimal("25.00"),
        )
        write([{"kind": "menu_item", "id": foreign.pk}])
        self.assertEqual(self.margarita.own_recommendation_rows, [])

        # Through the serializer, with PATCH semantics: an omitted field must not
        # be cleared by the CMS's other forms saving.
        serializer = MenuItemWriteSerializer(
            self.margarita,
            data={"recommendations": [{"kind": "menu_item", "id": self.coca.pk}]},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.update(self.margarita, serializer.validated_data)
        self.assertEqual(self._names(self.margarita), ["Coca 355ml"])

        serializer = MenuItemWriteSerializer(
            self.margarita, data={"price": "210.00"}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.update(self.margarita, serializer.validated_data)
        self.assertEqual(len(self.margarita.own_recommendation_rows), 1)


class RecommendationEndpointTests(TestCase):
    """`GET /api/catalog/recommendations/` - the CMS editor's read.

    Two things it must never do: answer with the *effective* list for an item
    (which would show an operator ticks they never made, and freeze them into an
    override on the next save), and answer for another tenant's source.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="rece-piccolo.test")
        self.other = System.objects.create(site_name="Otro", host="rece-otro.test")
        self.pizzas = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="rece-pizzas",
        )
        self.margarita = MenuItem.objects.create(
            system=self.system, category=self.pizzas, name="Margarita",
            slug="rece-margarita", price=Decimal("200.00"),
        )
        self.coca = MenuItem.objects.create(
            system=self.system, category=self.pizzas, name="Coca",
            slug="rece-coca", price=Decimal("30.00"),
        )
        CatalogRecommendation.objects.create(
            menu_category=self.pizzas, recommended_menu_item=self.coca,
        )
        self.admin = User.objects.create_user("rece-admin", password="x")
        self.admin.profile.system = self.system
        self.admin.profile.is_admin = True
        self.admin.profile.save()

    def _get(self, source, source_id):
        return self.client.get(
            f"/api/catalog/recommendations/?source={source}&id={source_id}"
        )

    def test_the_cms_read_answers_with_own_rows_and_only_for_this_tenant(self):
        # 401 with no credentials at all, 403 once signed in as a non-admin.
        self.assertEqual(self._get("menu_category", self.pizzas.pk).status_code, 401)
        member = User.objects.create_user("rece-member", password="x")
        member.profile.system = self.system
        member.profile.save()
        self.client.force_login(member)
        self.assertEqual(self._get("menu_category", self.pizzas.pk).status_code, 403)

        self.client.force_login(self.admin)
        self.assertEqual(
            [
                (r["kind"], r["id"], r["name"])
                for r in self._get("menu_category", self.pizzas.pk).json()
            ],
            [("menu_item", self.coca.pk, "Coca")],
        )
        # Empty *is* the answer for an inheriting item - it means "offer whatever
        # my category offers".
        self.assertEqual(self._get("menu_item", self.margarita.pk).json(), [])

        agua = MenuItem.objects.create(
            system=self.system, category=self.pizzas, name="Agua",
            slug="rece-agua", price=Decimal("20.00"),
        )
        CatalogRecommendation.objects.create(
            menu_item=self.margarita, recommended_menu_item=agua,
        )
        self.assertEqual(
            [r["name"] for r in self._get("menu_item", self.margarita.pk).json()],
            ["Agua"],
        )

        # An operator's tick is a record, not a recommendation: a row whose
        # target is unbuyable is still reported, or the CMS looks like it lost it.
        self.coca.is_available = False
        self.coca.save()
        self.assertEqual(len(self._get("menu_category", self.pizzas.pk).json()), 1)

        foreign = MenuCategory.objects.create(
            system=self.other, name="Otras", slug="rece-otras",
        )
        self.assertEqual(self._get("menu_category", foreign.pk).status_code, 404)
        self.assertEqual(self._get("brand", 1).status_code, 400)
        self.assertEqual(
            self.client.get(
                "/api/catalog/recommendations/?source=menu_item"
            ).status_code,
            400,
        )


class StockImageCreditTests(TestCase):
    """Every CMS image field now carries the stock-image picker, so every write
    serializer behind one has to keep the credit its bank is owed.

    One test rather than one per model: the three shapes below are the only
    three the CMS has (a `ModelSerializer` on a category, a plain `Serializer` on
    a buyable, and a gallery row created from its parent), and each of them
    reaches `StockCreditWriteMixin` -> `save_to_field(..., credit)` by a
    different route. What must hold on all of them is the pair of rules the
    footer's credit line depends on: a bank photo keeps its credit, and a
    photograph the customer uploaded over it owes nobody.
    """

    PNG = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
        "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    CREDIT = {
        "attribution": "Photo by P on Pexels",
        "attribution_url": "https://www.pexels.com/photo/7/",
    }

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.host = {"HTTP_X_WEBSITE_HOST": "acme.test"}
        self.client = admin_client(self, self.system)
        # A product cannot be posted without one - its slug is the first segment
        # of the product's URL. Nothing here is about sectioning, so one
        # throwaway category serves every write below.
        self.category = a_product_category(self.system)

    def _post(self, url, **data):
        response = self.client.post(
            url, data=data, content_type="application/json", **self.host,
        )
        self.assertIn(response.status_code, (200, 201), response.content)
        return response

    def _assert_credited(self, row):
        row.refresh_from_db()
        self.assertTrue(row.image)
        self.assertEqual(row.attribution, self.CREDIT["attribution"])
        self.assertEqual(row.attribution_url, self.CREDIT["attribution_url"])

    def test_a_picked_photo_keeps_its_credit_on_every_write_shape(self):
        # A category: ModelSerializer.create -> _save_image.
        self._post(
            "/api/catalog/product-categories/",
            system=self.system.id, name="Tools", slug="tools",
            image=self.PNG, **self.CREDIT,
        )
        self._assert_credited(ProductCategory.objects.get(slug="tools"))

        # A buyable: a plain Serializer, whose create() feeds `validated_data`
        # straight into the model - so the credit has to be popped out of it.
        self._post(
            "/api/catalog/products/",
            system=self.system.id, category=self.category.id,
            name="Hammer", slug="hammer", price="10.00",
            image=self.PNG, **self.CREDIT,
        )
        hammer = Product.objects.get(slug="hammer")
        self._assert_credited(hammer)

        # A gallery row, created from its parent rather than from a payload of
        # its own.
        self._post(
            f"/api/catalog/products/{hammer.pk}/images/",
            image=self.PNG, **self.CREDIT,
        )
        self._assert_credited(hammer.images.get())

    def test_the_operators_own_upload_clears_the_credit(self):
        """The mirror rule, and the reason the pair travels *with* the file: a
        customer's own photograph must never stay credited to a stranger, and an
        edit that does not touch the image must not silently drop a credit that
        is still owed."""
        self._post(
            "/api/catalog/products/",
            system=self.system.id, category=self.category.id,
            name="Hammer", slug="hammer", price="10.00",
            image=self.PNG, **self.CREDIT,
        )
        hammer = Product.objects.get(slug="hammer")

        self.client.patch(
            f"/api/catalog/products/{hammer.pk}/",
            data={"name": "Hammer (steel)"},
            content_type="application/json", **self.host,
        )
        self._assert_credited(hammer)

        self.client.patch(
            f"/api/catalog/products/{hammer.pk}/",
            data={"image": self.PNG},
            content_type="application/json", **self.host,
        )
        hammer.refresh_from_db()
        self.assertEqual(hammer.attribution, "")
        self.assertEqual(hammer.attribution_url, "")
