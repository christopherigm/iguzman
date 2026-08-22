"""Core tests - deliberately few.

One test per subsystem: a happy path and the refusals that cost something.
The two areas kept at full fidelity are the **tenant boundary** (an archive, a
slug, a bucket or a payload crossing from one customer to another) and anything
that decides which bucket a real file is written to. See `CLAUDE.md` ->
"Tests - keep the suite small" before adding to this file.
"""

import base64
import json
import math
import os
import pathlib
import shutil
import tempfile
import zipfile
from datetime import datetime, timedelta
from unittest import mock
from decimal import Decimal
from io import BytesIO, StringIO
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core import mail
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
    MenuSize,
    Product,
    ProductCategory,
)
from core import storage as storage_module
from core.backup import BackupError, restore_archive, write_archive
from core.models import (
    CATALOG_KINDS,
    KIND_LABEL_FIELDS,
    BookingResource,
    Branch,
    ContactMessage,
    Event,
    HomepageFlyer,
    ResourcePool,
    SiteBackup,
    SuccessStory,
    SuccessStoryImage,
    System,
    backup_upload_path,
    picture,
)
from core.services.contact import send_contact_message_reply
from core.services.email_badges import (
    BRANDMARK_CID,
    LOGO_CID,
    badge_context,
    brand_badges,
)
from core.tenant_paths import system_id_for, system_id_from_name
from core.serializers import BranchWriteSerializer, SystemWriteSerializer
from core.site_payload import serialize_system, apply_payload
from catalog.test_helpers import a_product_category, a_service_category
from orders.models import Booking, Order


