from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase

from core.models import Brand, System

from .models import Product


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
