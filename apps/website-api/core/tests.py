import base64
import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timedelta
from unittest import mock
from decimal import Decimal
from io import BytesIO
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image

from catalog.models import (
    Ingredient,
    MenuCategory,
    MenuItem,
    MenuItemIngredient,
    Product,
    ProductCategory,
)
from core import storage as storage_module
from core.backup import BackupError, restore_archive, write_archive
from core.models import (
    BookingResource,
    Branch,
    Event,
    ResourcePool,
    SiteBackup,
    SuccessStory,
    SuccessStoryImage,
    System,
    backup_upload_path,
    picture,
)
from core.tenant_paths import system_id_for, system_id_from_name
from core.serializers import BranchWriteSerializer, SystemWriteSerializer
from core.site_payload import serialize_system, apply_payload
from orders.models import Booking, Order


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

    def test_a_bookings_resource_survives_the_round_trip(self):
        """The reason pools and resources are keyed rather than ridden as
        `parent=` children: `Booking.resource` points at one, so replacing a
        branch's resources wholesale would null out the boat on every
        appointment - or, worse, silently re-point it at a different one."""
        system = self._system()
        branch = Branch.objects.create(system=system, name="Marina", timezone="UTC")
        pool = ResourcePool.objects.create(branch=branch, name="Boats", unit_label="boat")
        BookingResource.objects.create(pool=pool, name="Panga", capacity=4)
        marlin = BookingResource.objects.create(pool=pool, name="Marlin", capacity=10)

        order = Order.objects.create(
            system=system, total=Decimal("500.00"), subtotal=Decimal("500.00"),
        )
        starts_at = timezone.now() + timedelta(days=3)
        Booking.objects.create(
            order=order, branch=branch, starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=4), timezone="UTC",
            duration_minutes=240, party_size=6,
            resource=marlin, resource_name="Marlin",
        )
        path, _ = self._archive(system, sections=("system",))

        Booking.objects.all().delete()
        Order.objects.all().delete()
        BookingResource.objects.all().delete()
        ResourcePool.objects.all().delete()
        restore_archive(system, path, ["system"], mode="replace")

        restored = Booking.objects.get()
        self.assertEqual(restored.party_size, 6)
        self.assertEqual(restored.resource_name, "Marlin")
        self.assertIsNotNone(restored.resource)
        self.assertEqual(restored.resource.name, "Marlin")
        self.assertEqual(restored.resource.capacity, 10)
        self.assertEqual(restored.resource.pool.unit_label, "boat")

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


class TenantPathTests(TestCase):
    """The upload path is the routing key, so its shape is load-bearing.

    `core.storage` decides which R2 bucket a file belongs to by reading the
    system id back out of the file's own name. If `picture()` and
    `system_id_from_name()` ever disagree about that shape, files are written to
    one bucket and looked for in another - which shows up as every image on a
    site 404ing, with nothing in the logs.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Pan", host="pan.test")
        self.other = System.objects.create(site_name="Cafe", host="cafe.test")

    def test_a_picture_path_names_its_tenant_and_parses_back(self):
        product = Product.objects.create(name="Loaf", slug="loaf", system=self.system)
        name = picture(product, "photo.png")
        self.assertTrue(name.startswith(f"t/{self.system.pk}/pictures/product/"))
        self.assertEqual(system_id_from_name(name), self.system.pk)

    def test_a_child_row_resolves_its_tenant_through_its_parent(self):
        """SuccessStoryImage has no `system` of its own - it reaches one via
        `story__system`, which is exactly what MODEL_SPECS already states."""
        story = SuccessStory.objects.create(name="S", slug="s", system=self.system)
        image = SuccessStoryImage(story=story)
        self.assertEqual(system_id_for(image), self.system.pk)
        self.assertEqual(system_id_from_name(picture(image, "x.jpg")), self.system.pk)

    def test_the_system_itself_is_its_own_tenant(self):
        self.assertEqual(system_id_for(self.system), self.system.pk)
        self.assertTrue(picture(self.system, "logo.png").startswith(f"t/{self.system.pk}/"))

    def test_a_legacy_path_belongs_to_no_tenant(self):
        """Every file written before this landed has no prefix, and must keep
        resolving to the platform bucket rather than being mis-read as a tenant's."""
        self.assertIsNone(system_id_from_name("pictures/product/ab12.jpg"))
        self.assertIsNone(system_id_from_name("profile_pictures/user_3/me.jpg"))
        self.assertIsNone(system_id_from_name("backups/7/deadbeef.zip"))
        self.assertIsNone(system_id_from_name(""))

    def test_a_backup_archive_is_tenant_scoped_too(self):
        backup = SiteBackup(system=self.system, name="nightly")
        name = backup_upload_path(backup, "nightly.zip")
        self.assertTrue(name.startswith(f"t/{self.system.pk}/backups/"))
        self.assertTrue(name.endswith(".zip"))
        self.assertEqual(system_id_from_name(name), self.system.pk)

    def test_an_unresolvable_instance_falls_back_to_the_platform(self):
        """A row whose System is not set yet must still get a usable path - the
        file lands on the platform bucket rather than the write failing."""
        orphan = Product(name="No home", slug="no-home")
        self.assertIsNone(system_id_for(orphan))
        self.assertIsNone(system_id_from_name(picture(orphan, "x.jpg")))