class IsolatedMediaTestCase(TestCase):
    """A TestCase whose file writes land in a throwaway MEDIA_ROOT.

    Backup and image tests write real files, and `default_storage` points at the
    developer's own `media/` directory. Left unisolated they scatter fixtures
    through the same tree the local site serves from.
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


def make_admin(username, system, is_admin=True):
    """A tenant user, set up the way `users/signals.py` requires.

    Two receivers there shape this: `create_user_profile` makes the profile on
    User creation, and `save_user_profile` re-saves `instance.profile` on *every*
    `User.save()`. That second one is why the profile has to be written through
    the cached instance - a `QuerySet.update()` would be silently undone by the
    `last_login` save that `force_login` performs.
    """
    user = User.objects.create_user(username, password="pw")
    user.profile.system = system
    user.profile.is_admin = is_admin
    user.profile.save()
    return user


# --------------------------------------------------------------------------- #
# Publish (dev -> prod)
# --------------------------------------------------------------------------- #

class SitePayloadTests(TestCase):
    """`serialize_system` -> `apply_payload`, the whole content payload at once.

    The joints that break silently: the reusable Ingredient catalog re-linking by
    slug, an inheriting dish arriving **still inheriting** its category's sizes
    (exporting the resolved list would detach it on the far side), the two
    datetimes that survive a JSON round-trip by hand, and the tenant's own kind
    labels.
    """

    def test_a_publish_round_trip_carries_the_catalog_events_and_labels(self):
        source = System.objects.create(
            site_name="Bakery", host="bakery.test",
            kind_label_product="Nuestra tienda", en_kind_label_product="Our shop",
        )
        butter = Ingredient.objects.create(
            system=source, name="Butter", slug="butter", unit="g",
            nutrition_basis_quantity=Decimal("100"), calories=Decimal("717"),
            total_fat=Decimal("81"),
        )
        breads = MenuCategory.objects.create(system=source, name="Breads", slug="breads")
        inheriting = MenuItem.objects.create(
            system=source, category=breads, name="Banana Bread",
            slug="banana-bread", price=Decimal("5.00"),
        )
        overriding = MenuItem.objects.create(
            system=source, category=breads, name="Calzone",
            slug="calzone", price=Decimal("9.00"),
        )
        MenuItemIngredient.objects.create(
            menu_item=inheriting, ingredient=butter, quantity=Decimal("20"),
            unit="g", price=Decimal("0.00"), sort_order=0,
        )
        MenuSize.objects.create(
            category=breads, name="Chico", portion=Decimal("4"), unit="in",
            price_delta=Decimal("-1.00"), is_default=True, sort_order=0,
        )
        MenuSize.objects.create(
            category=breads, name="Grande", portion=Decimal("8"), unit="in",
            price_delta=Decimal("1.50"), sort_order=1,
        )
        MenuSize.objects.create(
            menu_item=overriding, name="Individual", price_delta=Decimal("-2.00"),
        )
        starts = timezone.now().replace(microsecond=0) + timedelta(days=10)
        Event.objects.create(
            system=source, name="Cata de cafe", slug="cata", starts_at=starts,
            ends_at=starts + timedelta(hours=2), timezone="America/Mexico_City",
            venue_name="Salon Azul", is_featured=True,
        )

        payload = serialize_system(source)

        # The ingredient rides as a catalog entry, referenced by slug.
        self.assertEqual(payload["ingredients"][0]["calories"], "717.00")
        exported = payload["menu_categories"][0]
        by_slug = {i["slug"]: i for i in exported["menu_items"]}
        self.assertEqual(by_slug["banana-bread"]["ingredients"][0]["ingredient"], "butter")
        self.assertEqual([s["name"] for s in exported["sizes"]], ["Chico", "Grande"])
        # An inheriting dish carries no size list of its own; an overriding one does.
        self.assertNotIn("sizes", by_slug["banana-bread"])
        self.assertEqual([s["name"] for s in by_slug["calzone"]["sizes"]], ["Individual"])

        # Cross the JSON boundary by hand - the two datetimes are the only fields
        # that have to survive an encode/decode.
        payload = json.loads(json.dumps(payload, default=str))
        payload["system"]["host"] = "bakery-prod.test"
        apply_payload(payload)

        target = System.objects.get(host="bakery-prod.test")
        self.assertEqual(target.kind_label_product, "Nuestra tienda")
        self.assertEqual(target.en_kind_label_product, "Our shop")

        restored = MenuItem.objects.get(system=target, slug="banana-bread")
        self.assertEqual([s.name for s in restored.effective_sizes], ["Chico", "Grande"])
        self.assertEqual(restored.default_size.name, "Chico")
        self.assertEqual(restored.price_for_selection([]), Decimal("4.00"))
        # `system` is derived from the owner - it scopes the row for backup and
        # decides which bucket its image lands in.
        self.assertEqual(restored.effective_sizes[0].system_id, target.pk)
        self.assertEqual(restored.ingredients.get().calories, 143)
        # Still an override on the far side: own rows replace the category's.
        self.assertEqual(
            [
                s.name
                for s in MenuItem.objects.get(
                    system=target, slug="calzone"
                ).effective_sizes
            ],
            ["Individual"],
        )

        event = target.events.get(slug="cata")
        self.assertEqual(event.starts_at, starts)
        self.assertEqual(event.ends_at, starts + timedelta(hours=2))
        self.assertEqual(event.timezone, "America/Mexico_City")
        self.assertTrue(event.is_featured)


# --------------------------------------------------------------------------- #
# Backup & restore
# --------------------------------------------------------------------------- #

class SiteBackupTests(IsolatedMediaTestCase):
    """A backup that does not restore what it saved is worse than no backup."""

    def _system(self, host="acme.test", name="Acme"):
        return System.objects.create(site_name=name, host=host)

    def _seed(self, system):
        cat = ProductCategory.objects.create(system=system, name="Tools", slug="tools")
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

    def test_a_round_trip_restores_rows_media_and_timestamps(self):
        """Everything `site_payload` deliberately drops, plus the three things
        that would fail silently: media inside the zip, the `auto_now_add`
        timestamps Django overwrites on save, and a `Booking.resource` that a
        wholesale replace would null out on every appointment.
        """
        system = self._system()
        _, product = self._seed(system)
        system.slogan = "Best tools in town"
        system.set_stripe_secret_key("sk_test_supersecret")
        system.save()

        order = Order.objects.create(
            system=system, total=Decimal("500.00"), subtotal=Decimal("500.00"),
        )
        placed_at = timezone.now() - timedelta(days=30)
        Order.objects.filter(pk=order.pk).update(created_at=placed_at)

        branch = Branch.objects.create(system=system, name="Marina", timezone="UTC")
        pool = ResourcePool.objects.create(branch=branch, name="Boats", unit_label="boat")
        BookingResource.objects.create(pool=pool, name="Panga", capacity=4)
        marlin = BookingResource.objects.create(pool=pool, name="Marlin", capacity=10)
        starts_at = timezone.now() + timedelta(days=3)
        Booking.objects.create(
            order=order, branch=branch, starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=4), timezone="UTC",
            duration_minutes=240, party_size=6,
            resource=marlin, resource_name="Marlin",
        )

        path, manifest = self._archive(system)

        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            raw = archive.read("data.json").decode()
        row = json.loads(raw)["catalog.product"][0]
        # Exactly what a backup is for and exactly what `site_payload` omits.
        self.assertEqual(row["sku"], "HAM-1")
        self.assertEqual(row["cost_price"], "7.50")
        self.assertEqual(row["stock_count"], 12)
        self.assertEqual(manifest["media_files"], 1)
        self.assertIn(f"media/{product.image.name}", names)
        # Secrets never travel: ciphertext is useless elsewhere and a leak here.
        self.assertNotIn("sk_test_supersecret", raw)
        self.assertNotIn("stripe_secret_key_encrypted", raw)

        system.slogan = "changed"
        system.save()
        Product.objects.all().delete()
        ProductCategory.objects.all().delete()
        Booking.objects.all().delete()
        Order.objects.all().delete()
        BookingResource.objects.all().delete()
        ResourcePool.objects.all().delete()

        restore_archive(system, path, ["system", "products", "images"], mode="replace")

        restored = Product.objects.get(slug="hammer")
        self.assertEqual(restored.sku, "HAM-1")
        self.assertEqual(restored.category.slug, "tools")
        self.assertEqual(restored.image.read(), b"not-a-real-png")

        system.refresh_from_db()
        self.assertEqual(system.slogan, "Best tools in town")
        # A restore never touches the live Stripe connection.
        self.assertEqual(system.stripe_secret_key, "sk_test_supersecret")

        self.assertEqual(Order.objects.get().created_at, placed_at)
        booking = Booking.objects.get()
        self.assertEqual(booking.party_size, 6)
        self.assertEqual(booking.resource.name, "Marlin")
        self.assertEqual(booking.resource.capacity, 10)
        self.assertEqual(booking.resource.pool.unit_label, "boat")

    def test_replace_and_merge_differ_on_rows_written_after_the_backup(self):
        system = self._system()
        cat, product = self._seed(system)
        path, _ = self._archive(system)

        def add_wrench():
            # The category is re-created by each restore, so it is looked up
            # rather than held from the fixture.
            return Product.objects.create(
                system=system, category=ProductCategory.objects.get(slug="tools"),
                name="Wrench", slug="wrench", price=Decimal("9.99"),
            )

        add_wrench()
        restore_archive(system, path, ["products"], mode="replace")
        self.assertFalse(Product.objects.filter(slug="wrench").exists())

        add_wrench()
        Product.objects.filter(slug="hammer").update(price=Decimal("99.00"))
        restore_archive(system, path, ["products"], mode="merge")
        self.assertTrue(Product.objects.filter(slug="wrench").exists())
        # Merge upserts, so an edited row reverts while the new one stays.
        self.assertEqual(Product.objects.get(slug="hammer").price, Decimal("19.99"))

        # Images off omits the media but keeps the data.
        path, manifest = self._archive(system, sections=("system", "products"))
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            data = json.loads(archive.read("data.json").decode())
        self.assertFalse([n for n in names if n.startswith("media/")])
        self.assertEqual(manifest["media_files"], 0)
        self.assertIsNone(data["catalog.product"][0]["image"])

    def test_the_tenant_boundary_holds(self):
        """The one bug in this feature that would leak one customer's data into
        another's site. Every case is kept.
        """
        source = self._system(host="acme.test")
        self._seed(source)
        path, _ = self._archive(source)

        # An archive whose manifest host is not the target's is refused outright.
        other = self._system(host="other.test", name="Other")
        with self.assertRaises(BackupError):
            restore_archive(other, path, ["system", "products"], mode="replace")
        self.assertFalse(Product.objects.filter(system=other).exists())

        # Slugs are globally unique while tenants are not, so an unscoped
        # update_or_create would hand one customer another's row.
        Product.objects.filter(system=source).delete()
        squatter = self._system(host="squatter.test", name="Squatter")
        theirs = Product.objects.create(
            category=a_product_category(squatter),
            system=squatter, name="Their hammer", slug="hammer", price=Decimal("1.00"),
        )
        restore_archive(source, path, ["products"], mode="merge")
        theirs.refresh_from_db()
        self.assertEqual(theirs.system_id, squatter.pk)
        self.assertEqual(theirs.name, "Their hammer")

        # And a section the archive does not carry cannot be restored from it.
        thin, _ = self._archive(source, sections=("system",))
        with self.assertRaises(BackupError):
            restore_archive(source, thin, ["products"], mode="replace")


class SiteBackupApiTests(IsolatedMediaTestCase):
    """The endpoints behind the CMS's Backup & Restore section."""

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.user = make_admin("admin", self.system)
        cat = ProductCategory.objects.create(
            system=self.system, name="Tools", slug="tools",
        )
        Product.objects.create(
            system=self.system, category=cat, name="Hammer", slug="hammer",
            price=Decimal("19.99"),
        )
        self.client.force_login(self.user)

    def _create(self, sections=("system", "products", "images")):
        return self.client.post(
            "/api/backups/",
            data=json.dumps({"name": "Nightly", "sections": list(sections)}),
            content_type="application/json",
        )

    def test_create_list_download_restore_and_delete(self):
        created = self._create()
        self.assertEqual(created.status_code, 201, created.content)
        body = created.json()
        self.assertGreater(body["size_bytes"], 0)

        listed = self.client.get("/api/backups/")
        self.assertEqual(len(listed.json()), 1)
        # The archive's own URL must never be published - only the guarded
        # download endpoint, which checks ownership.
        self.assertNotIn("file", listed.json()[0])

        download = self.client.get(f"/api/backups/{body['id']}/download/")
        self.assertEqual(download["Content-Type"], "application/zip")
        payload = b"".join(download.streaming_content)
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            self.assertIn("manifest.json", archive.namelist())

        Product.objects.all().delete()
        restored = self.client.post(
            "/api/backups/restore/",
            data={
                "file": SimpleUploadedFile("b.zip", payload, "application/zip"),
                "sections": "system,products,images",
                "mode": "replace",
            },
        )
        self.assertEqual(restored.status_code, 200, restored.content)
        self.assertTrue(Product.objects.filter(slug="hammer").exists())

        path = SiteBackup.objects.get(pk=body["id"]).file.path
        self.assertEqual(self.client.delete(f"/api/backups/{body['id']}/").status_code, 204)
        self.assertFalse(os.path.exists(path))

    def test_only_this_tenants_admin_can_reach_a_backup(self):
        """A missed `.filter(system=...)` here hands one customer another's
        entire database."""
        mine = self._create().json()

        self.client.force_login(make_admin("shopper", self.system, is_admin=False))
        self.assertEqual(self.client.get("/api/backups/").status_code, 403)
        self.assertEqual(self._create().status_code, 403)

        other_system = System.objects.create(site_name="Other", host="other.test")
        self.client.force_login(make_admin("other", other_system))
        self.assertEqual(self.client.get("/api/backups/").json(), [])
        self.assertEqual(
            self.client.get(f"/api/backups/{mine['id']}/download/").status_code, 404
        )
        self.assertEqual(
            self.client.delete(f"/api/backups/{mine['id']}/").status_code, 404
        )


