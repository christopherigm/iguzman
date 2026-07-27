import json
import os
import shutil
import tempfile
import zipfile
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from catalog.models import (
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemIngredient,
    Product,
    ProductCategory,
)
from core.backup import BackupError, restore_archive, write_archive
from core.models import SiteBackup, System
from core.site_payload import serialize_system, apply_payload
from orders.models import Order


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


# --------------------------------------------------------------------------- #
# Backup & restore
# --------------------------------------------------------------------------- #

class IsolatedMediaTestCase(TestCase):
    """A TestCase whose file writes land in a throwaway MEDIA_ROOT.

    Backup tests write real files - product images, and the archives themselves -
    and `default_storage` points at the developer's own `media/` directory. Left
    unisolated they scatter fixtures through the same tree the local site serves
    from, and the archives (the largest files here) accumulate there run after
    run with nothing to sweep them up.
    """

    @classmethod
    def setUpClass(cls):
        cls._media_root = tempfile.mkdtemp(prefix="website-api-tests-")
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)


class SiteBackupRoundTripTests(IsolatedMediaTestCase):
    """A backup that does not restore what it saved is worse than no backup.

    These cover the parts that would fail silently: the full-fidelity fields
    `site_payload` deliberately drops, media travelling inside the zip, the
    auto_now_add timestamps Django overwrites on save, and the tenant boundary -
    which is the one bug in this feature that would leak one customer's data
    into another's site.
    """

    def _system(self, host="acme.test", name="Acme"):
        return System.objects.create(site_name=name, host=host)

    def _seed(self, system):
        cat = ProductCategory.objects.create(
            system=system, name="Tools", slug="tools",
        )
        product = Product.objects.create(
            system=system, category=cat, name="Hammer", slug="hammer",
            price=Decimal("19.99"), sku="HAM-1", cost_price=Decimal("7.50"),
            stock_count=12, weight=Decimal("1.2"),
        )
        product.image.save("hammer.png", ContentFile(b"not-a-real-png"), save=True)
        return cat, product

    def _archive(self, system, sections=("system", "products", "images")):
        path, manifest = write_archive(
            system, list(sections), include_images="images" in sections
        )
        self.addCleanup(lambda: os.path.exists(path) and os.unlink(path))
        return path, manifest

    # ---- serialize -------------------------------------------------------- #

    def test_carries_fields_the_publish_payload_drops(self):
        """`sku`, `cost_price`, `stock_count` and dimensions are exactly what a
        backup is for and exactly what `site_payload` omits."""
        system = self._system()
        self._seed(system)
        path, _ = self._archive(system)

        with zipfile.ZipFile(path) as archive:
            data = json.loads(archive.read("data.json").decode())
        row = data["catalog.product"][0]
        self.assertEqual(row["sku"], "HAM-1")
        self.assertEqual(row["cost_price"], "7.50")
        self.assertEqual(row["stock_count"], 12)
        self.assertEqual(row["weight"], "1.2")

    def test_media_travels_inside_the_archive(self):
        system = self._system()
        _, product = self._seed(system)
        path, manifest = self._archive(system)

        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
        self.assertEqual(manifest["media_files"], 1)
        self.assertIn(f"media/{product.image.name}", names)

    def test_images_off_omits_media_but_keeps_data(self):
        system = self._system()
        self._seed(system)
        path, manifest = self._archive(system, sections=("system", "products"))

        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            data = json.loads(archive.read("data.json").decode())
        self.assertFalse([n for n in names if n.startswith("media/")])
        self.assertEqual(manifest["media_files"], 0)
        self.assertIsNone(data["catalog.product"][0]["image"])

    # ---- restore ---------------------------------------------------------- #

    def test_replace_restores_rows_and_media(self):
        system = self._system()
        _, product = self._seed(system)
        path, _ = self._archive(system)

        Product.objects.all().delete()
        ProductCategory.objects.all().delete()
        self.assertEqual(Product.objects.count(), 0)

        restore_archive(system, path, ["system", "products", "images"], mode="replace")

        restored = Product.objects.get(slug="hammer")
        self.assertEqual(restored.sku, "HAM-1")
        self.assertEqual(restored.price, Decimal("19.99"))
        self.assertEqual(restored.category.slug, "tools")
        self.assertTrue(restored.image)
        self.assertEqual(restored.image.read(), b"not-a-real-png")

    def test_replace_drops_rows_added_after_the_backup(self):
        system = self._system()
        cat, _ = self._seed(system)
        path, _ = self._archive(system)

        Product.objects.create(
            system=system, category=cat, name="Wrench", slug="wrench",
            price=Decimal("9.99"),
        )
        restore_archive(system, path, ["products"], mode="replace")
        self.assertFalse(Product.objects.filter(slug="wrench").exists())

    def test_merge_keeps_rows_added_after_the_backup(self):
        system = self._system()
        cat, _ = self._seed(system)
        path, _ = self._archive(system)

        Product.objects.create(
            system=system, category=cat, name="Wrench", slug="wrench",
            price=Decimal("9.99"),
        )
        restore_archive(system, path, ["products"], mode="merge")
        self.assertTrue(Product.objects.filter(slug="wrench").exists())
        self.assertTrue(Product.objects.filter(slug="hammer").exists())

    def test_merge_reverts_an_edited_row(self):
        system = self._system()
        _, product = self._seed(system)
        path, _ = self._archive(system)

        product.price = Decimal("99.00")
        product.save()
        restore_archive(system, path, ["products"], mode="merge")
        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("19.99"))

    def test_order_timestamps_survive_the_round_trip(self):
        """`created_at` is auto_now_add: Django rewrites it on every save, so
        without the explicit follow-up UPDATE an order history would come back
        claiming every order was placed at the moment of the restore."""
        system = self._system()
        order = Order.objects.create(
            system=system, total=Decimal("10.00"), subtotal=Decimal("10.00"),
        )
        placed_at = timezone.now() - timedelta(days=30)
        Order.objects.filter(pk=order.pk).update(created_at=placed_at)
        path, _ = self._archive(system, sections=("system",))

        Order.objects.all().delete()
        restore_archive(system, path, ["system"], mode="replace")

        restored = Order.objects.get(public_id=order.public_id)
        self.assertEqual(restored.created_at, placed_at)

    def test_system_fields_are_restored_but_secrets_never_travel(self):
        system = self._system()
        system.slogan = "Best tools in town"
        system.set_stripe_secret_key("sk_test_supersecret")
        system.save()
        path, _ = self._archive(system, sections=("system",))

        with zipfile.ZipFile(path) as archive:
            raw = archive.read("data.json").decode()
        self.assertNotIn("sk_test_supersecret", raw)
        self.assertNotIn("stripe_secret_key_encrypted", raw)

        system.slogan = "changed"
        system.save()
        restore_archive(system, path, ["system"], mode="replace")
        system.refresh_from_db()
        self.assertEqual(system.slogan, "Best tools in town")
        # The live Stripe connection is untouched by a restore.
        self.assertEqual(system.stripe_secret_key, "sk_test_supersecret")

    # ---- the tenant boundary ---------------------------------------------- #

    def test_an_archive_from_another_tenant_is_refused(self):
        source = self._system(host="acme.test")
        self._seed(source)
        path, _ = self._archive(source)

        other = self._system(host="other.test", name="Other")
        with self.assertRaises(BackupError):
            restore_archive(other, path, ["system", "products"], mode="replace")
        self.assertFalse(Product.objects.filter(system=other).exists())

    def test_a_slug_owned_by_another_tenant_is_not_stolen(self):
        """Slugs are unique across the whole table while tenants are not, so an
        unscoped update_or_create would hand one customer another's row."""
        source = self._system(host="acme.test")
        self._seed(source)
        path, _ = self._archive(source)
        Product.objects.filter(system=source).delete()

        squatter = self._system(host="squatter.test", name="Squatter")
        theirs = Product.objects.create(
            system=squatter, name="Their hammer", slug="hammer",
            price=Decimal("1.00"),
        )

        restore_archive(source, path, ["products"], mode="merge")

        theirs.refresh_from_db()
        self.assertEqual(theirs.system_id, squatter.pk)
        self.assertEqual(theirs.name, "Their hammer")

    def test_restoring_a_section_the_archive_lacks_is_refused(self):
        system = self._system()
        path, _ = self._archive(system, sections=("system",))
        with self.assertRaises(BackupError):
            restore_archive(system, path, ["products"], mode="replace")