class TenantStorageRoutingTests(TestCase):
    """`TenantMediaStorage` must send each file to the bucket its name names.

    Exercised with stub backends rather than real R2: what is worth testing here
    is the routing decision, and it is the part that has no visible failure mode
    in production - a wrong answer writes a real file to the wrong real bucket.
    """

    def setUp(self):
        self.system = System.objects.create(
            site_name="Pan",
            host="pan.test",
            storage_enabled=True,
            storage_account_id="acct",
            storage_access_key_id="key",
            storage_bucket_name="pan-media",
            storage_public_domain="cdn.pan.test",
        )
        self.system.set_storage_secret_access_key("s3cret")
        self.system.save()
        storage_module.forget_system()

    def tearDown(self):
        storage_module.forget_system()

    def test_a_configured_tenant_gets_its_own_backend(self):
        backend = storage_module.tenant_storage(self.system.pk)
        self.assertIsNotNone(backend)
        self.assertEqual(backend.bucket_name, "pan-media")
        # A public domain means plain unsigned URLs - the whole point of the CDN.
        self.assertEqual(backend.custom_domain, "cdn.pan.test")
        self.assertFalse(backend.querystring_auth)

    def test_an_incomplete_config_is_no_config(self):
        """A half-filled form must not start writing to an unusable bucket - the
        tenant stays on the platform until every part is present."""
        self.system.storage_bucket_name = ""
        self.system.save()
        storage_module.forget_system()
        self.assertIsNone(storage_module.tenant_storage(self.system.pk))
        self.assertFalse(self.system.storage_configured)

    def test_a_disabled_config_is_no_config(self):
        self.system.storage_enabled = False
        self.system.save()
        storage_module.forget_system()
        self.assertIsNone(storage_module.tenant_storage(self.system.pk))

    def test_a_tenant_without_a_public_domain_falls_back_to_signed_urls(self):
        self.system.storage_public_domain = ""
        self.system.save()
        storage_module.forget_system()
        backend = storage_module.tenant_storage(self.system.pk)
        self.assertIsNone(backend.custom_domain)
        self.assertTrue(backend.querystring_auth)

    def test_saving_a_system_clears_the_memo(self):
        """Without this a worker keeps writing to the old bucket for up to a
        minute after the operator changes the credentials."""
        self.assertIsNotNone(storage_module.tenant_storage(self.system.pk))
        self.system.storage_bucket_name = "renamed"
        self.system.save()  # the post_save receiver clears it
        self.assertEqual(
            storage_module.tenant_storage(self.system.pk).bucket_name, "renamed"
        )

    def test_undecryptable_credentials_serve_from_the_platform(self):
        """A ciphertext from another environment must degrade to the platform
        bucket, not 500 every page that renders an image."""
        self.system.storage_secret_access_key_encrypted = "not-a-fernet-token"
        self.system.save()
        storage_module.forget_system()
        with self.assertLogs("core.storage", level="ERROR"):
            self.assertIsNone(storage_module.tenant_storage(self.system.pk))

    def test_the_router_reads_the_bucket_off_the_path(self):
        """The whole design in one assertion: no request, no thread-local - the
        file's own name decides, so `url()` is right from a management command
        and from a cross-tenant admin page alike."""
        router = storage_module.TenantMediaStorage()
        mine = router.backend_for(f"t/{self.system.pk}/pictures/product/a.jpg")
        self.assertEqual(mine.bucket_name, "pan-media")

        # A legacy path and another tenant's path both fall to the platform.
        platform = storage_module.platform_storage()
        self.assertIs(router.backend_for("pictures/product/a.jpg"), platform)
        self.assertIs(router.backend_for("t/9999/pictures/a.jpg"), platform)

    def test_a_database_error_serves_from_the_platform(self):
        """`url()` runs once per image per page render, so a database hiccup here
        would 500 every page that shows a picture - most realistically in the
        window between a deploy and its migration."""
        from django.db import DatabaseError

        storage_module.forget_system()
        with mock.patch.object(
            System.objects.__class__,
            "filter",
            side_effect=DatabaseError("no such column"),
        ):
            with self.assertLogs("core.storage", level="ERROR"):
                self.assertIsNone(storage_module.tenant_storage(self.system.pk))


