"""
backup - full serialize / restore of ONE tenant's data as a portable zip.

This is the tenant-facing **backup & restore** feature behind `/admin/system` in
the website CMS. It is deliberately *not* `site_payload.py`, and the two must not
be merged: `site_payload` is the **publish** layer (dev -> prod), and is lossy on
purpose - it projects only truthy content fields, omits images entirely, and skips
anything per-environment, so that re-publishing a site never clobbers what the
customer edited in production. A backup has the opposite contract: it must be able
to reconstruct the tenant exactly, so it carries **every** concrete field of every
row (including `sku`, cost prices, dimensions, kitchen recipe steps, orders and
customer accounts) plus the media files themselves.

The archive layout::

    backup.zip
    |- manifest.json   format version, host, sections, counts - read before data
    |- data.json       {"<app>.<model>": [ {row}, ... ], ...}
    \- media/          every referenced file, at its storage-relative path

Rather than hand-listing several hundred field names (the trap `site_payload` and
`import_site` fell into - they have drifted from the models twice), rows are built
by **introspecting `_meta.concrete_fields`**. A field added to a model is therefore
backed up the day it lands, with no edit here. What this module states explicitly
is only what introspection cannot know: which models belong to which section, how
each model reaches its `System`, and what identifies a row across databases
(`MODEL_SPECS`).

Four rules that are load-bearing:

* **Secrets never travel.** `System.stripe_*` (Fernet ciphertext, useless in
  another environment and dangerous in a downloadable file) and `User.password`
  are excluded from the export - see `SYSTEM_EXCLUDE` / `USER_EXCLUDE`. A
  restored user gets an unusable password and must reset it.
* **Slugs are globally unique, tenants are not.** `update_or_create(slug=...)`
  would happily hand one tenant a row belonging to another, so every lookup is
  scoped to the target System first and a key owned by a *different* System is
  reported as a conflict and skipped, never stolen.
* **`auto_now` / `auto_now_add` are re-applied after the write.** Django ignores
  them on `save()`, so `created`/`modified`/`created_at` would all collapse to
  "now" on restore - an order history that says every order was placed the moment
  of the restore is not a backup. They are written verbatim with a follow-up
  `QuerySet.update()`.
* **Every row is its own savepoint.** One row that trips a unique constraint
  (a `sku` another tenant has since taken) is recorded and skipped instead of
  aborting the whole restore.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
import zipfile
from dataclasses import dataclass, field as dataclass_field
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from django.apps import apps
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import IntegrityError, models, transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

FORMAT_VERSION = 1

MANIFEST_NAME = "manifest.json"
DATA_NAME = "data.json"
MEDIA_PREFIX = "media/"

# ---- Sections -------------------------------------------------------------- #
# The four data sections the CMS offers, plus the cross-cutting `images` toggle
# (not a section: it decides whether the media files of the *selected* sections
# travel with them).
SECTION_SYSTEM = "system"
SECTION_PRODUCTS = "products"
SECTION_SERVICES = "services"
SECTION_MENU = "menu"
SECTION_IMAGES = "images"

DATA_SECTIONS = (SECTION_SYSTEM, SECTION_PRODUCTS, SECTION_SERVICES, SECTION_MENU)
ALL_SECTIONS = DATA_SECTIONS + (SECTION_IMAGES,)

# Never exported. The Stripe pair is Fernet ciphertext keyed to this
# environment's STRIPE_CREDENTIALS_ENCRYPTION_KEY - worthless anywhere else and a
# credential leak in a file customers download; the webhook token routes a live
# endpoint and must stay pinned to the row it was minted for; `host` identifies
# the tenant and is what restore matches on, so it is carried in the manifest
# instead of being restorable content.
SYSTEM_EXCLUDE = (
    "stripe_secret_key_encrypted",
    "stripe_webhook_secret_encrypted",
    "stripe_webhook_token",
)
# A password hash in a downloadable zip is a credential, not PII. Staff/superuser
# flags are dropped too: they grant the *Django* admin, which is not a tenant's to
# hand out through a restore.
USER_EXCLUDE = ("password", "is_superuser", "is_staff", "last_login")


@dataclass(frozen=True)
class ModelSpec:
    """How one model participates in a backup.

    `scope` is the ORM path from this model to its `System` (`"system"`,
    `"story__system"`), which is what makes the whole engine tenant-safe: every
    read and every replace-mode delete filters on it.

    A model is identified across databases either by `natural_key` (fields that,
    together with the tenant, name the same row on both sides) or by `parent` -
    meaning it has no stable identity of its own and its rows are replaced
    wholesale for each parent the payload carries. That is the same shape
    `import_site` uses for gallery images and highlight sub-items, generalised.
    """

    label: str
    section: str
    scope: str | None
    natural_key: tuple[str, ...] = ()
    parent: str | None = None
    exclude: tuple[str, ...] = ()
    # System is the tenant itself: never created, never deleted, only patched.
    singleton: bool = False
    # auth.User is global, not tenant-scoped; see `_restore_user`.
    is_user: bool = False
    # Exempt from replace-mode wipes. Set on the two account models: deleting a
    # customer login (or the profile that says which tenant it belongs to) would
    # cascade away order history this same restore is rebuilding, and an account
    # is not the CMS's to destroy. Both are upserted in either mode.
    never_delete: bool = False
    order_by: tuple[str, ...] = dataclass_field(default_factory=lambda: ("pk",))

    @property
    def model(self):
        return apps.get_model(self.label)


# Write order. Restore walks this list forwards (parents before children) and
# deletes in reverse, which is also what keeps the PROTECT edges happy: a
# MenuItemIngredient is removed before the Ingredient it protects.
MODEL_SPECS: tuple[ModelSpec, ...] = (
    # ---- system: the site itself, its content, and its people -------------- #
    ModelSpec("core.System", SECTION_SYSTEM, None, singleton=True, exclude=SYSTEM_EXCLUDE),
    ModelSpec("core.Brand", SECTION_SYSTEM, "system", natural_key=("slug",)),
    # Branch, SocialPost, ContactMessage, Favorite and CartItem have no unique
    # business key. Their auto_now_add timestamp is restored verbatim (see the
    # module docstring), so it *is* a stable identity across a backup round-trip.
    ModelSpec("core.Branch", SECTION_SYSTEM, "system", natural_key=("created",)),
    ModelSpec("core.SuccessStory", SECTION_SYSTEM, "system", natural_key=("slug",)),
    ModelSpec("core.SuccessStoryImage", SECTION_SYSTEM, "story__system", parent="story"),
    ModelSpec("core.CompanyHighlight", SECTION_SYSTEM, "system", natural_key=("slug",)),
    ModelSpec("core.CompanyHighlightItem", SECTION_SYSTEM, "highlight__system", parent="highlight"),
    ModelSpec("core.SocialPost", SECTION_SYSTEM, "system", natural_key=("created",)),
    ModelSpec("core.ContactMessage", SECTION_SYSTEM, "system", natural_key=("created",)),
    ModelSpec(
        "auth.User", SECTION_SYSTEM, "profile__system",
        natural_key=("username",), is_user=True, exclude=USER_EXCLUDE,
        never_delete=True,
    ),
    # Keyed on its user (a OneToOne), not wiped and recreated: a profile is what
    # marks an account as belonging to this tenant, so losing one orphans a login.
    ModelSpec(
        "users.UserProfile", SECTION_SYSTEM, "system",
        natural_key=("user",), never_delete=True,
    ),
    ModelSpec("orders.Order", SECTION_SYSTEM, "system", natural_key=("public_id",)),
    ModelSpec("orders.OrderLine", SECTION_SYSTEM, "order__system", parent="order"),
    ModelSpec("users.Favorite", SECTION_SYSTEM, "system", natural_key=("created_at",)),
    ModelSpec("users.CartItem", SECTION_SYSTEM, "system", natural_key=("created_at",)),
    # ---- products ---------------------------------------------------------- #
    ModelSpec("catalog.ProductCategory", SECTION_PRODUCTS, "system", natural_key=("slug",)),
    ModelSpec("catalog.Product", SECTION_PRODUCTS, "system", natural_key=("slug",)),
    ModelSpec("catalog.ProductImage", SECTION_PRODUCTS, "product__system", parent="product"),
    # ---- services ---------------------------------------------------------- #
    ModelSpec("catalog.ServiceCategory", SECTION_SERVICES, "system", natural_key=("slug",)),
    ModelSpec("catalog.Service", SECTION_SERVICES, "system", natural_key=("slug",)),
    ModelSpec("catalog.ServiceImage", SECTION_SERVICES, "service__system", parent="service"),
    # ---- menu -------------------------------------------------------------- #
    ModelSpec("catalog.MenuCategory", SECTION_MENU, "system", natural_key=("slug",)),
    ModelSpec("catalog.Ingredient", SECTION_MENU, "system", natural_key=("slug",)),
    ModelSpec("catalog.IngredientProvider", SECTION_MENU, "ingredient__system", parent="ingredient"),
    ModelSpec("catalog.MenuItem", SECTION_MENU, "system", natural_key=("slug",)),
    ModelSpec("catalog.MenuItemImage", SECTION_MENU, "menu_item__system", parent="menu_item"),
    ModelSpec("catalog.MenuItemIngredient", SECTION_MENU, "menu_item__system", parent="menu_item"),
    ModelSpec(
        "catalog.MenuItemIngredientOption", SECTION_MENU,
        "menu_item_ingredient__menu_item__system", parent="menu_item_ingredient",
    ),
    ModelSpec("catalog.RecipeStep", SECTION_MENU, "menu_item__system", parent="menu_item"),
)

SPECS_BY_LABEL = {s.label.lower(): s for s in MODEL_SPECS}


def specs_for(sections) -> list[ModelSpec]:
    """The specs covered by a section selection, in write order."""
    wanted = {s for s in sections if s in DATA_SECTIONS}
    return [s for s in MODEL_SPECS if s.section in wanted]


def normalize_sections(sections) -> list[str]:
    """Validate and de-duplicate a section selection, preserving canonical order.

    Raises ValueError on an unknown name so a typo in a client payload fails
    loudly instead of silently backing up less than the operator asked for.
    """
    if not sections:
        raise ValueError("At least one section is required.")
    unknown = [s for s in sections if s not in ALL_SECTIONS]
    if unknown:
        raise ValueError(f"Unknown section(s): {', '.join(sorted(unknown))}")
    chosen = set(sections)
    if not chosen & set(DATA_SECTIONS):
        raise ValueError("Select at least one data section, not only images.")
    return [s for s in ALL_SECTIONS if s in chosen]


# --------------------------------------------------------------------------- #
# Value encoding
# --------------------------------------------------------------------------- #

def _encode(value):
    """Make one field value JSON-safe without losing precision.

    Decimals become strings (a float round-trip would silently re-price the
    catalog) and bytes are tagged so `_decode` can tell a BinaryField's payload
    apart from a JSONField that happens to hold a dict.
    """
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"__b64__": base64.b64encode(bytes(value)).decode("ascii")}
    return value


def _decode(field, value):
    if value is None:
        return None
    if isinstance(value, dict) and "__b64__" in value:
        return base64.b64decode(value["__b64__"])
    if isinstance(field, models.JSONField):
        return value
    try:
        return field.to_python(value)
    except Exception:  # noqa: BLE001 - a bad value must not abort the restore
        return value


def _is_auto_time(field) -> bool:
    return bool(getattr(field, "auto_now", False) or getattr(field, "auto_now_add", False))


def _exported_fields(spec: ModelSpec):
    """The concrete fields of a model that a backup carries."""
    return [
        f for f in spec.model._meta.concrete_fields
        if not f.primary_key and f.name not in spec.exclude
    ]


# --------------------------------------------------------------------------- #
# Serialize  (DB -> zip)
# --------------------------------------------------------------------------- #

def _row_dict(obj, spec: ModelSpec, media: set[str], include_images: bool) -> dict:
    """One row as a portable dict.

    Foreign keys travel as the *source* database's pk; `_restore` maps those to
    freshly created rows through an id map, which is what lets an order line find
    its product and a menu-item ingredient find its ingredient without inventing
    natural keys for every relation in the schema.
    """
    row: dict = {"_id": obj.pk}
    for f in _exported_fields(spec):
        if isinstance(f, models.FileField):
            name = getattr(obj, f.name).name or None
            # With images off the field still travels as null, so a restore knows
            # the row had no *carried* file rather than that it had none at all.
            row[f.name] = name if include_images else None
            if name and include_images:
                media.add(name)
        elif f.is_relation:
            row[f.attname] = _encode(getattr(obj, f.attname))
        else:
            row[f.name] = _encode(getattr(obj, f.name))
    return row


def _queryset(spec: ModelSpec, system):
    model = spec.model
    if spec.singleton:
        return model.objects.filter(pk=system.pk)
    return model.objects.filter(**{spec.scope: system}).order_by(*spec.order_by)


def serialize_system(system, sections, *, include_images: bool = True) -> tuple[dict, dict, set[str]]:
    """Read one tenant into `(manifest, data, media_names)`.

    `media_names` are storage-relative paths; the caller streams them into the
    archive so this function never holds file bytes in memory.
    """
    sections = normalize_sections(sections)
    include_images = include_images and SECTION_IMAGES in sections

    data: dict[str, list[dict]] = {}
    media: set[str] = set()
    counts: dict[str, int] = {}

    for spec in specs_for(sections):
        rows = [
            _row_dict(obj, spec, media, include_images)
            for obj in _queryset(spec, system).iterator()
        ]
        if rows:
            data[spec.label.lower()] = rows
            counts[spec.label.lower()] = len(rows)

    manifest = {
        "format_version": FORMAT_VERSION,
        "created_at": timezone.now().isoformat(),
        "host": system.host,
        "site_name": system.site_name or system.host,
        "sections": sections,
        "include_images": include_images,
        "counts": counts,
        "media_files": len(media),
    }
    return manifest, data, media


def write_archive(system, sections, *, include_images: bool = True) -> tuple[str, dict]:
    """Build the backup zip on disk and return `(path, manifest)`.

    Written to a NamedTemporaryFile rather than memory: a tenant with a full
    catalog of photos produces a zip far larger than a request worker should hold,
    and the caller hands the path straight to a FileField.
    """
    manifest, data, media = serialize_system(
        system, sections, include_images=include_images
    )

    handle = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    handle.close()
    try:
        with zipfile.ZipFile(
            handle.name, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True
        ) as archive:
            archive.writestr(DATA_NAME, json.dumps(data, ensure_ascii=False))
            written = 0
            for name in sorted(media):
                try:
                    with default_storage.open(name, "rb") as src:
                        archive.writestr(f"{MEDIA_PREFIX}{name}", src.read())
                    written += 1
                except (FileNotFoundError, OSError) as exc:
                    # A row pointing at a file that is no longer on disk is a
                    # pre-existing inconsistency; it must not fail the backup.
                    logger.warning("backup: media %s skipped (%s)", name, exc)
            # Written last, and exactly once, so its media count reflects what
            # actually shipped - a second writestr of the same name would leave
            # two entries in the archive and readers would take the stale one.
            manifest["media_files"] = written
            archive.writestr(
                MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False)
            )
    except Exception:
        os.unlink(handle.name)
        raise
    return handle.name, manifest


# --------------------------------------------------------------------------- #
# Restore  (zip -> DB)
# --------------------------------------------------------------------------- #

MODE_REPLACE = "replace"
MODE_MERGE = "merge"
RESTORE_MODES = (MODE_REPLACE, MODE_MERGE)


class BackupError(ValueError):
    """A malformed archive, or one that does not belong to the target tenant."""


def read_manifest(path: str) -> dict:
    """Read and validate an archive's manifest without touching the database."""
    try:
        with zipfile.ZipFile(path) as archive:
            with archive.open(MANIFEST_NAME) as fh:
                manifest = json.loads(fh.read().decode("utf-8"))
    except (zipfile.BadZipFile, KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BackupError(f"Not a valid backup archive: {exc}") from exc
    if not isinstance(manifest, dict) or not manifest.get("host"):
        raise BackupError("The archive's manifest is missing a host.")
    if manifest.get("format_version") != FORMAT_VERSION:
        raise BackupError(
            f"Unsupported backup format version {manifest.get('format_version')!r} "
            f"(this server reads version {FORMAT_VERSION})."
        )
    return manifest


class _Restorer:
    """Applies one archive to one System. Instantiated per restore."""

    def __init__(self, system, archive: zipfile.ZipFile, data: dict, sections, mode: str):
        self.system = system
        self.archive = archive
        self.data = data
        self.sections = sections
        self.mode = mode
        # (model_label, source_pk) -> restored instance
        self.idmap: dict[tuple[str, int], models.Model] = {}
        self.summary: dict[str, dict] = {}
        self.media_names = {
            n[len(MEDIA_PREFIX):] for n in archive.namelist() if n.startswith(MEDIA_PREFIX)
        }

    # ---- entry point ------------------------------------------------------- #

    def run(self) -> dict:
        specs = specs_for(self.sections)
        if self.mode == MODE_REPLACE:
            # Deletion walks EVERY selected model, not just the ones the archive
            # has rows for: "replace this section" has to mean the tenant ends up
            # mirroring the archive, and a section that is empty in the backup is
            # a section that should end up empty here.
            self._delete_existing(specs)
        for spec in specs:
            if spec.singleton or spec.label.lower() in self.data:
                self._restore_spec(spec)
        return self.summary

    def _delete_existing(self, specs):
        """Wipe the tenant's rows for every selected model, children first.

        Reverse write order is what satisfies the PROTECT edges in the menu
        graph (a MenuItemIngredient must go before the Ingredient it references).
        The System row itself is never deleted - it *is* the tenant - and neither
        are the two account models (see `never_delete`).
        """
        for spec in reversed(specs):
            if spec.singleton or spec.never_delete:
                continue
            spec.model.objects.filter(**{spec.scope: self.system}).delete()

    # ---- per-model --------------------------------------------------------- #

    def _restore_spec(self, spec: ModelSpec):
        counts = {"created": 0, "updated": 0, "skipped": 0}
        rows = self.data.get(spec.label.lower()) or []

        if spec.singleton:
            self._restore_system(rows, counts)
        elif spec.parent:
            self._restore_children(spec, rows, counts)
        else:
            for row in rows:
                self._restore_row(spec, row, counts)

        if rows or spec.singleton:
            self.summary[spec.label.lower()] = counts

    def _restore_system(self, rows, counts):
        """Patch the target System in place from the archive's System row."""
        if not rows:
            return
        row = rows[0]
        spec = SPECS_BY_LABEL["core.system"]
        values, autos = self._field_values(spec, row)
        # `host` decides which tenant this is; a restore may not move a site onto
        # another domain, and `enabled` (taking a site down) is a Django-staff
        # action, not a CMS one.
        values.pop("host", None)
        values.pop("enabled", None)
        for name, value in values.items():
            setattr(self.system, name, value)
        self.system.save()
        # The tenant's logo, favicon, manifest icons, hero and about images all
        # live on this row - without this the brand kit would not come back.
        self._attach_files(spec, self.system, row)
        self._apply_autos(spec.model, self.system.pk, autos)
        self.idmap[("core.system", row["_id"])] = self.system
        counts["updated"] += 1

    def _restore_children(self, spec: ModelSpec, rows, counts):
        """Replace this model's rows wholesale, per parent present in the archive.

        These models (gallery images, highlight sub-items, order lines, recipe
        steps) have no identity a second database could match on, so "merge" for
        them means "this parent's children are exactly what the archive says".
        """
        parent_field = spec.model._meta.get_field(spec.parent)
        parents = {
            self.idmap.get((parent_field.related_model._meta.label_lower, row.get(f"{spec.parent}_id")))
            for row in rows
        }
        parents.discard(None)
        if parents and self.mode == MODE_MERGE:
            spec.model.objects.filter(**{f"{spec.parent}__in": parents}).delete()
        for row in rows:
            self._restore_row(spec, row, counts, force_create=True)

    # ---- per-row ----------------------------------------------------------- #

    def _restore_row(self, spec: ModelSpec, row: dict, counts, *, force_create: bool = False):
        try:
            values, autos = self._field_values(spec, row)
        except _UnresolvedRelation:
            counts["skipped"] += 1
            return

        if spec.is_user:
            self._restore_user(spec, row, values, autos, counts)
            return

        if spec.scope == "system":
            values["system"] = self.system

        # The try must sit OUTSIDE the atomic block. Catching a database error
        # *inside* one leaves the savepoint to be released on a connection
        # Postgres has already put into an aborted state, and every later row
        # fails with "current transaction is aborted"; letting the exception
        # escape the block is what actually rolls the savepoint back.
        try:
            with transaction.atomic():
                obj, created = self._write(spec, row, values, force_create=force_create)
        except IntegrityError as exc:
            # Almost always a globally-unique key (slug, sku) that another tenant
            # has taken since the backup was made. Record and move on.
            logger.warning("restore: %s row skipped (%s)", spec.label, exc)
            counts["skipped"] += 1
            return

        if obj is None:
            counts["skipped"] += 1
            return
        # Files first: attaching one re-saves the row, and that save would stamp
        # `modified` with "now" on top of the timestamp just restored.
        self._attach_files(spec, obj, row)
        self._apply_autos(spec.model, obj.pk, autos)
        self.idmap[(spec.model._meta.label_lower, row["_id"])] = obj
        counts["created" if created else "updated"] += 1

    def _write(self, spec: ModelSpec, row, values, *, force_create):
        model = spec.model
        if force_create or not spec.natural_key:
            return model.objects.create(**values), True

        lookup = {}
        for key in spec.natural_key:
            field = model._meta.get_field(key)
            if field.is_relation:
                # A relational key (UserProfile.user) is matched by the instance
                # this restore already created/found, not by a source-database pk.
                if values.get(key) is None:
                    return None, False
                lookup[key] = values[key]
            else:
                lookup[key] = _decode(field, row.get(key))
        # Scope the match to this tenant first: these keys (slug, public_id) are
        # unique across the whole table, so an unscoped update_or_create would
        # quietly rewrite another customer's row.
        existing = model.objects.filter(**{spec.scope: self.system}, **lookup).first()
        if existing is not None:
            for name, value in values.items():
                setattr(existing, name, value)
            existing.save()
            return existing, False
        if model.objects.filter(**lookup).exists():
            # The key exists but belongs to somebody else - never take it over.
            logger.warning("restore: %s %s belongs to another system", spec.label, lookup)
            return None, False
        return model.objects.create(**values), True

    def _restore_user(self, spec, row, values, autos, counts):
        """Upsert a customer account by username, never across tenants.

        `auth.User` is global while tenancy lives on `UserProfile.system`, so a
        username already held by *another* System is left strictly alone -
        otherwise restoring a backup could silently adopt (and re-point) another
        customer's login.
        """
        from django.contrib.auth.models import User

        username = row.get("username")
        if not username:
            counts["skipped"] += 1
            return
        existing = User.objects.filter(username=username).select_related("profile").first()
        if existing is not None:
            profile_system_id = getattr(getattr(existing, "profile", None), "system_id", None)
            if profile_system_id not in (None, self.system.pk):
                counts["skipped"] += 1
                return
            for name, value in values.items():
                setattr(existing, name, value)
            existing.save()
            obj, created = existing, False
        else:
            obj = User(**values)
            # No password hash travels in a backup, so a restored account cannot
            # be signed into until its owner runs a password reset.
            obj.set_unusable_password()
            obj.save()
            created = True
        self._apply_autos(User, obj.pk, autos)
        self.idmap[("auth.user", row["_id"])] = obj
        counts["created" if created else "updated"] += 1

    # ---- field plumbing ---------------------------------------------------- #

    def _field_values(self, spec: ModelSpec, row: dict) -> tuple[dict, dict]:
        """Decode a row into model kwargs, splitting off the auto timestamps.

        Raises `_UnresolvedRelation` when a non-nullable FK points at a row that
        is not in this restore (e.g. menu items restored without the system
        section that owns their brand) - such a row cannot be written at all.
        """
        values: dict = {}
        autos: dict = {}
        for f in _exported_fields(spec):
            if isinstance(f, models.FileField):
                continue  # attached after the row exists; see `_attach_files`
            if f.is_relation:
                key = f.attname
                if key not in row:
                    continue
                source_pk = row[key]
                if source_pk is None:
                    values[f.name] = None
                    continue
                target = self.idmap.get((f.related_model._meta.label_lower, source_pk))
                if target is None:
                    if not f.null:
                        raise _UnresolvedRelation(f"{spec.label}.{f.name}")
                    values[f.name] = None
                    continue
                values[f.name] = target
            elif f.name in row:
                value = _decode(f, row[f.name])
                if _is_auto_time(f):
                    if value is not None:
                        autos[f.name] = value
                else:
                    values[f.name] = value
        return values, autos

    @staticmethod
    def _apply_autos(model, pk, autos):
        """Write `auto_now`/`auto_now_add` values verbatim.

        `Model.save()` overwrites them with "now" unconditionally, so the only
        way to keep an order's real placed-at date is a follow-up UPDATE.
        """
        if autos:
            model.objects.filter(pk=pk).update(**autos)

    def _attach_files(self, spec: ModelSpec, obj, row: dict):
        """Restore the row's media from the archive.

        A field whose file is absent from the archive is left as-is rather than
        blanked: that is what makes an images-off backup safe to merge into a
        tenant that already has its pictures.
        """
        changed = False
        for f in spec.model._meta.concrete_fields:
            if not isinstance(f, models.FileField) or f.name in spec.exclude:
                continue
            name = row.get(f.name)
            if not name or name not in self.media_names:
                continue
            try:
                payload = self.archive.read(f"{MEDIA_PREFIX}{name}")
            except KeyError:
                continue
            # Saved through the field's own `upload_to`, so the restored copy
            # gets a fresh non-colliding path instead of fighting whatever else
            # already occupies the source path.
            getattr(obj, f.name).save(os.path.basename(name), ContentFile(payload), save=False)
            changed = True
        if changed:
            obj.save()


class _UnresolvedRelation(Exception):
    """A required foreign key points outside the restored selection."""


def restore_archive(system, path: str, sections, *, mode: str = MODE_REPLACE) -> dict:
    """Apply a backup archive to `system`.

    The archive must belong to this tenant (`manifest["host"] == system.host`);
    a foreign archive is refused rather than imported, so a mis-picked file
    cannot overwrite one customer's site with another's.

    `sections` narrows what is applied (it may be a subset of what the archive
    holds). `mode` is `replace` - wipe the tenant's rows for each selected
    section and rebuild - or `merge`, which upserts and leaves rows the archive
    does not mention in place. Returns a per-model created/updated/skipped
    summary plus the manifest.
    """
    if mode not in RESTORE_MODES:
        raise BackupError(f"Unknown restore mode {mode!r}.")

    manifest = read_manifest(path)
    if (manifest.get("host") or "").strip().lower() != (system.host or "").strip().lower():
        raise BackupError(
            f"This archive belongs to '{manifest.get('host')}', not to "
            f"'{system.host}'. Restoring it here would overwrite this site with "
            f"another one's data."
        )

    sections = normalize_sections(sections)
    unavailable = [
        s for s in sections
        if s in DATA_SECTIONS and s not in (manifest.get("sections") or [])
    ]
    if unavailable:
        raise BackupError(
            f"The archive does not contain: {', '.join(unavailable)}."
        )

    with zipfile.ZipFile(path) as archive:
        try:
            data = json.loads(archive.read(DATA_NAME).decode("utf-8"))
        except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BackupError(f"The archive's data file is unreadable: {exc}") from exc
        if not isinstance(data, dict):
            raise BackupError("The archive's data file is not an object.")

        with transaction.atomic():
            summary = _Restorer(system, archive, data, sections, mode).run()

    return {"manifest": manifest, "mode": mode, "sections": sections, "results": summary}
