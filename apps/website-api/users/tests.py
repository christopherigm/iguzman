"""Users / cart tests - deliberately few.

One test per subsystem. What is kept at full fidelity is the **ownership and
tenant boundary** - one user's cart line reachable from another account, or one
tenant's catalog reachable from another host, is the only class of bug here that
costs anything. See `CLAUDE.md` -> "Tests - keep the suite small".
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from catalog.models import (
    CatalogRecommendation,
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemIngredient,
    MenuItemIngredientOption,
    MenuSize,
    Product,
    Service,
)
from catalog.test_helpers import a_product_category, a_service_category
from core.models import System

from .models import CartItem, EmailVerificationToken, Favorite, UserProfile


def make_user(email, system, password="x"):
    user = User.objects.create_user(f"{system.id}_{email}", password=password, email=email)
    user.profile.system = system
    user.profile.save()
    return user


class CartTests(TestCase):
    """The cart endpoints, the constraints under them, and the two boundaries
    that keep one user's basket (and one tenant's catalog) out of another's."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other_system = System.objects.create(site_name="Other", host="other.test")

        self.product = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )
        # A sibling variant of `product` - its own standalone, orderable Product.
        self.variant = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Bag Small", slug="bag-small",
            price=Decimal("8.00"), currency="USD",
        )
        self.product.variants.add(self.variant)

        self.menu_item = MenuItem.objects.create(
            system=self.system,
            category=MenuCategory.objects.create(
                system=self.system, name="Hamburguesas", slug="burgers",
            ),
            name="Burger", slug="burger", price=Decimal("12.00"), currency="USD",
        )
        self.patty = MenuItemIngredient.objects.create(
            menu_item=self.menu_item,
            ingredient=Ingredient.objects.create(
                system=self.system, name="Patty", slug="patty", unit="pc",
            ),
            price=Decimal("3.00"), is_removable=True, max_quantity=2,
        )

        self.user = make_user("a@acme.test", self.system)
        self.client.force_login(self.user)

    def _add(self, **body):
        return self.client.post("/api/auth/cart/", body, content_type="application/json")

    def test_the_database_refuses_a_corrupt_line(self):
        """Constraints rather than view logic: a line that means "both a product
        and a service", or that exists twice for the same item, is corrupt no
        matter which code path wrote it."""
        line = CartItem.objects.create(
            user=self.user, system=self.system, product=self.product, quantity=3,
        )
        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.line_total, Decimal("30.00"))

        service = Service.objects.create(category=a_service_category(self.system), system=self.system, name="Fix", slug="fix")
        for kwargs in (
            {"product": self.product},                              # a duplicate
            {},                                                     # no target
            {"product": self.product, "service": service},          # two targets
            {"product": self.variant, "quantity": 0},               # below one
        ):
            with self.assertRaises(IntegrityError, msg=kwargs):
                with transaction.atomic():
                    CartItem.objects.create(
                        user=self.user, system=self.system, **kwargs
                    )

        # A variant is its own standalone Product, so the family members do not
        # collide on the per-product unique constraint.
        CartItem.objects.create(user=self.user, system=self.system, product=self.variant)
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 2)

    def test_a_line_is_added_incremented_repriced_and_removed(self):
        created = self._add(kind="product", id=self.product.id, quantity=2)
        self.assertEqual(created.status_code, 201)
        line_id = created.json()["id"]
        self.assertEqual(created.json()["unit_price"], "10.00")

        again = self._add(kind="product", id=self.product.id, quantity=3)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["quantity"], 5)
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 1)

        # A variant is added by its own id and priced from its own row - not as a
        # modifier on its sibling.
        variant_line = self._add(kind="product", id=self.variant.id)
        self.assertEqual(variant_line.json()["item"]["id"], self.variant.id)
        self.assertEqual(variant_line.json()["unit_price"], "8.00")

        mxn = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Peso", slug="peso",
            price=Decimal("50.00"), currency="MXN",
        )
        self._add(kind="product", id=mxn.id, quantity=1)
        body = self.client.get("/api/auth/cart/").json()
        self.assertEqual(body["count"], 7)
        self.assertEqual(
            body["totals"],
            [
                {"currency": "MXN", "subtotal": "50.00"},
                {"currency": "USD", "subtotal": "58.00"},
            ],
        )

        # A quantity change has to be visible in the next (cached) read.
        patched = self.client.patch(
            f"/api/auth/cart/{line_id}/", {"quantity": 4},
            content_type="application/json",
        )
        self.assertEqual(patched.json()["line_total"], "40.00")
        self.assertEqual(self.client.get("/api/auth/cart/").json()["count"], 6)
        self.assertEqual(
            self.client.patch(
                f"/api/auth/cart/{line_id}/", {"quantity": 0},
                content_type="application/json",
            ).status_code,
            400,
        )

        self.assertEqual(self.client.delete(f"/api/auth/cart/{line_id}/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/cart/count/").json()["count"], 2)
        self.assertEqual(self.client.delete("/api/auth/cart/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/cart/").json()["items"], [])

    def test_a_cart_belongs_to_one_user_on_one_tenant(self):
        line_id = self._add(kind="product", id=self.product.id).json()["id"]

        # Another tenant's product cannot be added, and a disabled one is gone.
        foreign = Product.objects.create(
            category=a_product_category(self.other_system),
            system=self.other_system, name="Foreign", slug="foreign",
            price=Decimal("1.00"),
        )
        self.assertEqual(self._add(kind="product", id=foreign.id).status_code, 404)
        self.variant.enabled = False
        self.variant.save()
        self.assertEqual(self._add(kind="product", id=self.variant.id).status_code, 404)
        self.assertEqual(CartItem.objects.count(), 1)

        # Another user cannot touch the line, and gets a 404 rather than a 403 -
        # so the endpoint cannot be used to probe which line ids exist.
        self.client.force_login(make_user("b@acme.test", self.system))
        self.assertEqual(
            self.client.patch(
                f"/api/auth/cart/{line_id}/", {"quantity": 9},
                content_type="application/json",
            ).status_code,
            404,
        )
        self.assertEqual(self.client.delete(f"/api/auth/cart/{line_id}/").status_code, 404)
        self.assertEqual(CartItem.objects.get(pk=line_id).quantity, 1)

        # One account, two tenants: the catalog is per-System, so a line saved on
        # one site must not surface on another.
        self.client.force_login(self.user)
        self.user.profile.system = self.other_system
        self.user.profile.save()
        self.assertEqual(self.client.get("/api/auth/cart/").json()["items"], [])
        self.assertEqual(self.client.get("/api/auth/cart/ids/").json()["lines"], [])

        self.client.logout()
        self.assertEqual(self.client.get("/api/auth/cart/").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/cart/ids/").status_code, 401)

    def test_the_ids_feed_names_each_line_and_flags_the_customised(self):
        """The catalog card adds the base (default-ingredients) line, so the feed
        has to say which menu lines are customised and tell sibling variants
        apart - otherwise a card's remove button deletes a line it never put
        there."""
        self.variant.enabled = True
        self.variant.save()
        plain = self._add(kind="product", id=self.product.id).json()["id"]
        small = self._add(kind="product", id=self.variant.id).json()["id"]
        base = self._add(kind="menu_item", id=self.menu_item.id).json()["id"]
        doubled = self._add(
            kind="menu_item", id=self.menu_item.id,
            customization=[{"ingredient": self.patty.id, "quantity": 2}],
        ).json()["id"]

        lines = self.client.get("/api/auth/cart/ids/").json()["lines"]
        self.assertEqual(
            {(row["line_id"], row["kind"], row["id"], row["customized"]) for row in lines},
            {
                (plain, "product", self.product.id, False),
                (small, "product", self.variant.id, False),
                (base, "menu_item", self.menu_item.id, False),
                (doubled, "menu_item", self.menu_item.id, True),
            },
        )

        # The response is cached, so a stale entry would leave a card showing a
        # remove button for a line that no longer exists.
        self.client.delete(f"/api/auth/cart/{plain}/")
        self.assertNotIn(
            plain,
            [row["line_id"] for row in self.client.get("/api/auth/cart/ids/").json()["lines"]],
        )


class GuestCartTests(TestCase):
    """The anonymous visitor's cart: priced from the catalog, scoped by host, and
    folded into the account's rows on sign-in."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.product = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Bag", slug="bag",
            price=Decimal("10.00"), currency="USD",
        )
        self.variant = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Bag Small", slug="bag-small",
            price=Decimal("8.00"), currency="USD",
        )
        self.product.variants.add(self.variant)

    def _resolve(self, cart, host="acme.test"):
        return self.client.post(
            "/api/guest/resolve/", {"cart": cart, "favorites": []},
            content_type="application/json", HTTP_X_WEBSITE_HOST=host,
        )

    def test_a_guest_cart_is_priced_and_deduped_from_the_catalog(self):
        other = System.objects.create(site_name="Other", host="other.test")
        theirs = Product.objects.create(
            category=a_product_category(other),
            system=other, name="Theirs", slug="theirs", price=Decimal("99.00"),
        )
        hidden = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Draft", slug="draft",
            price=Decimal("5.00"), enabled=False,
        )
        hat = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Hat", slug="hat",
            price=Decimal("5.00"), currency="USD",
        )

        response = self._resolve([
            {"kind": "product", "id": 999999, "quantity": 1},        # long deleted
            {"kind": "product", "id": theirs.id, "quantity": 1},     # another tenant
            {"kind": "product", "id": hidden.id, "quantity": 1},     # not published
            {"kind": "product", "id": self.variant.id, "quantity": 2},
            {"kind": "product", "id": self.variant.id, "quantity": 3},
            {"kind": "product", "id": hat.id, "quantity": 1},
        ])

        self.assertEqual(response.status_code, 200)
        cart = response.json()["cart"]
        # Repeated references to one line are merged, and a dead one drops its
        # line rather than making the whole cart un-renderable.
        self.assertEqual(len(cart["items"]), 2)
        self.assertEqual(cart["items"][0]["quantity"], 5)
        self.assertEqual(cart["items"][0]["unit_price"], "8.00")
        self.assertEqual(cart["totals"], [{"currency": "USD", "subtotal": "45.00"}])
        # ⚠ A guest line has no row id, so its index in the *browser's* array
        # stands in for one - and it must survive an earlier reference being
        # dropped, or a remove takes out a line the customer never clicked.
        self.assertEqual([i["id"] for i in cart["items"]], [3, 5])

    def test_signing_in_merges_the_browser_cart_into_the_account(self):
        user = make_user("a@acme.test", self.system)
        self.client.force_login(user)
        CartItem.objects.create(
            user=user, system=self.system, product=self.product, quantity=1,
        )
        Favorite.objects.create(user=user, system=self.system, product=self.product)

        response = self.client.post(
            "/api/auth/guest/merge/",
            {
                "cart": [{"kind": "product", "id": self.product.id, "quantity": 2}],
                "favorites": [{"kind": "product", "id": self.product.id}],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        # Quantities are summed with what the account already had; favorites
        # union rather than duplicate.
        self.assertEqual(CartItem.objects.get(user=user).quantity, 3)
        self.assertEqual(CartItem.objects.filter(user=user).count(), 1)
        self.assertEqual(Favorite.objects.filter(user=user).count(), 1)
        # The merged cart comes back, so the client need not ask again.
        self.assertEqual(response.json()["count"], 3)
        self.assertEqual(
            response.json()["totals"], [{"currency": "USD", "subtotal": "30.00"}],
        )

        # ⚠ Tenancy comes from the profile, never from a header a client can set.
        other = System.objects.create(site_name="Other", host="other.test")
        theirs = Product.objects.create(
            category=a_product_category(other),
            system=other, name="Theirs", slug="theirs", price=Decimal("99.00"),
        )
        self.client.post(
            "/api/auth/guest/merge/",
            {"cart": [{"kind": "product", "id": theirs.id, "quantity": 1}]},
            content_type="application/json", HTTP_X_WEBSITE_HOST="other.test",
        )
        self.assertEqual(CartItem.objects.filter(user=user).count(), 1)

        self.client.logout()
        self.assertIn(
            self.client.post(
                "/api/auth/guest/merge/", {"cart": [], "favorites": []},
                content_type="application/json",
            ).status_code,
            (401, 403),
        )


class VerifyEmailSignsInTests(TestCase):
    """Redeeming a verification link also opens the session.

    The link proves the recipient controls the address, so the response carries a
    token pair. What matters is the boundary: a pair handed out on an expired or
    unknown token would make the verification email a permanent skeleton key.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def _user(self, email, active=False):
        user = User.objects.create_user(
            username=f"{self.system.id}:{email}", email=email,
            password="x", is_active=active,
        )
        UserProfile.objects.update_or_create(user=user, defaults={"system": self.system})
        return user

    def _verify(self, token):
        return self.client.get(f"/api/auth/verify-email/{token}/")

    def test_only_a_live_token_signs_anybody_in(self):
        user = self._user("new@acme.test")
        token = EmailVerificationToken.objects.create(user=user)

        response = self._verify(token.token)
        self.assertEqual(response.status_code, 200)
        # The pair has to identify *this* user - a well-formed string is not
        # enough, since the frontend hands it straight to the cookies.
        self.assertEqual(AccessToken(response.data["access"])["user_id"], str(user.id))
        self.assertIn("refresh", response.data)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertFalse(EmailVerificationToken.objects.filter(pk=token.pk).exists())

        # An already-verified account is signed in too.
        verified = self._user("known@acme.test", active=True)
        again = self._verify(EmailVerificationToken.objects.create(user=verified).token)
        self.assertEqual(again.status_code, 200)
        self.assertIn("already verified", again.data["detail"].lower())
        self.assertIn("access", again.data)

        # ⚠ Expiry is checked *before* the already-verified branch, and must stay
        # so: reversed - which is how four of the five APIs were written - an
        # active user's long-dead token falls into that branch and is handed a
        # session.
        stale = EmailVerificationToken.objects.create(user=verified)
        EmailVerificationToken.objects.filter(pk=stale.pk).update(
            created_at=timezone.now() - timedelta(days=30)
        )
        expired = self._verify(stale.token)
        self.assertEqual(expired.status_code, 400)
        self.assertNotIn("access", expired.data)

        unknown = self._verify("00000000-0000-0000-0000-000000000000")
        self.assertEqual(unknown.status_code, 400)
        self.assertNotIn("access", unknown.data)


class CartMenuSizeTests(TestCase):
    """A menu line's size is part of its identity *and* of its price, so both the
    merge rule and the "never trust the id" rule are pinned here."""

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="piccolo.test")
        self.category = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="cart-pizzas",
        )
        self.item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Margarita",
            slug="cart-margarita", price=Decimal("200.00"), currency="MXN",
        )
        self.medium = MenuSize.objects.create(
            category=self.category, name="Mediana", price_delta=Decimal("0.00"),
            is_default=True, sort_order=0,
        )
        self.large = MenuSize.objects.create(
            category=self.category, name="Grande", price_delta=Decimal("40.00"),
            sort_order=1,
        )
        self.user = make_user("a@piccolo.test", self.system)
        self.client.force_login(self.user)

    def _add(self, **body):
        return self.client.post("/api/auth/cart/", body, content_type="application/json")

    def test_a_size_prices_and_identifies_a_menu_line(self):
        sized = self._add(kind="menu_item", id=self.item.id, size=self.large.id)
        self.assertEqual(sized.status_code, 201, sized.content)
        self.assertEqual(sized.json()["unit_price"], "240.00")
        self.assertEqual(sized.json()["size"]["name"], "Grande")
        # The catalog card manages one line per dish; with a small and a large in
        # the cart it cannot say which one a remove press would delete.
        self.assertTrue(
            self.client.get("/api/auth/cart/ids/").json()["lines"][0]["customized"]
        )

        default = self._add(kind="menu_item", id=self.item.id)
        self.assertEqual(default.json()["unit_price"], "200.00")
        self.assertEqual(default.json()["size"]["name"], "Mediana")
        # A small and a large are two lines, not one of quantity 2...
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 2)
        # ...while the same size twice increments one line.
        repeat = self._add(kind="menu_item", id=self.item.id, size=self.large.id)
        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(repeat.json()["quantity"], 2)
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 2)

        # A size from another dish prices at the default, never at its own.
        foreign = MenuSize.objects.create(
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="cart-bebidas",
            ),
            name="Litro", price_delta=Decimal("500.00"),
        )
        CartItem.objects.filter(user=self.user).delete()
        self.assertEqual(
            self._add(kind="menu_item", id=self.item.id, size=foreign.id)
            .json()["unit_price"],
            "200.00",
        )

        # CASCADE like `menu_item`: a cart reflects today's catalog, and silently
        # re-pricing a withdrawn size at another one is the alternative.
        CartItem.objects.filter(user=self.user).delete()
        self._add(kind="menu_item", id=self.item.id, size=self.large.id)
        self.large.delete()
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 0)

    def test_a_guest_cart_prices_and_dedupes_by_size(self):
        self.client.logout()
        res = self.client.post(
            "/api/guest/resolve/",
            {"cart": [
                {"kind": "menu_item", "id": self.item.id, "size": self.large.id},
                {"kind": "menu_item", "id": self.item.id, "size": self.large.id},
                {"kind": "menu_item", "id": self.item.id, "size": self.medium.id},
            ]},
            content_type="application/json", HTTP_X_WEBSITE_HOST="piccolo.test",
        )
        self.assertEqual(res.status_code, 200, res.content)
        lines = res.json()["cart"]["items"]
        self.assertEqual(
            {(l["size"]["name"], l["quantity"], l["unit_price"]) for l in lines},
            {("Grande", 2, "240.00"), ("Mediana", 1, "200.00")},
        )

    def test_a_saved_dish_lists_with_its_sizes(self):
        """A favorite is a *dish*, not a configured line: it carries no chosen
        size, but the dish it points at still serializes its size list. This had
        no coverage at all, which is how a `prefetch_related('menu_size')` -
        valid on a cart line, meaningless on a Favorite - reached the queryset."""
        saved = self.client.post(
            "/api/auth/favorites/", {"kind": "menu_item", "id": self.item.id},
            content_type="application/json",
        )
        self.assertIn(saved.status_code, (200, 201), saved.content)

        rows = self.client.get("/api/auth/favorites/").json()
        self.assertEqual(
            [s["name"] for s in rows[0]["item"]["sizes"]], ["Mediana", "Grande"],
        )