class EventTests(TestCase):
    """The two things about an event that are easy to get quietly wrong.

    First, **an all-day event must not retire on the morning it happens.** It is
    stored at midnight, so any naive "has the start passed?" check drops it from
    the site one minute into the day it runs on - the one day it most needs to be
    there. `Event.effective_end` carries it to the end of its local day, and the
    list endpoint approximates that in SQL with `ALL_DAY_GRACE`; both are pinned
    here because they are two implementations of one rule and would otherwise
    drift apart.

    Second, **the location resolves across the branch**, with the event's own
    value winning field by field - so a tenant can name a hall inside their shop
    without detaching the event from the location that carries the coordinates.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system,
            name="Centro",
            address="Av. Juárez 100",
            latitude=Decimal("19.43260000"),
            longitude=Decimal("-99.13320000"),
        )

    def _event(self, **kwargs):
        kwargs.setdefault("system", self.system)
        kwargs.setdefault("starts_at", timezone.now() + timedelta(days=3))
        kwargs.setdefault("name", "Tasting")
        return Event.objects.create(**kwargs)

    # ── When ─────────────────────────────────────────────────────────────────

    def test_all_day_event_is_not_past_on_the_day_it_runs(self):
        today = timezone.localtime(timezone.now()).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        event = self._event(starts_at=today, is_all_day=True)
        self.assertFalse(event.is_past)

    def test_all_day_event_is_past_once_its_day_is_over(self):
        yesterday = timezone.localtime(timezone.now()).replace(
            hour=0, minute=0, second=0, microsecond=0
        ) - timedelta(days=2)
        self.assertTrue(self._event(starts_at=yesterday, is_all_day=True).is_past)

    def test_a_timed_event_is_past_the_moment_it_ends(self):
        now = timezone.now()
        event = self._event(starts_at=now - timedelta(hours=3), ends_at=now - timedelta(minutes=1))
        self.assertTrue(event.is_past)
        # With no announced end, the start is the end.
        self.assertTrue(self._event(starts_at=now - timedelta(minutes=1)).is_past)
        self.assertFalse(self._event(starts_at=now + timedelta(minutes=1)).is_past)

    def test_effective_end_uses_the_events_own_timezone(self):
        """The whole reason the zone is stored: an all-day event ends at midnight
        *where it happens*, not at midnight UTC.

        The same stored instant is a different calendar day in each zone, so the
        two ends are six hours apart - and an all-day event authored in Mexico
        City (stored at its own local midnight) runs to the next local midnight,
        which is 06:00 UTC.
        """
        mx_zone = ZoneInfo("America/Mexico_City")
        local_midnight = datetime(2026, 8, 5, tzinfo=mx_zone)

        mx = self._event(
            starts_at=local_midnight, is_all_day=True, timezone="America/Mexico_City"
        )
        self.assertEqual(mx.effective_end, datetime(2026, 8, 6, tzinfo=mx_zone))

        # The identical row read as UTC is on the *previous* calendar day there
        # (06:00 on the 5th local is 06:00 UTC), so it retires a day earlier.
        utc = self._event(starts_at=local_midnight, is_all_day=True, timezone="UTC")
        self.assertEqual(
            utc.effective_end, datetime(2026, 8, 6, tzinfo=ZoneInfo("UTC"))
        )
        self.assertGreater(mx.effective_end, utc.effective_end)

    def test_an_unknown_stored_timezone_falls_back_instead_of_raising(self):
        event = self._event()
        Event.objects.filter(pk=event.pk).update(timezone="Mars/Olympus")
        event.refresh_from_db()
        # A row written before the validator existed must not 500 every page.
        self.assertIsNotNone(event.effective_end)

    # ── Where ────────────────────────────────────────────────────────────────

    def test_location_falls_back_to_the_branch(self):
        event = self._event(branch=self.branch)
        self.assertEqual(event.effective_venue_name, "Centro")
        self.assertEqual(event.effective_address, "Av. Juárez 100")
        self.assertEqual(event.effective_latitude, Decimal("19.43260000"))

    def test_the_events_own_value_wins_field_by_field(self):
        """Overriding the venue name must not cost the branch's coordinates -
        otherwise naming a hall inside the shop un-maps the event."""
        event = self._event(branch=self.branch, venue_name="Salón Azul")
        self.assertEqual(event.effective_venue_name, "Salón Azul")
        self.assertEqual(event.effective_address, "Av. Juárez 100")
        self.assertEqual(event.effective_longitude, Decimal("-99.13320000"))

    def test_a_one_off_place_needs_no_branch(self):
        event = self._event(venue_name="Parque México", address="Av. México s/n")
        self.assertEqual(event.effective_venue_name, "Parque México")
        self.assertIsNone(event.effective_latitude)


class EventApiTests(TestCase):
    """The list endpoint's scopes, and the tenancy every read is scoped by."""

    def setUp(self):
        # These views cache, and Django's test runner does not clear the cache
        # between tests - so without this a payload built by one test is served
        # to the next, which is how a passing suite hides a serializer change.
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other = System.objects.create(site_name="Rival", host="rival.test")
        now = timezone.now()
        self.upcoming = Event.objects.create(
            system=self.system, name="Next week", slug="next-week",
            starts_at=now + timedelta(days=7),
        )
        self.soon = Event.objects.create(
            system=self.system, name="Tomorrow", slug="tomorrow",
            starts_at=now + timedelta(days=1),
        )
        self.past = Event.objects.create(
            system=self.system, name="Last month", slug="last-month",
            starts_at=now - timedelta(days=30),
        )
        self.hidden = Event.objects.create(
            system=self.system, name="Draft", slug="draft",
            starts_at=now + timedelta(days=2), enabled=False,
        )
        Event.objects.create(
            system=self.other, name="Theirs", slug="theirs",
            starts_at=now + timedelta(days=1),
        )

    def _get(self, url):
        return self.client.get(url, HTTP_X_WEBSITE_HOST="acme.test")

    def test_upcoming_is_soonest_first_and_excludes_the_past(self):
        res = self._get("/api/events/?scope=upcoming")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([e["slug"] for e in res.json()], ["tomorrow", "next-week"])

    def test_past_is_newest_first(self):
        res = self._get("/api/events/?scope=past")
        self.assertEqual([e["slug"] for e in res.json()], ["last-month"])

    def test_a_disabled_event_is_invisible_to_the_public(self):
        slugs = [e["slug"] for e in self._get("/api/events/").json()]
        self.assertNotIn("draft", slugs)

    def test_another_tenants_event_never_appears(self):
        slugs = [e["slug"] for e in self._get("/api/events/").json()]
        self.assertNotIn("theirs", slugs)

    def test_limit_is_capped_rather_than_trusted(self):
        res = self._get("/api/events/?scope=upcoming&limit=1")
        self.assertEqual(len(res.json()), 1)
        # A nonsense limit is ignored, not fatal.
        self.assertEqual(self._get("/api/events/?limit=banana").status_code, 200)

    def test_by_slug_is_scoped_to_the_host(self):
        self.assertEqual(self._get("/api/events/slug/tomorrow/").status_code, 200)
        # The rival's event exists, but not for this host.
        self.assertEqual(self._get("/api/events/slug/theirs/").status_code, 404)

    def test_by_slug_refuses_a_disabled_event(self):
        self.assertEqual(self._get("/api/events/slug/draft/").status_code, 404)

    def test_the_payload_carries_the_resolved_location_and_is_past(self):
        branch = Branch.objects.create(system=self.system, name="Centro", address="Av. Juárez 100")
        Event.objects.filter(pk=self.soon.pk).update(branch=branch)
        data = self._get("/api/events/slug/tomorrow/").json()
        self.assertEqual(data["venue_name"], "Centro")
        self.assertEqual(data["address"], "Av. Juárez 100")
        # The raw column stays blank - it is what the CMS form edits.
        self.assertIsNone(data["own_venue_name"])
        self.assertFalse(data["is_past"])

    def test_creating_an_event_without_a_date_is_refused(self):
        user = User.objects.create_user("admin", password="pw")
        user.profile.system = self.system
        user.profile.is_admin = True
        user.profile.save()
        self.client.force_login(user)
        res = self.client.post(
            "/api/events/",
            data=json.dumps({"name": "Undated", "system": self.system.pk}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("starts_at", res.json())


class EventPublishRoundTripTests(TestCase):
    """`export_site` -> `apply_payload` must carry an event's dates intact.

    The two instants are the only datetimes in the whole payload, so they are the
    only fields that have to survive a JSON encode/decode by hand - and an event
    that lands in production a day off, or with the day it was published, is
    worse than one that did not travel at all.
    """

    def test_dates_and_copy_survive_a_round_trip(self):
        source = System.objects.create(site_name="Acme", host="acme.test")
        starts = timezone.now().replace(microsecond=0) + timedelta(days=10)
        Event.objects.create(
            system=source, name="Cata de café", slug="cata", starts_at=starts,
            ends_at=starts + timedelta(hours=2), timezone="America/Mexico_City",
            venue_name="Salón Azul", is_featured=True,
        )

        payload = json.loads(json.dumps(serialize_system(source), default=str))
        payload["system"]["host"] = "acme-prod.test"
        apply_payload(payload)

        target = System.objects.get(host="acme-prod.test")
        event = target.events.get(slug="cata")
        self.assertEqual(event.starts_at, starts)
        self.assertEqual(event.ends_at, starts + timedelta(hours=2))
        self.assertEqual(event.timezone, "America/Mexico_City")
        self.assertEqual(event.venue_name, "Salón Azul")
        self.assertTrue(event.is_featured)

    def test_an_event_with_no_date_is_skipped_not_invented(self):
        system = System.objects.create(site_name="Acme", host="acme.test")
        apply_payload({
            "system": {"host": system.host},
            "events": [{"slug": "undated", "name": "Undated"}],
        })
        self.assertFalse(Event.objects.filter(slug="undated").exists())


class SystemMapSettingsTests(TestCase):
    """The basemap a tenant picks, on the way out and on the way in.

    The style is the one map setting with a closed vocabulary, and an unknown id
    is worse than a refused save: the frontend falls back to OpenStreetMap's
    standard tiles, so a typo would look exactly like the setting being ignored.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def test_a_fresh_tenant_reads_as_openstreetmap_with_no_custom_fields(self):
        res = self.client.get("/api/system/", HTTP_X_WEBSITE_HOST="acme.test")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["map_style"], "osm")
        self.assertEqual(data["map_tile_url"], "")
        self.assertEqual(data["map_attribution"], "")
        self.assertEqual(data["map_attribution_url"], "")

    def test_a_custom_basemap_round_trips_with_its_credit(self):
        serializer = SystemWriteSerializer(data={
            "map_style": "custom",
            "map_tile_url": "https://tiles.example.com/{z}/{x}/{y}.png?key=abc",
            "map_attribution": "© Example Tiles",
            "map_attribution_url": "https://example.com/attribution/",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(self.system)

        self.system.refresh_from_db()
        self.assertEqual(self.system.map_style, "custom")
        self.assertEqual(
            self.system.map_tile_url,
            "https://tiles.example.com/{z}/{x}/{y}.png?key=abc",
        )
        self.assertEqual(self.system.map_attribution, "© Example Tiles")
        self.assertEqual(
            self.system.map_attribution_url, "https://example.com/attribution/"
        )

    def test_an_unknown_style_is_refused_rather_than_silently_ignored(self):
        serializer = SystemWriteSerializer(data={"map_style": "google"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("map_style", serializer.errors)

    def test_a_leftover_custom_url_under_a_built_in_style_still_saves(self):
        """Half-filled is the normal state of a form somebody experimented with.

        The frontend only reads these three for "custom", so refusing the save
        would make the picker feel broken for a change that has no effect.
        """
        serializer = SystemWriteSerializer(data={
            "map_style": "carto-light",
            "map_tile_url": "https://tiles.example.com/{z}/{x}/{y}.png",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(self.system)

        self.system.refresh_from_db()
        self.assertEqual(self.system.map_style, "carto-light")


class BranchMapImageTests(IsolatedMediaTestCase):
    """The map screenshot the CMS's picker renders for a branch.

    ⚠ **The PATCH semantics are the whole of this.** The picture is only re-taken
    when the pin actually moves, so an ordinary save - a changed phone number, a
    day added to the opening hours - sends no `map_image` at all, and that has to
    mean "leave the stored one alone". Were an omitted field to clear the column,
    a tenant's booking emails would quietly lose their map the first time anyone
    touched anything else on the form.
    """

    # A 2×2 JPEG, base64'd as the CMS's canvas hands one over.
    def _data_url(self):
        image = Image.new("RGB", (2, 2), "white")
        buffer = BytesIO()
        image.save(buffer, format="JPEG")
        return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(system=self.system, name="Marina")

    def _save(self, payload):
        serializer = BranchWriteSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(self.branch)
        self.branch.refresh_from_db()

    def test_a_captured_map_is_stored_under_the_tenant(self):
        self._save({
            "latitude": "22.88",
            "longitude": "-109.9",
            "map_image": self._data_url(),
        })

        self.assertTrue(self.branch.map_image)
        # Tenant-prefixed like every other file, so it follows a customer to its
        # own R2 bucket - see `core.tenant_paths`.
        self.assertTrue(self.branch.map_image.name.startswith(f"t/{self.system.pk}/"))

    def test_a_save_that_omits_the_field_keeps_the_stored_picture(self):
        self._save({"map_image": self._data_url()})
        stored = self.branch.map_image.name

        self._save({"phone": "+52 000"})

        self.assertEqual(self.branch.map_image.name, stored)

    def test_a_blank_value_clears_it(self):
        """What clearing the pin has to do: a map of nowhere is worse than none."""
        self._save({"map_image": self._data_url()})

        self._save({"latitude": None, "longitude": None, "map_image": ""})

        self.assertFalse(self.branch.map_image)

    def test_the_public_payload_carries_the_url(self):
        self._save({"map_image": self._data_url()})

        res = self.client.get("/api/branches/", HTTP_X_WEBSITE_HOST="acme.test")

        self.assertEqual(res.status_code, 200)
        self.assertIn("map_image", res.json()[0])
        self.assertIn("branchmap", res.json()[0]["map_image"])
