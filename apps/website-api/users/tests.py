from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase

from catalog.models import (
    MenuItem,
    MenuItemIngredient,
    Product,
    ProductVariant,
    Service,
)
from core.models import System

from .models import CartItem


class CartConstraintTests(TestCase):
    """The database-level rules a cart line must obey.

    These are constraints rather than view logic because a line that means
    "both a product and a service", or that exists twice for the same variant,
    is corrupt no matter which code path wrote it.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = User.objects.create_user("1_a@acme.test", password="x")
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag", price=Decimal("10.00")
        )
        self.variant = ProductVariant.objects.create(
            product=self.product, name="Small", price=Decimal("8.00")
        )

    def test_duplicate_line_without_a_variant_is_rejected(self):
        """The NULL-distinct trap: SQL considers two NULL variants different, so
        a single unique index over (user, product, variant) would let the same
        variant-less product be inserted any number of times."""
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user, system=self.system, product=self.product
                )

    def test_duplicate_line_with_the_same_variant_is_rejected(self):
        CartItem.objects.create(
            user=self.user,
            system=self.system,
            product=self.product,
            product_variant=self.variant,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user,
                    system=self.system,
                    product=self.product,
                    product_variant=self.variant,
                )

    def test_the_same_product_in_two_variants_is_two_lines(self):
        large = ProductVariant.objects.create(product=self.product, name="Large")

        CartItem.objects.create(
            user=self.user,
            system=self.system,
            product=self.product,
            product_variant=self.variant,
        )
        CartItem.objects.create(
            user=self.user,
            system=self.system,
            product=self.product,
            product_variant=large,
        )

        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 2)

    def test_a_line_must_have_a_target(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(user=self.user, system=self.system)

    def test_a_line_cannot_target_both_a_product_and_a_service(self):
        service = Service.objects.create(system=self.system, name="Fix", slug="fix")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user,
                    system=self.system,
                    product=self.product,
                    service=service,
                )

    def test_a_variant_cannot_cross_over_to_the_other_target(self):
        service = Service.objects.create(system=self.system, name="Fix", slug="fix")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user,
                    system=self.system,
                    service=service,
                    product_variant=self.variant,
                )

    def test_quantity_cannot_drop_below_one(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user, system=self.system, product=self.product, quantity=0
                )

    def test_unit_price_prefers_the_variant_over_the_product(self):
        line = CartItem.objects.create(
            user=self.user,
            system=self.system,
            product=self.product,
            product_variant=self.variant,
            quantity=3,
        )

        self.assertEqual(line.unit_price, Decimal("8.00"))
        self.assertEqual(line.line_total, Decimal("24.00"))

    def test_unit_price_falls_back_to_the_product_when_the_variant_has_none(self):
        inherits = ProductVariant.objects.create(product=self.product, name="Plain")
        line = CartItem.objects.create(
            user=self.user,
            system=self.system,
            product=self.product,
            product_variant=inherits,
            quantity=2,
        )

        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.line_total, Decimal("20.00"))


class CartApiTests(TestCase):
    """The cart endpoints, including the boundaries that keep one user's cart
    (and one tenant's catalog) out of another's."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Other", host="other.test")

        self.product = Product.objects.create(
            system=self.system,
            name="Bag",
            slug="bag",
            price=Decimal("10.00"),
            currency="USD",
        )
        self.variant = ProductVariant.objects.create(
            product=self.product, name="Small", price=Decimal("8.00")
        )
        self.other_product = Product.objects.create(
            system=self.system, name="Mug", slug="mug", price=Decimal("5.00"), currency="USD"
        )

        self.menu_item = MenuItem.objects.create(
            system=self.system, name="Burger", slug="burger",
            price=Decimal("12.00"), currency="USD",
        )
        # A default, chargeable-when-doubled ingredient, so a non-empty selection
        # (a double patty) is possible and reads as a customised line.
        self.patty = MenuItemIngredient.objects.create(
            menu_item=self.menu_item, name="Patty",
            price=Decimal("3.00"), is_default=True, max_quantity=2,
        )

        self.user = self._make_user("a@acme.test", self.system)
        self.client.force_login(self.user)

    def _make_user(self, email, system):
        user = User.objects.create_user(f"{system.id}_{email}", password="x")
        user.profile.system = system
        user.profile.save()
        return user

    def _add(self, **body):
        return self.client.post("/api/auth/cart/", body, content_type="application/json")

    def test_add_creates_a_line(self):
        response = self._add(kind="product", id=self.product.id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["quantity"], 1)
        self.assertEqual(response.json()["unit_price"], "10.00")

    def test_adding_the_same_line_twice_increments_instead_of_duplicating(self):
        self._add(kind="product", id=self.product.id, quantity=2)
        response = self._add(kind="product", id=self.product.id, quantity=3)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quantity"], 5)
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 1)

    def test_add_with_a_variant_prices_the_line_from_the_variant(self):
        response = self._add(
            kind="product", id=self.product.id, variant_id=self.variant.id
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["variant"]["id"], self.variant.id)
        self.assertEqual(response.json()["unit_price"], "8.00")

    def test_a_variant_of_a_different_product_is_refused(self):
        """The check the database cannot make: the columns are individually valid,
        but the variant does not belong to the product being added."""
        response = self._add(
            kind="product", id=self.other_product.id, variant_id=self.variant.id
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_another_tenants_product_cannot_be_added(self):
        foreign = Product.objects.create(
            system=self.other_system, name="Foreign", slug="foreign", price=Decimal("1.00")
        )

        response = self._add(kind="product", id=foreign.id)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_a_disabled_product_cannot_be_added(self):
        self.product.enabled = False
        self.product.save()

        self.assertEqual(self._add(kind="product", id=self.product.id).status_code, 404)

    def test_get_returns_lines_with_a_subtotal_per_currency(self):
        mxn = Product.objects.create(
            system=self.system, name="Peso", slug="peso", price=Decimal("50.00"), currency="MXN"
        )
        self._add(kind="product", id=self.product.id, quantity=2)
        self._add(kind="product", id=mxn.id, quantity=1)

        body = self.client.get("/api/auth/cart/").json()

        self.assertEqual(body["count"], 3)
        self.assertEqual(
            body["totals"],
            [{"currency": "MXN", "subtotal": "50.00"}, {"currency": "USD", "subtotal": "20.00"}],
        )

    def test_patch_sets_the_quantity_and_is_visible_in_the_next_read(self):
        line_id = self._add(kind="product", id=self.product.id).json()["id"]
        self.client.get("/api/auth/cart/")  # warm the cache

        response = self.client.patch(
            f"/api/auth/cart/{line_id}/", {"quantity": 4}, content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["line_total"], "40.00")
        self.assertEqual(self.client.get("/api/auth/cart/").json()["count"], 4)

    def test_patch_rejects_a_quantity_below_one(self):
        line_id = self._add(kind="product", id=self.product.id).json()["id"]

        response = self.client.patch(
            f"/api/auth/cart/{line_id}/", {"quantity": 0}, content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)

    def test_delete_removes_the_line_and_refreshes_the_count(self):
        line_id = self._add(kind="product", id=self.product.id).json()["id"]
        self.assertEqual(self.client.get("/api/auth/cart/count/").json()["count"], 1)

        self.assertEqual(self.client.delete(f"/api/auth/cart/{line_id}/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/cart/count/").json()["count"], 0)

    def test_delete_on_the_collection_empties_the_cart(self):
        self._add(kind="product", id=self.product.id)
        self._add(kind="product", id=self.other_product.id)

        self.assertEqual(self.client.delete("/api/auth/cart/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/cart/").json()["items"], [])

    def test_one_user_cannot_touch_another_users_line(self):
        line_id = self._add(kind="product", id=self.product.id).json()["id"]
        intruder = self._make_user("b@acme.test", self.system)
        self.client.force_login(intruder)

        self.assertEqual(
            self.client.patch(
                f"/api/auth/cart/{line_id}/", {"quantity": 9}, content_type="application/json"
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete(f"/api/auth/cart/{line_id}/").status_code, 404)
        self.assertEqual(CartItem.objects.get(pk=line_id).quantity, 1)

    def test_a_cart_is_scoped_to_the_tenant_it_was_filled_from(self):
        """One account, two tenants: the catalog is per-System, so a line saved on
        one site must not surface on another."""
        self._add(kind="product", id=self.product.id)

        self.user.profile.system = self.other_system
        self.user.profile.save()

        self.assertEqual(self.client.get("/api/auth/cart/").json()["items"], [])

    def test_the_cart_requires_authentication(self):
        self.client.logout()

        self.assertEqual(self.client.get("/api/auth/cart/").status_code, 401)

    def _ids(self):
        return self.client.get("/api/auth/cart/ids/").json()["lines"]

    def test_ids_names_each_line_by_item_variant_and_row(self):
        line_id = self._add(
            kind="product", id=self.product.id, variant_id=self.variant.id
        ).json()["id"]

        self.assertEqual(
            self._ids(),
            [
                {
                    "line_id": line_id,
                    "kind": "product",
                    "id": self.product.id,
                    "variant_id": self.variant.id,
                    "customized": False,
                }
            ],
        )

    def test_ids_reports_no_variant_as_null(self):
        self._add(kind="product", id=self.product.id)

        self.assertIsNone(self._ids()[0]["variant_id"])

    def test_ids_flags_a_customised_menu_line(self):
        """The card adds the base (default-ingredients) menu line, so the ids feed
        must flag which menu lines are customised - otherwise a card's remove
        button could delete a double-patty line it never put there."""
        base = self._add(kind="menu_item", id=self.menu_item.id).json()["id"]
        doubled = self._add(
            kind="menu_item",
            id=self.menu_item.id,
            customization=[{"ingredient": self.patty.id, "quantity": 2}],
        ).json()["id"]

        self.assertEqual(
            {(line["line_id"], line["customized"]) for line in self._ids()},
            {(base, False), (doubled, True)},
        )

    def test_ids_tells_two_variants_of_one_product_apart(self):
        """The card matches on item *and* variant, so the two lines must arrive as
        two entries with their own row ids - otherwise one card's remove button
        would delete the other variant's line."""
        plain = self._add(kind="product", id=self.product.id).json()["id"]
        small = self._add(
            kind="product", id=self.product.id, variant_id=self.variant.id
        ).json()["id"]

        self.assertEqual(
            {(line["line_id"], line["variant_id"]) for line in self._ids()},
            {(plain, None), (small, self.variant.id)},
        )

    def test_ids_drops_a_line_as_soon_as_it_is_deleted(self):
        """The response is cached, so a stale entry here would leave a card showing
        a remove button for a line that no longer exists."""
        line_id = self._add(kind="product", id=self.product.id).json()["id"]
        self.assertEqual(len(self._ids()), 1)

        self.client.delete(f"/api/auth/cart/{line_id}/")

        self.assertEqual(self._ids(), [])

    def test_ids_are_scoped_to_the_tenant(self):
        self._add(kind="product", id=self.product.id)

        self.user.profile.system = self.other_system
        self.user.profile.save()

        self.assertEqual(self._ids(), [])

    def test_ids_require_authentication(self):
        self.client.logout()

        self.assertEqual(self.client.get("/api/auth/cart/ids/").status_code, 401)
