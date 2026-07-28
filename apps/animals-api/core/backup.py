"""backup - full serialize / restore of this site's data as a portable zip.

The engine behind Backup & Restore on ``/admin/system`` in the CMS. Ported from
website-api's ``core/backup.py``, with the multi-tenancy taken out: there is one
site here, so there is no `System` to scope a queryset by, no cross-tenant key
theft to defend against, and no host on the manifest to match an archive
against. What is left is the part that matters - reconstruct the site exactly,
media included.

The archive layout::

    backup.zip
    |- manifest.json   format version, site name, sections, counts
    |- data.json       {"<app>.<model>": [ {row}, ... ], ...}
    \\- media/          every referenced file, at its storage-relative path

Rows are built by **introspecting ``_meta.concrete_fields``**, not from
hand-listed field tuples - website-api learned that lesson twice, with two
hand-written field lists that both drifted from their models. Adding a field to
a model therefore needs no edit here. Adding a whole *model* does: see
``MODEL_SPECS``, which states only what introspection cannot know - a model's
section, and what identifies one of its rows across two databases.

Four rules that are load-bearing:

* **Secrets never travel.** ``User.password`` is excluded, so a restored account
  gets an unusable password and its owner must run a password reset. Never add
  it back "so logins survive a restore" - a password hash in a downloadable zip
  is a credential, not data.
* **``auto_now`` / ``auto_now_add`` are re-applied after the write.** Django
  overwrites both on ``save()``, so without the follow-up ``QuerySet.update()``
  every restored sighting would claim it was filed at the moment of the restore.
* **Every row is its own savepoint, and the ``try`` sits *outside* the
  ``atomic()`` block.** Catching a database error *inside* one leaves the
  savepoint to be released on a connection Postgres has already aborted, and
  every later row then fails with "current transaction is aborted".
* **PROTECT edges decide the order.** ``MODEL_SPECS`` is written parents-first;
  restore walks it forwards and deletes in reverse, which is what lets a
  Sighting be removed before the Species it protects.

⚠ **An archive is the whole site's database, and it is served with no
authentication in front of it.** In production it lives in the R2 bucket that a
Cloudflare custom domain publishes, and R2 has no per-object ACL. What keeps it
private: the uuid4 in ``backup_upload_path``, ``SiteBackupSerializer`` never
exposing ``file``, and ``SiteBackupDownloadView`` being the only sanctioned read
path. A Cloudflare WAF rule blocking ``/backups/*`` on the public hostname is
the second lock and costs nothing - this code only ever reads through the S3
endpoint.
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
# The three data sections the CMS offers, plus the cross-cutting `images`
# toggle - not a section itself: it decides whether the media files of the
# *selected* sections travel with them.
SECTION_SETTINGS = "settings"
SECTION_CATALOG = "catalog"
SECTION_JOURNAL = "journal"
SECTION_IMAGES = "images"

DATA_SECTIONS = (SECTION_SETTINGS, SECTION_CATALOG, SECTION_JOURNAL)
ALL_SECTIONS = DATA_SECTIONS + (SECTION_IMAGES,)

# A password hash in a downloadable zip is a credential. The Django-admin flags
# go too: a restore may not grant somebody a backend login.
USER_EXCLUDE = ("password", "is_superuser", "is_staff", "last_login")


@dataclass(frozen=True)
class ModelSpec:
    """How one model participates in a backup.

    A model is identified across databases either by ``natural_key`` (fields
    that name the same row on both sides) or by ``parent`` - meaning it has no
    stable identity of its own, and its rows are replaced wholesale for each
    parent the payload carries. A species gallery image is the second kind: it
    is "the third photo of this species", which no column states.
    """

    label: str
    section: str
    natural_key: tuple[str, ...] = ()
    parent: str | None = None
    exclude: tuple[str, ...] = ()
    # The site-settings row: never created, never deleted, only patched.
    singleton: bool = False
    # auth.User needs its own upsert path - see `_restore_user`.
    is_user: bool = False
    # Exempt from replace-mode wipes. Deleting a login (or the profile that
    # carries its `is_admin` flag) is not something a restore should do - and on
    # a single-site install, wiping the user table can lock the last
    # administrator out of the CMS entirely. Both are upserted in either mode.
    never_delete: bool = False
    order_by: tuple[str, ...] = dataclass_field(default_factory=lambda: ("pk",))

    @property
    def model(self):
        return apps.get_model(self.label)


# Write order: parents before children. Restore walks this forwards and deletes
# in reverse, which is also what keeps the PROTECT edges happy (a Sighting is
# removed before the Species it protects, a Species before its Category).
MODEL_SPECS: tuple[ModelSpec, ...] = (
    # ---- settings: the site itself and its people -------------------------- #
    ModelSpec("core.System", SECTION_SETTINGS, singleton=True),
    ModelSpec(
        "auth.User", SECTION_SETTINGS,
        natural_key=("username",), is_user=True, exclude=USER_EXCLUDE,
        never_delete=True,
    ),
    # Keyed on its user (a OneToOne) rather than wiped and recreated: the
    # profile is what carries `is_admin`, so losing one demotes an administrator.
    ModelSpec(
        "users.UserProfile", SECTION_SETTINGS,
        natural_key=("user",), never_delete=True,
    ),
    # ---- catalog: the reference data --------------------------------------- #
    ModelSpec("catalog.Category", SECTION_CATALOG, natural_key=("slug",)),
    ModelSpec("catalog.Species", SECTION_CATALOG, natural_key=("slug",)),
    ModelSpec("catalog.SpeciesImage", SECTION_CATALOG, parent="species"),
    ModelSpec("catalog.Season", SECTION_CATALOG, natural_key=("slug",)),
    ModelSpec("catalog.WeatherCondition", SECTION_CATALOG, natural_key=("slug",)),
    # Locations self-reference through `parent`, so a child restored before its
    # parent would find no target. Ordering by pk puts them back in the order
    # they were created, which is the order they were linked in.
    ModelSpec("catalog.Location", SECTION_CATALOG, natural_key=("slug",)),
    # ---- journal: the entries ---------------------------------------------- #
    ModelSpec("journal.Sighting", SECTION_JOURNAL, natural_key=("slug",)),
    ModelSpec("journal.SightingMedia", SECTION_JOURNAL, parent="sighting"),
)

SPECS_BY_LABEL = {s.label.lower(): s for s in MODEL_SPECS}


def specs_for(sections) -> list[ModelSpec]:
    """The specs covered by a section selection, in write order."""
    wanted = {s for s in sections if s in DATA_SECTIONS}
    return [s for s in MODEL_SPECS if s.section in wanted]


def normalize_sections(sections) -> list[str]:
    """Validate and de-duplicate a section selection, in canonical order.

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

    Decimals become strings - a float round-trip would silently move a
    coordinate - and bytes are tagged so `_decode` can tell a BinaryField's
    payload apart from a JSONField that happens to hold a dict.
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

    Foreign keys travel as the *source* database's pk; the restorer maps those
    onto freshly created rows through an id map, which is what lets a sighting
    find its species without inventing a natural key for every relation.
    """
    row: dict = {"_id": obj.pk}
    for f in _exported_fields(spec):
        if isinstance(f, models.FileField):
            name = getattr(obj, f.name).name or None
            # With images off the field still travels as null, so a restore
            # knows the row had no *carried* file rather than none at all.
            row[f.name] = name if include_images else None
            if name and include_images:
                media.add(name)
        elif f.is_relation:
            row[f.attname] = _encode(getattr(obj, f.attname))
        else:
            row[f.name] = _encode(getattr(obj, f.name))
    return row


def _queryset(spec: ModelSpec):
    model = spec.model
    if spec.singleton:
        return model.objects.all()[:1]
    return model.objects.all().order_by(*spec.order_by)


def serialize_site(sections, *, include_images: bool = True) -> tuple[dict, dict, set[str]]:
    """Read the site into ``(manifest, data, media_names)``.

    ``media_names`` are storage-relative paths; the caller streams them into the
    archive, so this function never holds file bytes in memory.
    """
    from .models import System

    sections = normalize_sections(sections)
    include_images = include_images and SECTION_IMAGES in sections

    data: dict[str, list[dict]] = {}
    media: set[str] = set()
    counts: dict[str, int] = {}

    for spec in specs_for(sections):
        rows = [
            _row_dict(obj, spec, media, include_images)
            for obj in _queryset(spec).iterator()
        ]
        if rows:
            data[spec.label.lower()] = rows
            counts[spec.label.lower()] = len(rows)

    manifest = {
        "format_version": FORMAT_VERSION,
        "created_at": timezone.now().isoformat(),
        "site_name": System.load().site_name,
        "sections": sections,
        "include_images": include_images,
        "counts": counts,
        "media_files": len(media),
    }
    return manifest, data, media


def write_archive(sections, *, include_images: bool = True) -> tuple[str, dict]:
    """Build the backup zip on disk and return ``(path, manifest)``.

    Written to a NamedTemporaryFile rather than into memory: a journal with a
    few years of photographs produces a zip far larger than a request worker
    should hold, and the caller hands the path straight to a FileField.
    """
    manifest, data, media = serialize_site(sections, include_images=include_images)

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
                    # A row pointing at a file that is no longer in storage is a
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
    """A malformed archive, or one this server cannot read."""


def read_manifest(path: str) -> dict:
    """Read and validate an archive's manifest without touching the database."""
    try:
        with zipfile.ZipFile(path) as archive:
            with archive.open(MANIFEST_NAME) as fh:
                manifest = json.loads(fh.read().decode("utf-8"))
    except (zipfile.BadZipFile, KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BackupError(f"Not a valid backup archive: {exc}") from exc
    if not isinstance(manifest, dict):
        raise BackupError("The archive's manifest is not an object.")
    if manifest.get("format_version") != FORMAT_VERSION:
        raise BackupError(
            f"Unsupported backup format version {manifest.get('format_version')!r} "
            f"(this server reads version {FORMAT_VERSION})."
        )
    return manifest


class _UnresolvedRelation(Exception):
    """A required foreign key points outside the restored selection."""


class _Restorer:
    """Applies one archive to this site. Instantiated per restore."""

    def __init__(self, archive: zipfile.ZipFile, data: dict, sections, mode: str):
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
            # Deletion walks EVERY selected model, not just those the archive
            # has rows for: "replace this section" has to mean the site ends up
            # mirroring the archive, and a section that is empty in the backup
            # is a section that should end up empty here.
            self._delete_existing(specs)
        for spec in specs:
            if spec.singleton or spec.label.lower() in self.data:
                self._restore_spec(spec)
        return self.summary

    def _delete_existing(self, specs):
        """Wipe the site's rows for every selected model, children first.

        Reverse write order is what satisfies the PROTECT edges (a Sighting must
        go before the Species it references). The System row is never deleted -
        it *is* the site - and neither are the two account models.
        """
        for spec in reversed(specs):
            if spec.singleton or spec.never_delete:
                continue
            spec.model.objects.all().delete()

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
        """Patch the settings row in place from the archive's copy."""
        from .models import System

        if not rows:
            return
        row = rows[0]
        spec = SPECS_BY_LABEL["core.system"]
        system = System.load()
        values, autos = self._field_values(spec, row)
        # Taking the site down is an operator action in Django, not something a
        # restore performs on its behalf.
        values.pop("enabled", None)
        for name, value in values.items():
            setattr(system, name, value)
        system.save()
        # The logo, favicon, manifest icons, brandmark, hero and about images
        # all live on this row - without this the brand kit would not come back.
        self._attach_files(spec, system, row)
        self._apply_autos(spec.model, system.pk, autos)
        self.idmap[("core.system", row["_id"])] = system
        counts["updated"] += 1

    def _restore_children(self, spec: ModelSpec, rows, counts):
        """Replace this model's rows wholesale, per parent present in the archive.

        A gallery image or a piece of sighting media has no identity a second
        database could match on, so "merge" for them means "this parent's
        children are exactly what the archive says".
        """
        parent_field = spec.model._meta.get_field(spec.parent)
        parents = {
            self.idmap.get(
                (parent_field.related_model._meta.label_lower, row.get(f"{spec.parent}_id"))
            )
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

        # The try must sit OUTSIDE the atomic block. Catching a database error
        # *inside* one leaves the savepoint to be released on a connection
        # Postgres has already put into an aborted state, and every later row
        # then fails with "current transaction is aborted"; letting the
        # exception escape the block is what actually rolls the savepoint back.
        try:
            with transaction.atomic():
                obj, created = self._write(spec, row, values, force_create=force_create)
        except IntegrityError as exc:
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
                # this restore already created or found, not by a source pk.
                if values.get(key) is None:
                    return None, False
                lookup[key] = values[key]
            else:
                lookup[key] = _decode(field, row.get(key))

        existing = model.objects.filter(**lookup).first()
        if existing is not None:
            for name, value in values.items():
                setattr(existing, name, value)
            existing.save()
            return existing, False
        return model.objects.create(**values), True

    def _restore_user(self, spec, row, values, autos, counts):
        """Upsert an account by username.

        No password hash travels in a backup, so a *newly created* account
        cannot be signed into until its owner runs a password reset. An account
        that already exists keeps the password it has - the restore is not
        allowed to lock a live user out.
        """
        from django.contrib.auth.models import User

        username = row.get("username")
        if not username:
            counts["skipped"] += 1
            return
        existing = User.objects.filter(username=username).first()
        if existing is not None:
            for name, value in values.items():
                setattr(existing, name, value)
            existing.save()
            obj, created = existing, False
        else:
            obj = User(**values)
            obj.set_unusable_password()
            obj.save()
            created = True
        self._apply_autos(User, obj.pk, autos)
        self.idmap[("auth.user", row["_id"])] = obj
        counts["created" if created else "updated"] += 1

    # ---- field plumbing ---------------------------------------------------- #

    def _field_values(self, spec: ModelSpec, row: dict) -> tuple[dict, dict]:
        """Decode a row into model kwargs, splitting off the auto timestamps.

        Raises ``_UnresolvedRelation`` when a non-nullable FK points at a row
        not in this restore (a sighting restored without the catalog section
        that holds its species) - such a row cannot be written at all.
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
        """Write ``auto_now``/``auto_now_add`` values verbatim.

        ``Model.save()`` overwrites them with "now" unconditionally, so a
        follow-up UPDATE is the only way to keep a sighting's real filing date.
        """
        if autos:
            model.objects.filter(pk=pk).update(**autos)

    def _attach_files(self, spec: ModelSpec, obj, row: dict):
        """Restore the row's media from the archive.

        A field whose file is absent from the archive is left as-is rather than
        blanked - that is what makes an images-off backup safe to merge into a
        site that already has its photographs.
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
            # gets a fresh non-colliding path rather than fighting whatever
            # already occupies the source path.
            getattr(obj, f.name).save(os.path.basename(name), ContentFile(payload), save=False)
            changed = True
        if changed:
            obj.save()


def restore_archive(path: str, sections, *, mode: str = MODE_REPLACE) -> dict:
    """Apply a backup archive to this site.

    ``sections`` narrows what is applied (it may be a subset of what the archive
    holds). ``mode`` is ``replace`` - wipe the site's rows for each selected
    section and rebuild - or ``merge``, which upserts and leaves rows the
    archive does not mention in place. Returns a per-model
    created/updated/skipped summary plus the manifest.

    The whole apply runs in one transaction, so a failure part-way leaves the
    site exactly as it was.
    """
    if mode not in RESTORE_MODES:
        raise BackupError(f"Unknown restore mode {mode!r}.")

    manifest = read_manifest(path)
    sections = normalize_sections(sections)
    unavailable = [
        s for s in sections
        if s in DATA_SECTIONS and s not in (manifest.get("sections") or [])
    ]
    if unavailable:
        raise BackupError(f"The archive does not contain: {', '.join(unavailable)}.")

    with zipfile.ZipFile(path) as archive:
        try:
            data = json.loads(archive.read(DATA_NAME).decode("utf-8"))
        except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BackupError(f"The archive's data file is unreadable: {exc}") from exc
        if not isinstance(data, dict):
            raise BackupError("The archive's data file is not an object.")

        with transaction.atomic():
            summary = _Restorer(archive, data, sections, mode).run()

    return {"manifest": manifest, "mode": mode, "sections": sections, "results": summary}