# --------------------------------------------------------------------------- #
# Tenant paths & storage routing
# --------------------------------------------------------------------------- #

class TenantStorageTests(IsolatedMediaTestCase):
    """The upload path is the routing key, so its shape is load-bearing.

    `core.storage` decides which R2 bucket a file belongs to by reading the
    system id back out of the file's own name. A wrong answer writes a real file
    into someone else's real bucket, with nothing in the logs.
    """

    def setUp(self):
        self.system = System.objects.create(
            site_name="Pan", host="pan.test",
            storage_enabled=True, storage_account_id="acct",
            storage_access_key_id="key", storage_bucket_name="pan-media",
            storage_public_domain="cdn.pan.test",
        )
        self.system.set_storage_secret_access_key("s3cret")
        self.system.save()
        storage_module.forget_system()
        self.addCleanup(storage_module.forget_system)

    def test_every_upload_path_names_its_tenant_and_parses_back(self):
        product = Product.objects.create(
            category=a_product_category(self.system),
            name="Loaf", slug="loaf", system=self.system,
        )
        name = picture(product, "photo.png")
        self.assertTrue(name.startswith(f"t/{self.system.pk}/pictures/product/"))
        self.assertEqual(system_id_from_name(name), self.system.pk)

        # A child row resolves its tenant through its parent (`story__system`),
        # and the System is its own tenant.
        story = SuccessStory.objects.create(name="S", slug="s", system=self.system)
        image = SuccessStoryImage(story=story)
        self.assertEqual(system_id_for(image), self.system.pk)
        self.assertEqual(system_id_from_name(picture(image, "x.jpg")), self.system.pk)
        self.assertEqual(system_id_for(self.system), self.system.pk)

        backup = SiteBackup(system=self.system, name="nightly")
        archive = backup_upload_path(backup, "nightly.zip")
        self.assertTrue(archive.startswith(f"t/{self.system.pk}/backups/"))
        self.assertEqual(system_id_from_name(archive), self.system.pk)

        # ⚠ `MenuSize.system` is derived in save() while every seed/publish path
        # attaches the file with `save=False` beforehand - an order of operations
        # that silently files the photo on the platform bucket.
        size = MenuSize(
            category=MenuCategory.objects.create(
                system=self.system, name="Breads", slug="breads",
            ),
            system=self.system, name="Chico",
        )
        size.image.save("chico.jpg", ContentFile(b"x"), save=False)
        size.save()
        self.assertTrue(size.image.name.startswith(f"t/{self.system.pk}/"), size.image.name)

        # Legacy paths and unresolvable rows fall to the platform rather than
        # being mis-read as a tenant's, or failing the write.
        for legacy in ("pictures/product/ab12.jpg", "profile_pictures/user_3/me.jpg", ""):
            self.assertIsNone(system_id_from_name(legacy))
        orphan = Product(name="No home", slug="no-home")
        self.assertIsNone(system_id_for(orphan))

    def test_the_router_sends_each_file_to_the_bucket_its_name_names(self):
        backend = storage_module.tenant_storage(self.system.pk)
        self.assertEqual(backend.bucket_name, "pan-media")
        # A public domain means plain unsigned URLs - the point of the CDN.
        self.assertEqual(backend.custom_domain, "cdn.pan.test")
        self.assertFalse(backend.querystring_auth)

        # The whole design in one assertion: no request, no thread-local - the
        # file's own name decides. A legacy path and another tenant's path both
        # fall to the platform.
        router = storage_module.TenantMediaStorage()
        platform = storage_module.platform_storage()
        self.assertEqual(
            router.backend_for(f"t/{self.system.pk}/pictures/product/a.jpg").bucket_name,
            "pan-media",
        )
        self.assertIs(router.backend_for("pictures/product/a.jpg"), platform)
        self.assertIs(router.backend_for("t/9999/pictures/a.jpg"), platform)

        # Without this a worker keeps writing to the old bucket for up to a
        # minute after the operator changes the credentials.
        self.system.storage_bucket_name = "renamed"
        self.system.save()  # the post_save receiver clears the memo
        self.assertEqual(
            storage_module.tenant_storage(self.system.pk).bucket_name, "renamed"
        )

    def test_an_unusable_config_serves_from_the_platform(self):
        """Never a 500: `url()` runs once per image per page render, so every
        degradation here has to fall back rather than raise."""
        from django.db import DatabaseError

        # A half-filled form must not start writing to an unreachable bucket.
        self.system.storage_bucket_name = ""
        self.system.save()
        storage_module.forget_system()
        self.assertIsNone(storage_module.tenant_storage(self.system.pk))
        self.assertFalse(self.system.storage_configured)

        self.system.storage_bucket_name = "pan-media"
        self.system.storage_enabled = False
        self.system.save()
        storage_module.forget_system()
        self.assertIsNone(storage_module.tenant_storage(self.system.pk))

        # Ciphertext from another environment, or after a key rotation.
        self.system.storage_enabled = True
        self.system.storage_secret_access_key_encrypted = "not-a-fernet-token"
        self.system.save()
        storage_module.forget_system()
        with self.assertLogs("core.storage", level="ERROR"):
            self.assertIsNone(storage_module.tenant_storage(self.system.pk))

        # And a database hiccup - most realistically between a deploy and its
        # migration - must not 500 every page that shows a picture.
        storage_module.forget_system()
        with mock.patch.object(
            System.objects.__class__, "filter",
            side_effect=DatabaseError("no such column"),
        ):
            with self.assertLogs("core.storage", level="ERROR"):
                self.assertIsNone(storage_module.tenant_storage(self.system.pk))


