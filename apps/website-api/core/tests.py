import json
import os
import shutil
import tempfile
import zipfile
from datetime import timedelta
from unittest import mock
from decimal import Decimal
from io import BytesIO

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, default_storage
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
from core import media_sync
from core import storage as storage_module
from core.backup import BackupError, restore_archive, write_archive
from core.models import (
    SiteBackup,
    SuccessStory,
    SuccessStoryImage,
    System,
    backup_upload_path,
    picture,
)
from core.tenant_paths import system_id_for, system_id_from_name
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


class _FakeRouter:
    """A `TenantMediaStorage` stand-in that sends every name to one directory.

    `MediaSyncTests` substitutes this for the real router because R2 is off in
    tests: the genuine article would build an `S3Boto3Storage` from empty
    credentials and reach for the network on the first `exists()`. Routing itself
    is covered by `TenantStorageRoutingTests`; what the sync tests need is a
    destination they can read back.
    """

    def __init__(self, backend):
        self._backend = backend

    def backend_for(self, name):
        return self._backend


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


class MediaSyncTests(IsolatedMediaTestCase):
    """The one-off migration behind /admin/system -> "Migrate stored media".

    What makes this worth testing rather than eyeballing is that it is the only
    operation in the project that **rewrites stored file paths in the database**.
    Every file uploaded before `core.tenant_paths` landed is unprefixed, and an
    unprefixed name routes to the *platform* bucket - so without re-pathing, a
    customer on its own domain would have all of its existing media copied into
    the platform's bucket and only its future uploads into its own. Copying alone
    can never move a tenant onto its own bucket.

    The destination is a plain `FileSystemStorage` in a temp directory standing
    in for a bucket: R2 is off in tests, and `platform_storage()` would otherwise
    build a real S3 backend and reach for the network on the first `exists()`.
    Substituting it keeps every assertion about *this* module's logic - the plan,
    the re-pathing, the repoint, the batching - rather than about django-storages.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.other = System.objects.create(site_name="Other", host="other.test")

        self.bucket_dir = tempfile.mkdtemp(prefix="website-api-bucket-")
        self.addCleanup(shutil.rmtree, self.bucket_dir, ignore_errors=True)
        self.bucket = FileSystemStorage(location=self.bucket_dir)

        patcher = mock.patch.object(
            media_sync, "TenantMediaStorage", lambda: _FakeRouter(self.bucket)
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def _legacy_story(self, name="hero.jpg", body=b"image-bytes"):
        """A story whose image sits at a pre-tenancy path, as production's do."""
        # Slug is globally unique, so it is derived from the file name to let a
        # test seed several stories without colliding.
        story = SuccessStory.objects.create(
            system=self.system, name="A story", slug=f"story-{name.split('.')[0]}",
        )
        path = f"pictures/successstory/{name}"
        default_storage.save(path, ContentFile(body))
        SuccessStory.objects.filter(pk=story.pk).update(image=path)
        story.refresh_from_db()
        return story, path

    # -- the plan --------------------------------------------------------- #

    def test_plan_repaths_legacy_paths_into_the_tenant_namespace(self):
        _, path = self._legacy_story()
        plan = media_sync.build_plan(self.system)

        item = next(i for i in plan if i.current == path)
        self.assertEqual(item.target, f"t/{self.system.pk}/{path}")
        self.assertTrue(item.repath)
        self.assertFalse(item.foreign)

    def test_plan_leaves_an_already_prefixed_path_alone(self):
        story = SuccessStory.objects.create(
            system=self.system, name="B", slug="b",
        )
        path = f"t/{self.system.pk}/pictures/successstory/new.jpg"
        SuccessStory.objects.filter(pk=story.pk).update(image=path)

        item = next(i for i in media_sync.build_plan(self.system) if i.current == path)
        self.assertEqual(item.target, path)
        self.assertFalse(item.repath)

    def test_plan_excludes_another_tenants_rows(self):
        self._legacy_story()
        self.assertEqual(media_sync.build_plan(self.other), [])

    # -- running ---------------------------------------------------------- #

    def test_copies_the_file_and_repoints_the_row(self):
        story, path = self._legacy_story()
        target = f"t/{self.system.pk}/{path}"

        result = media_sync.run_batch(self.system, source=media_sync.SOURCE_LOCAL)

        self.assertEqual(result["counts"][media_sync.COPIED], 1)
        self.assertEqual(result["repathed"], 1)
        self.assertTrue(result["done"])

        # The bytes arrived under the *new* key, unsuffixed - `_save` is used
        # precisely so `get_available_name` cannot rename it to `hero_a1b2.jpg`.
        self.assertTrue(self.bucket.exists(target))
        with self.bucket.open(target) as fh:
            self.assertEqual(fh.read(), b"image-bytes")

        story.refresh_from_db()
        self.assertEqual(story.image.name, target)

        # Nothing is ever deleted from the source: that is what makes the whole
        # operation re-runnable and reversible.
        self.assertTrue(default_storage.exists(path))

    def test_dry_run_writes_nothing_at_all(self):
        story, path = self._legacy_story()

        result = media_sync.run_batch(self.system, dry_run=True)

        self.assertEqual(result["counts"][media_sync.COPIED], 1)
        self.assertFalse(self.bucket.exists(f"t/{self.system.pk}/{path}"))
        story.refresh_from_db()
        self.assertEqual(story.image.name, path)

    def test_rerunning_skips_what_is_already_there(self):
        self._legacy_story(name="first.jpg")
        media_sync.run_batch(self.system)
        self._legacy_story(name="second.jpg")

        again = media_sync.run_batch(self.system)

        # The first file is already at its destination and its row already
        # points there; only the newly added one is work.
        self.assertEqual(again["counts"][media_sync.COPIED], 1)
        self.assertEqual(again["counts"][media_sync.SKIPPED], 1)

    def test_an_interrupted_run_repoints_on_the_next_pass(self):
        """A crash between the write and the repoint must be recoverable.

        This is the exact state the ordering in `_process` is designed to leave
        behind: the file is safely at its new name, but the row still points at
        the old one. The next run has to finish the job rather than call it
        "already present" and move on - otherwise the site keeps serving from a
        path that a later cleanup would remove.
        """
        story, path = self._legacy_story()
        target = f"t/{self.system.pk}/{path}"
        self.bucket.save(target, ContentFile(b"image-bytes"))

        result = media_sync.run_batch(self.system)

        self.assertEqual(result["counts"][media_sync.SKIPPED], 1)
        story.refresh_from_db()
        self.assertEqual(story.image.name, target)

    def test_refuses_a_path_belonging_to_another_tenant(self):
        story = SuccessStory.objects.create(system=self.system, name="C", slug="c")
        foreign = f"t/{self.other.pk}/pictures/successstory/theirs.jpg"
        SuccessStory.objects.filter(pk=story.pk).update(image=foreign)

        result = media_sync.run_batch(self.system)

        self.assertEqual(result["counts"][media_sync.FOREIGN], 1)
        self.assertEqual(result["counts"][media_sync.COPIED], 0)
        self.assertFalse(self.bucket.exists(foreign))
        story.refresh_from_db()
        self.assertEqual(story.image.name, foreign)

    def test_a_row_pointing_at_a_deleted_file_is_reported_not_cleared(self):
        story = SuccessStory.objects.create(system=self.system, name="D", slug="d")
        path = "pictures/successstory/gone.jpg"
        SuccessStory.objects.filter(pk=story.pk).update(image=path)

        result = media_sync.run_batch(self.system)

        self.assertEqual(result["counts"][media_sync.MISSING], 1)
        story.refresh_from_db()
        self.assertEqual(story.image.name, path)

    # -- batching --------------------------------------------------------- #

    def test_batches_cover_every_file_exactly_once(self):
        """`offset` is only a valid cursor if the plan order never shifts."""
        for i in range(5):
            self._legacy_story(name=f"file{i}.jpg", body=f"bytes-{i}".encode())

        copied = 0
        offset = 0
        batches = 0
        while True:
            result = media_sync.run_batch(self.system, offset=offset, limit=2)
            copied += result["counts"][media_sync.COPIED]
            offset = result["next_offset"]
            batches += 1
            if result["done"]:
                break

        self.assertEqual(batches, 3)          # 2 + 2 + 1
        self.assertEqual(copied, 5)
        for story in SuccessStory.objects.filter(system=self.system):
            self.assertTrue(story.image.name.startswith(f"t/{self.system.pk}/"))
            self.assertTrue(self.bucket.exists(story.image.name))

    def test_rejects_an_unknown_source(self):
        with self.assertRaises(ValueError):
            media_sync.run_batch(self.system, source="somewhere-else")