class CartLineEditTests(TestCase):
    """Re-configuring a dish that is already in the cart.

    The cart page's customiser edits in place rather than dropping and re-adding,
    so `PATCH /api/auth/cart/<id>/` takes a size and a selection beside a
    quantity. Only what is *sent* is applied - the quantity stepper and the
    customiser share the endpoint, and neither may reset the other's half.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="edit.test")
        self.category = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="edit-pizzas",
        )
        self.item = MenuItem.objects.create(
            system=self.system, category=self.category, name="Margarita",
            slug="edit-margarita", price=Decimal("200.00"), currency="MXN",
        )
        self.medium = MenuSize.objects.create(
            category=self.category, name="Mediana", price_delta=Decimal("0.00"),
            is_default=True, sort_order=0,
        )
        self.large = MenuSize.objects.create(
            category=self.category, name="Grande", price_delta=Decimal("40.00"),
            sort_order=1,
        )
        # An optional add-on, and a single-select choice group with one
        # alternative - the two things the cart's customiser can change.
        self.cheese = MenuItemIngredient.objects.create(
            menu_item=self.item,
            ingredient=Ingredient.objects.create(
                system=self.system, name="Queso", slug="edit-queso", unit="g",
            ),
            price=Decimal("15.00"), is_removable=True, max_quantity=2,
        )
        self.crust = MenuItemIngredient.objects.create(
            menu_item=self.item,
            ingredient=Ingredient.objects.create(
                system=self.system, name="Masa delgada", slug="edit-delgada", unit="pc",
            ),
            price=Decimal("0.00"), is_removable=True, max_quantity=1,
            default_quantity=1, number_of_free_portions=1,
        )
        self.thick = Ingredient.objects.create(
            system=self.system, name="Masa gruesa", slug="edit-gruesa", unit="pc",
        )
        MenuItemIngredientOption.objects.create(
            menu_item_ingredient=self.crust, ingredient=self.thick,
            price=Decimal("25.00"), sort_order=0,
        )

        self.user = make_user("a@edit.test", self.system)
        self.client.force_login(self.user)

    def _add(self, **body):
        return self.client.post("/api/auth/cart/", body, content_type="application/json")

    def _patch(self, line_id, **body):
        return self.client.patch(
            f"/api/auth/cart/{line_id}/", body, content_type="application/json",
        )

    def test_a_patch_applies_only_what_it_sends_and_reprices(self):
        line_id = self._add(
            kind="menu_item", id=self.item.id, size=self.large.id, quantity=4,
        ).json()["id"]
        self.client.get("/api/auth/cart/")  # warm the cached payload

        resized = self._patch(line_id, size=self.medium.id)
        self.assertEqual(resized.status_code, 200, resized.content)
        self.assertEqual(resized.json()["id"], line_id)
        self.assertEqual(resized.json()["size"]["name"], "Mediana")
        self.assertEqual(resized.json()["unit_price"], "200.00")
        # The customiser must not reset the stepper's half of the line.
        self.assertEqual(resized.json()["quantity"], 4)

        customised = self._patch(
            line_id, customization=[{"ingredient": self.cheese.id, "quantity": 2}],
        )
        self.assertEqual(customised.json()["unit_price"], "230.00")
        self.assertEqual(
            [(r["name"], r["quantity"]) for r in customised.json()["customization"]],
            [("Queso", 2)],
        )

        # ...and the stepper must not quietly reset the dish to its defaults.
        stepped = self._patch(line_id, quantity=3)
        self.assertEqual(stepped.json()["quantity"], 3)
        self.assertEqual(stepped.json()["size"]["name"], "Mediana")
        self.assertEqual(stepped.json()["unit_price"], "230.00")

        # The cart payload is cached, so a stale line here would show the
        # customer the configuration they just changed.
        body = self.client.get("/api/auth/cart/").json()
        self.assertEqual(body["items"][0]["size"]["name"], "Mediana")
        self.assertEqual(body["totals"], [{"currency": "MXN", "subtotal": "690.00"}])

    def test_a_chosen_option_is_reported_so_the_customiser_can_reopen(self):
        """The cart line resolves an option to its *name*; the picker selects on
        its id, and a name cannot be turned back into one."""
        self._add(
            kind="menu_item", id=self.item.id,
            customization=[
                {"ingredient": self.crust.id, "quantity": 1, "option": self.thick.id},
            ],
        )
        row = self.client.get("/api/auth/cart/").json()["items"][0]["customization"][0]
        self.assertEqual(row["ingredient"], self.crust.id)
        self.assertEqual(row["option"], self.thick.id)
        self.assertEqual(row["name"], "Masa gruesa")

        # Keeping the group's default is reported as no option at all.
        CartItem.objects.filter(user=self.user).delete()
        cache.clear()
        self._add(
            kind="menu_item", id=self.item.id,
            customization=[{"ingredient": self.cheese.id, "quantity": 2}],
        )
        plain = self.client.get("/api/auth/cart/").json()["items"][0]["customization"][0]
        self.assertIsNone(plain["option"])

    def test_an_edit_merges_falls_back_and_stays_owner_only(self):
        medium = self._add(
            kind="menu_item", id=self.item.id, size=self.medium.id, quantity=1,
        ).json()["id"]
        large = self._add(
            kind="menu_item", id=self.item.id, size=self.large.id, quantity=2,
        ).json()["id"]

        # ⚠ An edit can collide with a line already in the basket. The untouched
        # row survives - it is the one holding its place in the cart.
        merged = self._patch(large, size=self.medium.id)
        self.assertEqual(merged.json()["id"], medium)
        self.assertEqual(merged.json()["quantity"], 3)
        self.assertEqual(CartItem.objects.filter(user=self.user).count(), 1)

        # Nothing about this path is more trusted for being an edit: a size
        # belonging to another dish prices as the default.
        foreign = MenuSize.objects.create(
            category=MenuCategory.objects.create(
                system=self.system, name="Bebidas", slug="edit-bebidas",
            ),
            name="Litro", price_delta=Decimal("500.00"),
        )
        fell_back = self._patch(medium, size=foreign.id)
        self.assertEqual(fell_back.json()["size"]["name"], "Mediana")
        self.assertEqual(fell_back.json()["unit_price"], "200.00")

        self.client.force_login(make_user("b@edit.test", self.system))
        self.assertEqual(self._patch(medium, size=self.large.id).status_code, 404)
        self.assertEqual(CartItem.objects.get(pk=medium).menu_size_id, self.medium.id)


class CartRecommendationTests(TestCase):
    """The "don't forget these" strip on the cart payload.

    Both carts read one implementation (`catalog.recommendations`), so what is
    pinned here is the four decisions it makes that no client could: dedupe
    across lines, drop what is already in the cart, drop what cannot be bought,
    and never offer a currency the basket cannot check out in.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="cartrec.test")
        self.pizzas = MenuCategory.objects.create(
            system=self.system, name="Pizzas", slug="cartrec-pizzas",
        )
        self.drinks = MenuCategory.objects.create(
            system=self.system, name="Bebidas", slug="cartrec-drinks",
        )

        def dish(name, slug, price, category):
            return MenuItem.objects.create(
                system=self.system, category=category, name=name, slug=slug,
                price=Decimal(price), currency="MXN",
            )

        self.margarita = dish("Margarita", "cartrec-margarita", "200.00", self.pizzas)
        self.pepperoni = dish("Pepperoni", "cartrec-pepperoni", "220.00", self.pizzas)
        self.coca = dish("Coca", "cartrec-coca", "30.00", self.drinks)
        self.agua = dish("Agua", "cartrec-agua", "20.00", self.drinks)
        CatalogRecommendation.objects.create(
            menu_category=self.pizzas, recommended_menu_item=self.coca, sort_order=0,
        )
        CatalogRecommendation.objects.create(
            menu_category=self.pizzas, recommended_menu_item=self.agua, sort_order=1,
        )

        self.user = make_user("a@cartrec.test", self.system)
        self.client.force_login(self.user)

    def _add(self, **body):
        return self.client.post("/api/auth/cart/", body, content_type="application/json")

    def _payload(self):
        cache.clear()
        return self.client.get("/api/auth/cart/").json()["recommendations"]

    def _strip(self):
        return [r["item"]["name"] for r in self._payload()]

    def test_the_strip_dedupes_and_drops_what_cannot_be_offered(self):
        self.assertEqual(self._strip(), [])

        # Two lines recommending the same thing offer it once.
        self._add(kind="menu_item", id=self.margarita.id)
        self._add(kind="menu_item", id=self.pepperoni.id)
        self.assertEqual(self._strip(), ["Coca", "Agua"])

        # Taking the prompt makes it go away, with no client-side bookkeeping -
        # and it is matched on the item alone, so any configuration counts.
        size = MenuSize.objects.create(
            menu_item=self.coca, name="Grande", price_delta=Decimal("10.00"),
        )
        self._add(kind="menu_item", id=self.coca.id, size=size.id)
        self.assertEqual(self._strip(), ["Agua"])

        # An unavailable target is dropped...
        self.agua.is_available = False
        self.agua.save()
        self.assertEqual(self._strip(), [])
        self.agua.is_available = True
        self.agua.save()
        # ...and so is one in a currency the basket cannot check out in, since
        # checkout refuses a mixed-currency cart with MIXED_CURRENCY.
        self.agua.currency = "USD"
        self.agua.save()
        self.assertEqual(self._strip(), [])

    def test_an_item_override_wins_and_the_strip_is_capped(self):
        from catalog.recommendations import MAX_CART_RECOMMENDATIONS

        CatalogRecommendation.objects.create(
            menu_item=self.margarita, recommended_menu_item=self.agua,
        )
        self._add(kind="menu_item", id=self.margarita.id)
        self.assertEqual(self._strip(), ["Agua"])

        for index in range(MAX_CART_RECOMMENDATIONS + 3):
            CatalogRecommendation.objects.create(
                menu_item=self.margarita, sort_order=10 + index,
                recommended_menu_item=MenuItem.objects.create(
                    system=self.system, category=self.drinks, name=f"Bebida {index}",
                    slug=f"cartrec-extra-{index}", price=Decimal("15.00"),
                    currency="MXN",
                ),
            )
        self.assertEqual(len(self._strip()), MAX_CART_RECOMMENDATIONS)

    def test_a_recommended_card_carries_its_kind_and_a_full_item_payload(self):
        """The strip is drawn with the ordinary catalog card, so each entry has
        to be a full item payload - not a cut-down reference."""
        CatalogRecommendation.objects.all().delete()
        product = Product.objects.create(
            category=a_product_category(self.system),
            system=self.system, name="Taza", slug="cartrec-taza",
            price=Decimal("120.00"), currency="MXN",
        )
        CatalogRecommendation.objects.create(
            menu_item=self.margarita, recommended_product=product,
        )
        self._add(kind="menu_item", id=self.margarita.id)

        rows = self._payload()
        self.assertEqual([(r["kind"], r["item"]["name"]) for r in rows], [("product", "Taza")])
        for key in ("id", "slug", "name", "price", "currency", "images", "in_stock"):
            self.assertIn(key, rows[0]["item"])

        # A dish carries the fields *its* card renders from.
        CatalogRecommendation.objects.all().delete()
        CatalogRecommendation.objects.create(
            menu_item=self.margarita, recommended_menu_item=self.coca,
        )
        dish = self._payload()[0]["item"]
        for key in ("category_slug", "ingredients", "sizes", "is_available"):
            self.assertIn(key, dish)

    def test_a_guest_reads_the_same_strip(self):
        self.client.logout()

        def guest_strip(cart):
            res = self.client.post(
                "/api/guest/resolve/", {"cart": cart, "favorites": []},
                content_type="application/json", HTTP_X_WEBSITE_HOST=self.system.host,
            )
            return [r["item"]["name"] for r in res.json()["cart"]["recommendations"]]

        pizza = {"kind": "menu_item", "id": self.margarita.id, "quantity": 1}
        self.assertEqual(guest_strip([pizza]), ["Coca", "Agua"])
        self.assertEqual(
            guest_strip([pizza, {"kind": "menu_item", "id": self.coca.id, "quantity": 1}]),
            ["Agua"],
        )