# --------------------------------------------------------------------------- #
# Events
# --------------------------------------------------------------------------- #

class EventTests(TestCase):
    """When an event is past, and where it happens.

    **An all-day event must not retire on the morning it happens.** It is stored
    at midnight, so any naive "has the start passed?" check drops it from the site
    one minute into the day it runs on. And the location resolves across the
    branch field by field, so naming a hall inside the shop does not un-map it.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(
            system=self.system, name="Centro", address="Av. Juarez 100",
            latitude=Decimal("19.43260000"), longitude=Decimal("-99.13320000"),
        )

    def _event(self, **kwargs):
        kwargs.setdefault("system", self.system)
        kwargs.setdefault("starts_at", timezone.now() + timedelta(days=3))
        kwargs.setdefault("name", "Tasting")
        return Event.objects.create(**kwargs)

    def test_when_an_event_is_past_and_where_it_happens(self):
        midnight = timezone.localtime(timezone.now()).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        self.assertFalse(self._event(starts_at=midnight, is_all_day=True).is_past)
        self.assertTrue(
            self._event(starts_at=midnight - timedelta(days=2), is_all_day=True).is_past
        )

        now = timezone.now()
        self.assertTrue(self._event(starts_at=now - timedelta(minutes=1)).is_past)
        self.assertFalse(self._event(starts_at=now + timedelta(minutes=1)).is_past)
        self.assertTrue(
            self._event(
                starts_at=now - timedelta(hours=3), ends_at=now - timedelta(minutes=1),
            ).is_past
        )

        # An all-day event ends at midnight *where it happens*: the same stored
        # instant is a different calendar day in each zone.
        mx_zone = ZoneInfo("America/Mexico_City")
        local_midnight = datetime(2026, 8, 5, tzinfo=mx_zone)
        mx = self._event(
            starts_at=local_midnight, is_all_day=True, timezone="America/Mexico_City",
        )
        utc = self._event(starts_at=local_midnight, is_all_day=True, timezone="UTC")
        self.assertEqual(mx.effective_end, datetime(2026, 8, 6, tzinfo=mx_zone))
        self.assertGreater(mx.effective_end, utc.effective_end)

        # A row written before the validator existed must not 500 every page.
        stray = self._event()
        Event.objects.filter(pk=stray.pk).update(timezone="Mars/Olympus")
        stray.refresh_from_db()
        self.assertIsNotNone(stray.effective_end)

        # Location: the branch fills the gaps, the event's own value wins per
        # field, and a one-off place needs no branch at all.
        at_branch = self._event(branch=self.branch, venue_name="Salon Azul")
        self.assertEqual(at_branch.effective_venue_name, "Salon Azul")
        self.assertEqual(at_branch.effective_address, "Av. Juarez 100")
        self.assertEqual(at_branch.effective_longitude, Decimal("-99.13320000"))
        one_off = self._event(venue_name="Parque Mexico", address="Av. Mexico s/n")
        self.assertEqual(one_off.effective_venue_name, "Parque Mexico")
        self.assertIsNone(one_off.effective_latitude)

    def test_the_public_list_is_scoped_ordered_and_addressable(self):
        other = System.objects.create(site_name="Rival", host="rival.test")
        now = timezone.now()
        Event.objects.create(
            system=self.system, name="Next week", slug="next-week",
            starts_at=now + timedelta(days=7),
        )
        soon = Event.objects.create(
            system=self.system, name="Tomorrow", slug="tomorrow",
            starts_at=now + timedelta(days=1), branch=self.branch,
        )
        Event.objects.create(
            system=self.system, name="Last month", slug="last-month",
            starts_at=now - timedelta(days=30),
        )
        Event.objects.create(
            system=self.system, name="Draft", slug="draft",
            starts_at=now + timedelta(days=2), enabled=False,
        )
        Event.objects.create(
            system=other, name="Theirs", slug="theirs", starts_at=now + timedelta(days=1),
        )

        def get(url):
            return self.client.get(url, HTTP_X_WEBSITE_HOST="acme.test")

        self.assertEqual(
            [e["slug"] for e in get("/api/events/?scope=upcoming").json()],
            ["tomorrow", "next-week"],
        )
        self.assertEqual(
            [e["slug"] for e in get("/api/events/?scope=past").json()], ["last-month"],
        )
        slugs = [e["slug"] for e in get("/api/events/").json()]
        self.assertNotIn("draft", slugs)      # unfinished content stays private
        self.assertNotIn("theirs", slugs)     # and so does another tenant's
        # A limit is capped rather than trusted, and nonsense is ignored.
        self.assertEqual(len(get("/api/events/?scope=upcoming&limit=1").json()), 1)
        self.assertEqual(get("/api/events/?limit=banana").status_code, 200)

        self.assertEqual(get("/api/events/slug/tomorrow/").status_code, 200)
        self.assertEqual(get("/api/events/slug/theirs/").status_code, 404)
        self.assertEqual(get("/api/events/slug/draft/").status_code, 404)

        data = get("/api/events/slug/tomorrow/").json()
        self.assertEqual(data["venue_name"], "Centro")
        self.assertEqual(data["address"], "Av. Juarez 100")
        # The raw column stays blank - it is what the CMS form edits.
        self.assertIsNone(data["own_venue_name"])
        self.assertFalse(data["is_past"])
        self.assertEqual(soon.slug, "tomorrow")


# --------------------------------------------------------------------------- #
# Homepage flyers
# --------------------------------------------------------------------------- #

class HomepageFlyerTests(TestCase):
    """The one thing a flyer decides for itself: which items it may carry.

    Everything else about the model is the ordinary tenant-scoped picture-list
    shape `CompanyHighlight` already covers. What is specific is the `items` JSON
    column - a hand-typed blob is the only way a malformed ref reaches the
    landing, where the frontend resolves it against the live catalog - and the
    per-row band, whose three columns are the reason this is a model instead of
    more `System.spotlight_*` fields.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def test_a_flyer_carries_at_most_three_items_and_its_own_band(self):
        self.client.force_login(make_admin("boss", self.system))

        res = self.client.post(
            "/api/homepage-flyers/",
            {
                "system": self.system.id,
                "name": "Combo",
                "items": [
                    {"kind": "product", "id": 3},
                    {"kind": "food", "id": 7},
                    {"kind": "service", "id": 9},
                ],
                "image_side": "right",
                "background": "linear-gradient(#fff, #000)",
                "top_divider": "wave",
                "bottom_divider": "arches",
            },
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(
            body["items"],
            [
                {"kind": "product", "id": 3},
                {"kind": "food", "id": 7},
                {"kind": "service", "id": 9},
            ],
        )
        self.assertEqual(body["image_side"], "right")
        self.assertEqual(body["top_divider"], "wave")

        # A fourth item, and a family that is not one of the three, are the two
        # ways a hand-typed blob goes wrong.
        for items in (
            [{"kind": "product", "id": i} for i in (1, 2, 3, 4)],
            [{"kind": "widget", "id": 1}],
        ):
            res = self.client.post(
                "/api/homepage-flyers/",
                {"system": self.system.id, "name": "Bad", "items": items},
                content_type="application/json",
            )
            self.assertEqual(res.status_code, 400, res.content)

        # An unpublished flyer is on the CMS's list and off the public one - the
        # landing renders whatever this endpoint answers, with no `enabled` check
        # of its own.
        HomepageFlyer.objects.create(system=self.system, name="Draft", enabled=False)
        cache.clear()
        res = self.client.get("/api/homepage-flyers/", HTTP_X_WEBSITE_HOST="acme.test")
        self.assertEqual([f["name"] for f in res.json()], ["Combo"])


# --------------------------------------------------------------------------- #
# System settings & branch writes
# --------------------------------------------------------------------------- #

class SystemSettingsTests(TestCase):
    """The basemap a tenant picks, and what it calls the families it sells.

    `map_style` is the one map setting with a closed vocabulary, and an unknown
    id is worse than a refused save: the frontend falls back to OSM, so a typo
    looks exactly like the setting being ignored. The kind labels are
    display-only, so what matters is the seams - the hand-written serializer
    lists that have to agree with `KIND_LABEL_FIELDS`.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Piccolo", host="piccolo.test")

    def _save(self, data):
        serializer = SystemWriteSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(self.system)
        self.system.refresh_from_db()

    def test_the_basemap_round_trips_and_refuses_an_unknown_style(self):
        fresh = self.client.get("/api/system/", HTTP_X_WEBSITE_HOST="piccolo.test").json()
        self.assertEqual(fresh["map_style"], "osm")
        self.assertEqual(fresh["map_tile_url"], "")
        self.assertEqual(fresh["map_attribution"], "")

        self._save({
            "map_style": "custom",
            "map_tile_url": "https://tiles.example.com/{z}/{x}/{y}.png?key=abc",
            "map_attribution": "(c) Example Tiles",
            "map_attribution_url": "https://example.com/attribution/",
        })
        self.assertEqual(self.system.map_style, "custom")
        self.assertEqual(
            self.system.map_tile_url, "https://tiles.example.com/{z}/{x}/{y}.png?key=abc",
        )
        self.assertEqual(self.system.map_attribution, "(c) Example Tiles")

        self.assertFalse(SystemWriteSerializer(data={"map_style": "google"}).is_valid())

        # Half-filled is the normal state of a form somebody experimented with:
        # a leftover custom URL under a built-in style still saves.
        self._save({
            "map_style": "carto-light",
            "map_tile_url": "https://tiles.example.com/{z}/{x}/{y}.png",
        })
        self.assertEqual(self.system.map_style, "carto-light")

    def test_kind_labels_are_writable_public_clearable_and_travel(self):
        # A menu carries no labels - it is sectioned by the tenant's own
        # MenuCategory rows, which are already their own copy.
        self.assertEqual(set(CATALOG_KINDS), {"product", "service"})

        declared = SystemWriteSerializer().fields
        public = self.client.get(
            "/api/system/", HTTP_X_WEBSITE_HOST="piccolo.test",
        ).json()
        for field in KIND_LABEL_FIELDS:
            self.assertIn(field, declared)
            self.assertIn(field, public)
            self.assertIn(public[field], (None, ""))

        self._save({
            "kind_label_product": "Nuestra tienda",
            "en_kind_label_product": "Our shop",
            "kind_label_service": "Lo que hacemos",
        })
        self.assertEqual(self.system.kind_label_product, "Nuestra tienda")

        payload = serialize_system(self.system)
        payload["system"]["host"] = "piccolo-prod.test"
        apply_payload(payload)
        target = System.objects.get(host="piccolo-prod.test")
        self.assertEqual(target.en_kind_label_product, "Our shop")
        self.assertEqual(target.kind_label_service, "Lo que hacemos")

        # Blank has to be storable, not refused: it is the only way back to the
        # frontend's own translation once a tenant has typed a label.
        self._save({"kind_label_product": ""})
        self.assertEqual(self.system.kind_label_product, "")


class BranchWriteTests(IsolatedMediaTestCase):
    """⚠ "Omitted means leave it, blank means clear it" - and it matters more on
    `map_image` than anywhere else, because the CMS only sends the field when the
    pin actually moved. Were an omitted field to clear the column, a tenant's
    booking emails would lose their map the first time anyone edited the phone
    number.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.branch = Branch.objects.create(system=self.system, name="Marina")

    def _data_url(self):
        """A 2x2 JPEG, base64'd as the CMS's canvas hands one over."""
        buffer = BytesIO()
        Image.new("RGB", (2, 2), "white").save(buffer, format="JPEG")
        return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()

    def _save(self, payload):
        serializer = BranchWriteSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save(self.branch)
        self.branch.refresh_from_db()

    def test_an_omitted_field_is_left_alone_and_a_blank_one_clears_it(self):
        self._save({
            "latitude": "22.88", "longitude": "-109.9",
            "map_image": self._data_url(),
            "location_details": "Porton azul junto a la gasolinera",
            "en_location_details": "Blue gate beside the fuel dock",
        })
        stored = self.branch.map_image.name
        # Tenant-prefixed like every other file, so it follows a customer to its
        # own R2 bucket.
        self.assertTrue(stored.startswith(f"t/{self.system.pk}/"))

        row = self.client.get("/api/branches/", HTTP_X_WEBSITE_HOST="acme.test").json()[0]
        self.assertIn("branchmap", row["map_image"])
        self.assertEqual(row["en_location_details"], "Blue gate beside the fuel dock")

        # An ordinary save - a changed phone number - sends neither field.
        self._save({"phone": "+52 000"})
        self.assertEqual(self.branch.map_image.name, stored)
        self.assertEqual(self.branch.en_location_details, "Blue gate beside the fuel dock")

        # Clearing the pin has to clear the picture: a map of nowhere is worse
        # than no map.
        self._save({"latitude": None, "longitude": None, "map_image": ""})
        self.assertFalse(self.branch.map_image)


class ContactChannelTests(TestCase):
    """A customer reaches the tenant by email **or** WhatsApp.

    Two rules make the choice safe: a message must carry at least one way to
    answer it, and a reply must never be recorded against a channel the customer
    left no address for. The WhatsApp reply path is asymmetric on purpose - it
    records without sending, because the send happens in the admin's own
    WhatsApp.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def _post(self, **body):
        return self.client.post(
            "/api/contact-messages/", data=json.dumps(body),
            content_type="application/json", HTTP_X_WEBSITE_HOST="acme.test",
        )

    def test_a_message_needs_one_address_and_the_preference_follows_it(self):
        make_admin("admin", self.system)
        User.objects.filter(username="admin").update(email="admin@acme.test")

        res = self._post(name="Ana", phone="+52 155 1234 5678", message="Hola")
        self.assertEqual(res.status_code, 201, res.content)
        msg = ContactMessage.objects.get(pk=res.json()["id"])
        self.assertEqual(msg.email, "")
        # With only one address given, the preference follows it rather than
        # defaulting to a channel the customer cannot be reached on.
        self.assertEqual(msg.preferred_channel, ContactMessage.CHANNEL_WHATSAPP)
        # `reply_to` used to be `[message.email]`; an empty entry is a malformed
        # header, so a WhatsApp-only sender broke the admin notice.
        self.assertEqual(len(mail.outbox), 1)
        self.assertTrue(all(mail.outbox[0].reply_to))

        # A body may ask for WhatsApp without leaving a number - honouring it
        # would file the message under a channel nobody can answer on.
        res = self._post(
            name="Ana", email="ana@example.com", preferred_channel="whatsapp",
            message="Hola",
        )
        self.assertEqual(
            ContactMessage.objects.get(pk=res.json()["id"]).preferred_channel,
            ContactMessage.CHANNEL_EMAIL,
        )

        self.assertEqual(self._post(name="Ana", message="Hola").status_code, 400)
        self.assertEqual(ContactMessage.objects.count(), 2)

    def test_a_reply_is_recorded_only_on_a_channel_that_has_an_address(self):
        msg = ContactMessage.objects.create(
            system=self.system, name="Ana", email="", phone="5551234567",
            preferred_channel=ContactMessage.CHANNEL_WHATSAPP, message="Hola",
        )
        self.client.force_login(make_admin("admin", self.system))
        mail.outbox.clear()

        res = self.client.post(
            f"/api/contact-messages/admin/{msg.pk}/reply/",
            data=json.dumps({"body": "Claro que si", "channel": "whatsapp"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200, res.content)
        msg.refresh_from_db()
        self.assertEqual(msg.reply_channel, ContactMessage.CHANNEL_WHATSAPP)
        self.assertIsNotNone(msg.replied_at)
        self.assertTrue(msg.is_read)
        # The admin's own WhatsApp sends it - this endpoint must not mail anyone.
        self.assertEqual(mail.outbox, [])

        res = self.client.post(
            f"/api/contact-messages/admin/{msg.pk}/reply/",
            data=json.dumps({"body": "Hi", "channel": "email"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)


class EmailBadgeTests(IsolatedMediaTestCase):
    """The tenant's mark, composited onto a white disc for the branded emails.

    One test, because the whole feature is one guarantee with a silent failure
    mode: whatever a tenant uploaded, the recipient sees it on white, inside a
    circle, in a mail client that may be forcing dark mode. If any half of that
    breaks - the disc, the fit, or the `cid` wiring - the symptom is an ugly or
    blank header in every transactional email and nothing in the logs.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    @staticmethod
    def _upload(width, height):
        """An opaque rectangle - the worst case for fitting a mark in a circle."""
        buffer = BytesIO()
        Image.new("RGBA", (width, height), (10, 10, 10, 255)).save(buffer, "PNG")
        return ContentFile(buffer.getvalue())

    def test_the_mark_is_always_white_backed_round_and_inside_the_circle(self):
        self.system.img_logo.save("logo.png", self._upload(400, 120), save=True)
        self.system.img_brandmark.save("mark.png", self._upload(256, 256), save=True)

        badges = brand_badges(self.system)
        self.assertEqual(set(badges), {LOGO_CID, BRANDMARK_CID})
        self.assertEqual(
            badge_context(self.system),
            {"logo_cid": LOGO_CID, "brandmark_cid": BRANDMARK_CID},
        )

        for cid, png in badges.items():
            image = Image.open(BytesIO(png))
            size = image.width
            # Square by construction: this is what a client cannot stretch into
            # an oval, however it decides to size the `<img>`.
            self.assertEqual(image.size, (size, size), cid)
            # Clear at the corners, so the same badge sits on the coloured
            # header and on the white body alike.
            self.assertEqual(image.getpixel((0, 0))[3], 0, cid)

            centre, radius = (size - 1) / 2, size / 2
            pixels = image.load()
            see_through, outside, white = [], [], 0
            for y in range(size):
                for x in range(size):
                    alpha = pixels[x, y][3]
                    distance = math.hypot(x - centre, y - centre)
                    # Nothing drawn escapes the disc. A wide wordmark and a
                    # square emblem fail this in opposite directions, which is
                    # why the two uploads above are the shapes they are.
                    if alpha > 8 and distance > radius + 1:
                        outside.append((x, y))
                    # And nothing inside it is see-through: a transparent hole
                    # is where the recipient's dark background would show.
                    # (Kept clear of the rim itself, which is antialiased.)
                    elif distance < radius - 4 and alpha < 250:
                        see_through.append((x, y))
                    elif pixels[x, y] == (255, 255, 255, 255):
                        white += 1
            self.assertEqual(outside, [], cid)
            self.assertEqual(see_through, [], cid)
            self.assertGreater(white, 0, cid)

        # And they reach the recipient: inline parts under `multipart/related`,
        # which is what lets a client resolve the `cid:` the template renders.
        message = ContactMessage.objects.create(
            system=self.system, name="Ana", email="ana@example.com", message="Hola",
        )
        send_contact_message_reply(message, "Claro que si")
        parts = {
            part.get("Content-ID"): part
            for part in mail.outbox[0].message().walk()
            if part.get("Content-ID")
        }
        self.assertEqual(set(parts), {f"<{LOGO_CID}>", f"<{BRANDMARK_CID}>"})
        for part in parts.values():
            self.assertEqual(part.get_content_type(), "image/png")
            self.assertIn("inline", part.get("Content-Disposition"))
        html = [
            p.get_payload(decode=True).decode()
            for p in mail.outbox[0].message().walk()
            if p.get_content_type() == "text/html"
        ][0]
        self.assertIn(f"cid:{LOGO_CID}", html)
        self.assertIn(f"cid:{BRANDMARK_CID}", html)

        # A tenant with no brandmark drops the sign-off block rather than
        # repeating the header logo at the foot of the email.
        self.system.img_brandmark.delete(save=True)
        cache.clear()
        self.assertIsNone(badge_context(self.system)["brandmark_cid"])

# --------------------------------------------------------------------------- #
# Stock photography and the credit it owes
# --------------------------------------------------------------------------- #

class StockImageTests(IsolatedMediaTestCase):
    """The credit a bank photo carries, from the fetch to the footer.

    A break anywhere in the chain shows up as a seeded site whose photos are
    right and whose attribution is empty - which reads as working right up until
    someone checks whether the site may legally use them.
    """

    def setUp(self):
        cache.clear()
        self.system = System.objects.create(site_name="Acme", host="acme.test")

    def _jpeg(self, colour="white"):
        buffer = BytesIO()
        Image.new("RGB", (4, 4), colour).save(buffer, format="JPEG")
        return ContentFile(buffer.getvalue(), name="shot.jpg")

    def test_the_count_derives_its_models_and_stays_inside_one_tenant(self):
        from core.stock_images import attributed_specs, stock_image_count

        # The model list comes from `core.backup.MODEL_SPECS`, never a hand-
        # written tuple, so a model somebody adds later is covered for free.
        labels = {spec.label for spec in attributed_specs()}
        for expected in (
            "core.SuccessStory", "core.CompanyHighlight", "catalog.Product",
            "catalog.MenuItem", "catalog.MenuCategory", "catalog.MenuItemImage",
        ):
            self.assertIn(expected, labels)

        self.assertEqual(stock_image_count(self.system), 0)
        self.system.img_hero_attribution = "Photo by A on Pexels"
        self.system.save()

        # The footer's credit is gated on a payload cached for an hour, so the
        # receiver is what stops a site crediting a bank whose last photo was
        # replaced fifty minutes ago.
        cache.set(f"system:host:{self.system.host}", {"stale": True}, 3600)
        SuccessStory.objects.create(
            system=self.system, slug="s1", name="One",
            attribution="Photo by B on Pexels",
        )
        self.assertIsNone(cache.get(f"system:host:{self.system.host}"))

        # An uncredited row is our own placeholder and must not be counted.
        SuccessStory.objects.create(system=self.system, slug="s2", name="Two")
        self.assertEqual(stock_image_count(self.system), 2)

        other = System.objects.create(site_name="Other", host="other.test")
        SuccessStory.objects.create(
            system=other, slug="o1", name="Theirs", attribution="Photo by C on Pexels",
        )
        self.assertEqual(stock_image_count(self.system), 2)
        self.assertEqual(stock_image_count(other), 1)

    def test_an_archive_fills_an_empty_image_and_never_clobbers_one(self):
        """`export_site --images` -> `apply_payload(images=...)`. Fill-don't-
        clobber is what stops a customer's own upload being overwritten by the
        next content publish."""
        from core.site_payload import ImageArchive, media_names

        story = SuccessStory.objects.create(
            system=self.system, slug="acme-story", name="A win",
            attribution="Photo by A on Pexels",
            attribution_url="https://www.pexels.com/photo/1/",
        )
        story.image.save("shot.jpg", self._jpeg(), save=True)

        payload = serialize_system(self.system)
        # The payload names the file; it never carries its bytes.
        self.assertEqual(payload["success_stories"][0]["image_file"], story.image.name)
        self.assertNotIn("image_data", payload["success_stories"][0])

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            for name in media_names(payload):
                with default_storage.open(name, "rb") as fh:
                    archive.writestr(name, fh.read())
        buffer.seek(0)

        # Every content slug is globally unique, so the source has to stand down
        # for this to be a faithful dev -> prod rehearsal rather than a move.
        self.system.delete()
        payload["system"]["host"] = "target.test"

        apply_payload(payload, images=ImageArchive(zipfile.ZipFile(buffer)))
        published = SuccessStory.objects.get(slug="acme-story")
        self.assertTrue(published.image)
        self.assertEqual(published.attribution, "Photo by A on Pexels")
        # Filed under the basename, not the source tenant's `t/<id>/` prefix -
        # reusing it would file the photo under whatever System holds that id
        # in production.
        self.assertNotIn("acme.test", published.image.name)

        # Re-publishing over the customer's own replacement leaves it alone.
        published.image.save("customer.jpg", self._jpeg("black"), save=True)
        kept = published.image.name
        buffer.seek(0)
        apply_payload(payload, images=ImageArchive(zipfile.ZipFile(buffer)))
        published.refresh_from_db()
        self.assertEqual(published.image.name, kept)

        # A missing archive member is skipped, not raised: storage is remote and
        # a row can outrun its upload. Publishing 59 of 60 beats a 500.
        SuccessStory.objects.all().delete()
        empty = BytesIO()
        with zipfile.ZipFile(empty, "w"):
            pass
        empty.seek(0)
        apply_payload(payload, images=ImageArchive(zipfile.ZipFile(empty)))
        blank = SuccessStory.objects.get(slug="acme-story")
        self.assertFalse(blank.image)
        # The credit still travels - it is text, and it has to be there the
        # moment an image is.
        self.assertEqual(blank.attribution, "Photo by A on Pexels")

    def test_seeding_credits_the_bank_and_an_upload_clears_it(self):
        """`fetch_seed_images` -> brief -> `seed_site` -> a customer's own upload.

        The credits sidecar has to be keyed by exactly the string the rewritten
        brief now holds, and `_apply_attribution` has to persist itself with its
        own UPDATE - every caller saves with `update_fields=["image"]`, which
        would silently discard an in-memory change.
        """
        from django.core.management import call_command
        from core.serializers import ImageProcessingSerializer
        from core.stock_images import stock_image_count

        assets = tempfile.mkdtemp(prefix="seed-assets-")
        self.addCleanup(shutil.rmtree, assets, ignore_errors=True)
        buffer = BytesIO()
        Image.new("RGB", (4, 4), "grey").save(buffer, format="JPEG")
        # `_resolve_asset` needs a pool to fall back to, as seed_assets/ has.
        (pathlib.Path(assets) / "placeholder-1.jpg").write_bytes(buffer.getvalue())

        brief = pathlib.Path(assets) / "brief.json"
        brief.write_text(json.dumps({
            "system": {"host": "tortas.test", "site_name": "Tortas"},
            "menu_categories": [{
                "name": "Las Tradicionales",
                "image_query": "mexican sandwich shop counter",
                # The whole point of the field: the dish is a ham-and-pineapple
                # torta, and its name is a place.
                "menu_items": [{
                    "name": "Hawaiana",
                    "image_query": "ham and pineapple sandwich",
                    "price": "65.00",
                }],
            }],
        }))

        from core.services.image_banks import Photo

        seen = []

        def fake_search(query, **kwargs):
            seen.append(query)
            n = len(seen)
            return Photo(
                bank="pexels", bank_id=str(n),
                download_url=f"https://example.test/{n}.jpg",
                attribution=f"Photo by P{n} on Pexels",
                attribution_url=f"https://www.pexels.com/photo/{n}/",
                alt="a sandwich",
            )

        def fake_download(photo, dest):
            out = BytesIO()
            Image.new("RGB", (8, 8), "white").save(out, format="JPEG")
            pathlib.Path(dest).write_bytes(out.getvalue())

        with mock.patch(
            "core.management.commands.fetch_seed_images.search_photo", fake_search
        ), mock.patch(
            "core.management.commands.fetch_seed_images.download", fake_download
        ), mock.patch(
            "core.management.commands.fetch_seed_images.configured_banks",
            lambda: ["pexels"],
        ):
            call_command(
                "fetch_seed_images", brief=str(brief), assets_dir=assets,
                bank=None, force=False, dry_run=False,
                stdout=StringIO(), stderr=StringIO(),
            )

        self.assertIn("ham and pineapple sandwich", seen)
        self.assertNotIn("Hawaiana", seen)

        rewritten = json.loads(brief.read_text())
        item = rewritten["menu_categories"][0]["menu_items"][0]
        self.assertTrue(item["image"].startswith("fetched/tortas.test/"))
        credits = json.loads(
            (pathlib.Path(assets) / "fetched/tortas.test/credits.json").read_text()
        )
        # Keyed by exactly the string the brief now carries - the join that lets
        # `_attach` find a credit from a filename alone.
        self.assertEqual(credits[item["image"]]["query"], "ham and pineapple sandwich")

        call_command(
            "seed_site", brief=str(brief), assets_dir=assets, reset=False,
            stdout=StringIO(), stderr=StringIO(),
        )
        dish = MenuItem.objects.get(name="Hawaiana")
        self.assertTrue(dish.image)
        self.assertTrue(dish.attribution.endswith("on Pexels"))
        seeded = System.objects.get(host="tortas.test")
        # The dish and its category both got a photo, so both are credited.
        self.assertEqual(stock_image_count(seeded), 2)

        # A customer's own photo must not stay credited to a stranger - which is
        # what eventually takes the bank credit out of the footer on its own.
        out = BytesIO()
        Image.new("RGB", (6, 6), "blue").save(out, format="JPEG")
        data_url = "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
        proc = ImageProcessingSerializer(data={"base64_image": data_url})
        self.assertTrue(proc.is_valid(), proc.errors)
        proc.save_to_field(dish.image, f"menu_{dish.pk}.jpg")
        dish.save(update_fields=["image"])
        dish.refresh_from_db()
        self.assertEqual(dish.attribution, "")
        self.assertEqual(dish.attribution_url, "")
        self.assertEqual(stock_image_count(seeded), 1)

        # A brief naming a file that is not there falls back to our own
        # placeholder, and crediting a photographer for that would be a lie.
        brief.write_text(json.dumps({
            "system": {"host": "tortas.test", "site_name": "Tortas"},
            "menu_categories": [{
                "name": "Las Especiales",
                "menu_items": [
                    {"name": "Cubana", "image": "gone.jpg", "price": "70.00"}
                ],
            }],
        }))
        call_command(
            "seed_site", brief=str(brief), assets_dir=assets, reset=False,
            stdout=StringIO(), stderr=StringIO(),
        )
        fallback = MenuItem.objects.get(name="Cubana")
        self.assertTrue(fallback.image)   # the pool filled it
        self.assertEqual(fallback.attribution, "")


# --------------------------------------------------------------------------- #
# The CMS image picker
# --------------------------------------------------------------------------- #

class StockImagePickerApiTests(TestCase):
    """`/api/stock-images/…` - what the CMS's "Find an image" grid runs on.

    The keys stay here (beside the ones `fetch_seed_images` uses) and the credit
    is re-read from the bank at download time, so neither can be chosen by the
    browser. Both properties are what these tests are actually guarding.
    """

    def setUp(self):
        self.system = System.objects.create(site_name="Acme", host="acme.test")
        self.client.force_login(make_admin("admin", self.system))

    def _photo(self, bank_id="7"):
        from core.services.image_banks import Photo

        return Photo(
            bank="pexels",
            bank_id=bank_id,
            download_url="https://images.pexels.test/7-large.jpg",
            attribution="Photo by P on Pexels",
            attribution_url="https://www.pexels.com/photo/7/",
            alt="a lemon",
            thumbnail_url="https://images.pexels.test/7-medium.jpg",
        )

    def _post(self, path, **body):
        return self.client.post(
            path, data=json.dumps(body), content_type="application/json"
        )

    def test_search_returns_the_grid_and_never_the_download_url(self):
        with mock.patch(
            "core.views.image_banks.configured_banks", lambda: ["pexels"]
        ), mock.patch(
            "core.views.image_banks.search_photos",
            lambda query, **kwargs: [self._photo()],
        ):
            res = self._post("/api/stock-images/search/", query="lemon")

        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["banks"], ["pexels"])
        hit = body["results"][0]
        self.assertEqual(hit["bank_id"], "7")
        self.assertEqual(hit["thumbnail"], "https://images.pexels.test/7-medium.jpg")
        self.assertEqual(hit["attribution"], "Photo by P on Pexels")
        # The browser picks by id; a URL it could hand back is a URL this pod
        # would then fetch.
        self.assertNotIn("download_url", hit)

    def test_search_says_so_when_no_bank_is_configured(self):
        with mock.patch("core.views.image_banks.configured_banks", lambda: []):
            res = self._post("/api/stock-images/search/", query="lemon")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["code"], "NO_IMAGE_BANK")

    def test_fetch_downloads_by_id_and_carries_the_credit(self):
        asked = {}

        def fake_by_id(bank, bank_id):
            asked["bank"], asked["bank_id"] = bank, bank_id
            return self._photo(bank_id)

        buffer = BytesIO()
        Image.new("RGB", (4, 4), "yellow").save(buffer, format="JPEG")

        with mock.patch("core.views.image_banks.photo_by_id", fake_by_id), mock.patch(
            "core.views.image_banks.download_bytes",
            lambda photo: (buffer.getvalue(), "image/jpeg"),
        ):
            res = self._post(
                "/api/stock-images/fetch/", bank="pexels", bank_id="7",
                # A URL sent by the client is ignored: the photo is re-read from
                # the bank by id, and so is the credit that goes with it.
                url="https://evil.test/private.png",
                attribution="Photo by Nobody",
            )

        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(asked, {"bank": "pexels", "bank_id": "7"})
        self.assertTrue(body["image"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(body["attribution"], "Photo by P on Pexels")
        self.assertEqual(body["attribution_url"], "https://www.pexels.com/photo/7/")

    def test_fetch_reports_a_photo_the_bank_no_longer_has(self):
        with mock.patch(
            "core.views.image_banks.photo_by_id", lambda bank, bank_id: None
        ):
            res = self._post("/api/stock-images/fetch/", bank="pexels", bank_id="7")
        self.assertEqual(res.status_code, 404)

    def test_both_endpoints_are_admin_only(self):
        self.client.force_login(make_admin("shopper", self.system, is_admin=False))
        self.assertEqual(
            self._post("/api/stock-images/search/", query="lemon").status_code, 403
        )
        self.assertEqual(
            self._post(
                "/api/stock-images/fetch/", bank="pexels", bank_id="7"
            ).status_code,
            403,
        )


class HealthProbeTests(TestCase):
    """The container probes, and the one distinction that makes them worth having.

    From a production incident: the probes pointed at ``/admin/`` (which reads the
    session store and the database) with a 1s timeout, so a slow *dependency*
    restarted the pod. Restarting Django does not fix Redis, and at the time it
    meant a full outage. What must hold now is that a dead cache is visible on
    readiness and invisible to liveness.
    """

    def test_liveness_ignores_dependencies_while_readiness_reports_them(self):
        # Healthy: both answer, and readiness names what it checked.
        self.assertEqual(self.client.get("/healthz/").status_code, 200)

        ready = self.client.get("/readyz/")
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(ready.json()["checks"], {"database": "ok", "cache": "ok"})

        # Cache down. Note the cache runs with IGNORE_EXCEPTIONS in production, so
        # a broken backend returns None rather than raising - which is why /readyz/
        # compares the round-tripped value instead of just calling get(). A mock
        # that quietly drops writes reproduces exactly that.
        with mock.patch("core.health.cache.get", return_value=None):
            degraded = self.client.get("/readyz/")
            self.assertEqual(degraded.status_code, 503)
            self.assertEqual(degraded.json()["checks"]["cache"], "error: unreachable")

            # The whole point: the same outage must NOT restart the process.
            self.assertEqual(self.client.get("/healthz/").status_code, 200)