class MediaMigrationApiTests(IsolatedMediaTestCase):
    """The staff gate and the destination rule, at the view layer.

    Both are the kind of thing a disabled button appears to handle and does not:
    a customer admin is one crafted request away from the endpoint, and a wrongly
    chosen destination writes real files into a bucket nobody can serve them from.
    """

    URL = "/api/system/{}/media-migration/"

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.iguzman.com.mx")

    @staticmethod
    def _user(username, system, *, is_admin=True, is_staff=False):
        # Written through the cached instance for the reason SiteBackupApiTests
        # documents: `save_user_profile` writes `instance.profile` back on every
        # User.save(), so a QuerySet.update() here would be silently undone.
        user = User.objects.create_user(username, password="pw")
        user.is_staff = is_staff
        user.save()
        user.profile.system = system
        user.profile.is_admin = is_admin
        user.profile.save()
        return user

    def test_a_customer_admin_cannot_reach_it(self):
        self.client.force_login(self._user("tenant", self.system))
        res = self.client.get(self.URL.format(self.system.pk))
        self.assertEqual(res.status_code, 403)

    def test_staff_cannot_reach_another_tenants_system(self):
        theirs = System.objects.create(site_name="Other", host="other.test")
        self.client.force_login(self._user("staff", self.system, is_staff=True))
        res = self.client.get(self.URL.format(theirs.pk))
        self.assertEqual(res.status_code, 404)

    @override_settings(R2_ACCOUNT_ID="acct", R2_PUBLIC_DOMAIN="cdn.example")
    def test_a_platform_host_targets_the_platform_bucket(self):
        self.client.force_login(self._user("staff", self.system, is_staff=True))
        data = self.client.get(self.URL.format(self.system.pk)).json()

        self.assertEqual(data["destination"], "platform")
        self.assertTrue(data["can_migrate"])
        self.assertEqual(data["destination_label"], "cdn.example")

    @override_settings(R2_ACCOUNT_ID="")
    def test_a_platform_host_is_blocked_without_platform_storage(self):
        self.client.force_login(self._user("staff", self.system, is_staff=True))
        data = self.client.get(self.URL.format(self.system.pk)).json()

        self.assertFalse(data["can_migrate"])
        self.assertEqual(data["blocked_reason"], "platform_unconfigured")

    @override_settings(R2_ACCOUNT_ID="acct")
    def test_an_own_domain_host_needs_its_own_bucket(self):
        """A customer's own domain must not fall back to the platform bucket.

        The platform bucket being configured is not permission to put someone
        else's media in it - the whole point of an own-domain site is that its
        assets and its bandwidth bill are theirs.
        """
        own = System.objects.create(site_name="Pan", host="elpanbueno.com")
        self.client.force_login(self._user("staff2", own, is_staff=True))

        data = self.client.get(self.URL.format(own.pk)).json()
        self.assertEqual(data["destination"], "tenant")
        self.assertFalse(data["can_migrate"])
        self.assertEqual(data["blocked_reason"], "tenant_unconfigured")

        # And the POST refuses too - the disabled button is a courtesy, not the
        # control.
        res = self.client.post(
            self.URL.format(own.pk),
            data=json.dumps({"offset": 0}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