class SiteBackupApiTests(IsolatedMediaTestCase):
    """The endpoints behind the CMS's Backup & Restore sections.

    The engine is covered above; what these pin down is the wiring an operator
    actually hits - that a POST really produces a downloadable zip, and that the
    tenant scoping holds at the view layer, where a missed `.filter(system=...)`
    would hand one customer another's entire database.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = self._admin("admin", self.system)

        cat = ProductCategory.objects.create(
            system=self.system, name="Tools", slug="tools",
        )
        Product.objects.create(
            system=self.system, category=cat, name="Hammer", slug="hammer",
            price=Decimal("19.99"),
        )
        self.client.force_login(self.user)

    @staticmethod
    def _admin(username, system, is_admin=True):
        """A tenant user, set up the way `users/signals.py` requires.

        Two receivers there shape this: `create_user_profile` makes the profile
        on User creation (so it is never created here), and `save_user_profile`
        re-saves `instance.profile` on *every* `User.save()`. That second one is
        why the profile has to be written through the cached instance - a
        `QuerySet.update()` would be silently undone by the `last_login` save
        that `force_login` performs, writing the stale cached profile back over
        it, and the user would arrive at the view as a non-admin.
        """
        user = User.objects.create_user(username, password="pw")
        user.profile.system = system
        user.profile.is_admin = is_admin
        user.profile.save()
        return user

    def _create(self, sections=("system", "products", "images")):
        return self.client.post(
            "/api/backups/",
            data=json.dumps({"name": "Nightly", "sections": list(sections)}),
            content_type="application/json",
        )

    def test_create_then_list_then_download(self):
        created = self._create()
        self.assertEqual(created.status_code, 201, created.content)
        body = created.json()
        self.assertEqual(body["name"], "Nightly")
        self.assertGreater(body["size_bytes"], 0)

        listed = self.client.get("/api/backups/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        # The archive's own URL must never be published - only the guarded
        # download endpoint, which checks ownership.
        self.assertNotIn("file", listed.json()[0])

        download = self.client.get(f"/api/backups/{body['id']}/download/")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/zip")
        payload = b"".join(download.streaming_content)
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            self.assertIn("manifest.json", archive.namelist())
            self.assertIn("data.json", archive.namelist())

    def test_restore_round_trip_through_the_endpoint(self):
        created = self._create()
        download = self.client.get(f"/api/backups/{created.json()['id']}/download/")
        payload = b"".join(download.streaming_content)

        Product.objects.all().delete()

        response = self.client.post(
            "/api/backups/restore/",
            data={
                "file": SimpleUploadedFile("b.zip", payload, "application/zip"),
                "sections": "system,products,images",
                "mode": "replace",
            },
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(Product.objects.filter(slug="hammer").exists())

    def test_another_tenants_backup_is_not_readable(self):
        mine = self._create().json()

        other_system = System.objects.create(site_name="Other", host="other.test")
        other_admin = self._admin("other", other_system)
        self.client.force_login(other_admin)

        self.assertEqual(self.client.get("/api/backups/").json(), [])
        self.assertEqual(
            self.client.get(f"/api/backups/{mine['id']}/download/").status_code, 404
        )
        self.assertEqual(
            self.client.delete(f"/api/backups/{mine['id']}/").status_code, 404
        )

    def test_a_non_admin_is_refused(self):
        plain = self._admin("shopper", self.system, is_admin=False)
        self.client.force_login(plain)
        self.assertEqual(self.client.get("/api/backups/").status_code, 403)
        self.assertEqual(self._create().status_code, 403)

    def test_deleting_a_backup_removes_its_file(self):
        created = self._create().json()
        backup = SiteBackup.objects.get(pk=created["id"])
        path = backup.file.path
        self.assertTrue(os.path.exists(path))

        self.assertEqual(
            self.client.delete(f"/api/backups/{created['id']}/").status_code, 204
        )
        self.assertFalse(os.path.exists(path))
