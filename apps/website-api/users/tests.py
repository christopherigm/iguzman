from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from catalog.models import (
    Ingredient,
    MenuItem,
    MenuItemIngredient,
    Product,
    Service,
)
from core.models import System

from .models import CartItem, EmailVerificationToken, UserProfile


class CartConstraintTests(TestCase):
    """The database-level rules a cart line must obey.

    These are constraints rather than view logic because a line that means
    "both a product and a service", or that exists twice for the same item,
    is corrupt no matter which code path wrote it.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = User.objects.create_user("1_a@acme.test", password="x")
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag", price=Decimal("10.00")
        )

    def test_duplicate_line_for_the_same_product_is_rejected(self):
        CartItem.objects.create(user=self.user, system=self.system, product=self.product)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user, system=self.system, product=self.product
                )

    def test_two_variants_of_one_product_are_two_independent_lines(self):
        """A variant is its own standalone Product, so the family members do not
        collide on the per-product unique constraint."""
        large = Product.objects.create(
            system=self.system, name="Bag XL", slug="bag-xl", price=Decimal("15.00")
        )
        self.product.variants.add(large)

        CartItem.objects.create(user=self.user, system=self.system, product=self.product)
        CartItem.objects.create(user=self.user, system=self.system, product=large)

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

    def test_quantity_cannot_drop_below_one(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CartItem.objects.create(
                    user=self.user, system=self.system, product=self.product, quantity=0
                )

    def test_unit_price_reads_the_products_own_price(self):
        line = CartItem.objects.create(
            user=self.user,
            system=self.system,
            product=self.product,
            quantity=3,
        )

        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.line_total, Decimal("30.00"))


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
        # A sibling variant of `product` - its own standalone, orderable Product.
        self.variant = Product.objects.create(
            system=self.system, name="Bag Small", slug="bag-small",
            price=Decimal("8.00"), currency="USD",
        )
        self.product.variants.add(self.variant)
        self.other_product = Product.objects.create(
            system=self.system, name="Mug", slug="mug", price=Decimal("5.00"), currency="USD"
        )

        self.menu_item = MenuItem.objects.create(
            system=self.system, name="Burger", slug="burger",
            price=Decimal("12.00"), currency="USD",
        )
        # An optional add-on (extra patty), so a non-empty selection (a double
        # patty) is possible and reads as a customised line.
        patty_ing = Ingredient.objects.create(
            system=self.system, name="Patty", slug="patty", unit="pc",
        )
        self.patty = MenuItemIngredient.objects.create(
            menu_item=self.menu_item, ingredient=patty_ing,
            price=Decimal("3.00"), is_removable=True, max_quantity=2,
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

    def test_adding_a_variant_adds_that_products_own_line_at_its_own_price(self):
        """A variant is a standalone Product, so it is added by its own id and
        priced from its own row - not as a modifier on its sibling."""
        response = self._add(kind="product", id=self.variant.id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["item"]["id"], self.variant.id)
        self.assertEqual(response.json()["unit_price"], "8.00")

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

    def test_ids_names_each_line_by_item_and_row(self):
        line_id = self._add(kind="product", id=self.product.id).json()["id"]

        self.assertEqual(
            self._ids(),
            [
                {
                    "line_id": line_id,
                    "kind": "product",
                    "id": self.product.id,
                    "customized": False,
                }
            ],
        )

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
        """Sibling variants are two distinct Products, so they arrive as two
        entries with their own row ids - otherwise one card's remove button
        would delete the other variant's line."""
        plain = self._add(kind="product", id=self.product.id).json()["id"]
        small = self._add(kind="product", id=self.variant.id).json()["id"]

        self.assertEqual(
            {(line["line_id"], line["id"]) for line in self._ids()},
            {(plain, self.product.id), (small, self.variant.id)},
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


class GuestCartTests(TestCase):
    """The anonymous visitor's cart: priced from the catalog, scoped by host."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )
        # A sibling variant of `product` - its own standalone, orderable Product.
        self.variant = Product.objects.create(
            system=self.system, name="Bag Small", slug="bag-small",
            price=Decimal("8.00"), currency="USD",
        )
        self.product.variants.add(self.variant)

    def _resolve(self, cart=None, favorites=None, host="acme.test"):
        return self.client.post(
            "/api/guest/resolve/",
            {"cart": cart or [], "favorites": favorites or []},
            content_type="application/json",
            HTTP_X_WEBSITE_HOST=host,
        )

    def test_a_reference_is_priced_from_the_catalog(self):
        response = self._resolve([
            {"kind": "product", "id": self.variant.id, "quantity": 2},
        ])

        self.assertEqual(response.status_code, 200)
        cart = response.json()["cart"]
        self.assertEqual(cart["count"], 2)
        self.assertEqual(cart["totals"], [{"currency": "USD", "subtotal": "16.00"}])
        self.assertEqual(cart["items"][0]["unit_price"], "8.00")

    def test_repeated_references_to_one_line_are_merged(self):
        response = self._resolve([
            {"kind": "product", "id": self.product.id, "quantity": 2},
            {"kind": "product", "id": self.product.id, "quantity": 3},
        ])

        cart = response.json()["cart"]
        self.assertEqual(len(cart["items"]), 1)
        self.assertEqual(cart["items"][0]["quantity"], 5)

    def test_a_line_handle_is_its_position_in_the_sent_cart(self):
        """A guest line has no row id, so its index in the *browser's* array
        stands in for one - that is what the cart page keys, re-quantifies and
        removes by. It must survive an earlier reference being dropped, or a
        remove would take out a line the customer never clicked."""
        other = Product.objects.create(
            system=self.system, name="Hat", slug="hat",
            price=Decimal("5.00"), currency="USD",
        )
        response = self._resolve([
            {"kind": "product", "id": 999999, "quantity": 1},
            {"kind": "product", "id": self.product.id, "quantity": 1},
            {"kind": "product", "id": other.id, "quantity": 1},
        ])

        self.assertEqual([i["id"] for i in response.json()["cart"]["items"]], [1, 2])

    def test_a_deleted_item_drops_its_line_instead_of_failing(self):
        """A cart can sit in localStorage for weeks; one dead reference must not
        make the whole thing un-renderable."""
        response = self._resolve([
            {"kind": "product", "id": self.product.id, "quantity": 1},
            {"kind": "product", "id": 999999, "quantity": 1},
        ])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["cart"]["items"]), 1)

    def test_another_tenants_item_does_not_resolve(self):
        other = System.objects.create(site_name="Other", host="other.test")
        theirs = Product.objects.create(
            system=other, name="Theirs", slug="theirs", price=Decimal("99.00"),
        )

        response = self._resolve([{"kind": "product", "id": theirs.id, "quantity": 1}])

        self.assertEqual(response.json()["cart"]["items"], [])

    def test_a_disabled_item_does_not_resolve(self):
        self.product.enabled = False
        self.product.save()

        response = self._resolve([{"kind": "product", "id": self.product.id, "quantity": 1}])

        self.assertEqual(response.json()["cart"]["items"], [])


class GuestMergeTests(TestCase):
    """Signing in folds the browser's cart and hearts into the account's rows."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = User.objects.create_user("1_a@acme.test", password="x", email="a@acme.test")
        self.user.profile.system = self.system
        self.user.profile.save()
        self.client.force_login(self.user)

        self.product = Product.objects.create(
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )

    def _merge(self, cart=None, favorites=None):
        return self.client.post(
            "/api/auth/guest/merge/",
            {"cart": cart or [], "favorites": favorites or []},
            content_type="application/json",
        )

    def test_a_guest_line_becomes_a_row(self):
        response = self._merge([{"kind": "product", "id": self.product.id, "quantity": 2}])

        self.assertEqual(response.status_code, 200)
        line = CartItem.objects.get(user=self.user)
        self.assertEqual(line.product_id, self.product.id)
        self.assertEqual(line.quantity, 2)

    def test_quantities_are_summed_with_what_the_account_already_had(self):
        CartItem.objects.create(
            user=self.user, system=self.system, product=self.product, quantity=1,
        )

        self._merge([{"kind": "product", "id": self.product.id, "quantity": 2}])

        self.assertEqual(CartItem.objects.get(user=self.user).quantity, 3)
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 1)

    def test_favorites_union_rather_than_duplicate(self):
        from .models import Favorite

        Favorite.objects.create(user=self.user, system=self.system, product=self.product)

        self._merge(favorites=[{"kind": "product", "id": self.product.id}])

        self.assertEqual(Favorite.objects.filter(user=self.user).count(), 1)

    def test_the_merged_cart_comes_back_so_the_client_need_not_ask_again(self):
        response = self._merge([{"kind": "product", "id": self.product.id, "quantity": 2}])

        self.assertEqual(response.json()["count"], 2)
        self.assertEqual(response.json()["totals"], [{"currency": "USD", "subtotal": "20.00"}])

    def test_a_signed_in_merge_ignores_the_host_header(self):
        """Tenancy comes from the profile, never from a header a client can set -
        otherwise a crafted host would reach another tenant's catalog."""
        other = System.objects.create(site_name="Other", host="other.test")
        theirs = Product.objects.create(
            system=other, name="Theirs", slug="theirs", price=Decimal("99.00"),
        )

        self.client.post(
            "/api/auth/guest/merge/",
            {"cart": [{"kind": "product", "id": theirs.id, "quantity": 1}]},
            content_type="application/json",
            HTTP_X_WEBSITE_HOST="other.test",
        )

        self.assertFalse(CartItem.objects.filter(user=self.user).exists())

    def test_anonymous_cannot_merge(self):
        self.client.logout()
        self.assertIn(self._merge().status_code, (401, 403))


class VerifyEmailSignsInTests(TestCase):
    """Redeeming a verification link also opens the session.

    The link proves the recipient controls the address, which is what the
    password login it used to send them off to proves - so the response carries
    a token pair and the frontend route handler turns it into cookies. What
    these pin down is the boundary: which requests get a pair and which must
    never, since a pair handed out on an expired or unknown token would make the
    verification email a permanent skeleton key.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def _user(self, email="new@acme.test", active=False):
        user = User.objects.create_user(
            username=f"{self.system.id}:{email}",
            email=email,
            password="x",
            is_active=active,
        )
        UserProfile.objects.update_or_create(user=user, defaults={"system": self.system})
        return user

    def _verify(self, token):
        return self.client.get(f"/api/auth/verify-email/{token}/")

    def test_verifying_activates_and_returns_a_usable_token_pair(self):
        user = self._user()
        token = EmailVerificationToken.objects.create(user=user)

        response = self._verify(token.token)

        self.assertEqual(response.status_code, 200)
        # The pair has to identify *this* user - a well-formed string is not
        # enough, since the frontend hands it straight to the cookies.
        self.assertEqual(
            AccessToken(response.data["access"])["user_id"], str(user.id)
        )
        self.assertIn("refresh", response.data)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertFalse(EmailVerificationToken.objects.filter(pk=token.pk).exists())

    def test_already_verified_account_is_signed_in_too(self):
        user = self._user(active=True)
        token = EmailVerificationToken.objects.create(user=user)

        response = self._verify(token.token)

        self.assertEqual(response.status_code, 200)
        self.assertIn("already verified", response.data["detail"].lower())
        self.assertIn("access", response.data)

    def test_expired_token_signs_nobody_in_even_on_an_active_account(self):
        """Expiry is checked before the already-verified branch, and must stay so.

        With the order reversed - which is how four of the five APIs were
        written - an active user's long-dead token would fall into the
        already-verified branch and be handed a session.
        """
        user = self._user(active=True)
        token = EmailVerificationToken.objects.create(user=user)
        EmailVerificationToken.objects.filter(pk=token.pk).update(
            created_at=timezone.now() - timedelta(days=30)
        )

        response = self._verify(token.token)

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("access", response.data)

    def test_unknown_token_signs_nobody_in(self):
        response = self._verify("00000000-0000-0000-0000-000000000000")

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("access", response.data)
