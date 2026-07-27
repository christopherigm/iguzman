"""Move stored media into the bucket - and the path - it is *supposed* to live in.

Turning R2 on does not move anything, and neither does a tenant connecting its
own bucket in the CMS. Every file path is a string in the database and the
storage backend resolves it against whatever is configured *now*, so the moment
``R2_ACCOUNT_ID`` is set, ``pictures/product/ab12.jpg`` starts resolving against
a bucket the file is not in and every image on every site 404s.

This module closes that gap, and it has to close it in **two** dimensions:

* **The bucket.** ``TenantMediaStorage`` is the router the app itself uses, so
  "where should this file be" has exactly one answer and a migration cannot
  drift from serving.
* **The path.** Every file written before ``core.tenant_paths`` landed is
  *unprefixed* (``pictures/product/ab12.jpg``), and an unprefixed name routes to
  the **platform** bucket - by design, so legacy files keep working. That means
  a customer on its own domain, with its own R2 connected, would have all of its
  existing media copied to the *platform* bucket and only its future uploads in
  its own. Copying alone can never move a tenant onto its own bucket.

So a file that does not already name its tenant is **re-pathed**: copied to
``t/<system_id>/<old path>`` and the database column updated to match. That is
what actually puts an own-domain customer's media in their own R2, and it is why
this module writes to the database where a pure ``sync`` would not.

Two invariants make that safe to run, re-run, and interrupt:

* **The database is repointed only after the destination write has succeeded**,
  never before. A crash between the two leaves a row pointing at the old file -
  which still exists and still serves - and the next run copies it again (a
  no-op) and repoints it. The reverse order would produce a row pointing at a
  file that is not there yet, i.e. a broken image, on every failure.
* **Nothing is ever deleted from the source.** A verified copy is worth more
  than the disk space, and it is what makes the whole operation reversible: turn
  ``R2_ACCOUNT_ID`` back off and the old files are still where they were.

Work is handed out in **batches** (``offset``/``limit``) because the caller is an
HTTP request behind a 600s ingress timeout and a full catalog can be thousands of
files. The plan is deterministic - models sorted by label, rows by primary key -
so batch *n+1* resumes exactly where *n* stopped without re-listing the bucket.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.apps import apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.db import models

from core.storage import TenantMediaStorage, platform_storage
from core.tenant_paths import system_id_from_name, tenant_path

SOURCE_LOCAL = "local"
SOURCE_PLATFORM = "platform"
SOURCES = (SOURCE_LOCAL, SOURCE_PLATFORM)

# How many files one batch may touch. Each one costs at least a HEAD against the
# destination bucket and usually a GET + PUT, so this is the knob that keeps a
# request comfortably inside the ingress timeout.
DEFAULT_LIMIT = 25
MAX_LIMIT = 200

# Per-file outcomes. `foreign` is the one that should never happen: a path
# claiming a *different* tenant. It is reported and skipped rather than copied,
# because the only ways to produce one are a bug or a hand-edited row, and both
# are better surfaced than acted on.
COPIED = "copied"
SKIPPED = "skipped"
MISSING = "missing"
FAILED = "failed"
FOREIGN = "foreign"


@dataclass(frozen=True)
class PlanItem:
    """One file, where it is now and where it belongs."""

    label: str          # "catalog.Product"
    pk: int
    field: str          # "image"
    current: str        # the name in the database right now
    target: str         # the name it should have once this tenant owns it
    # A path claiming a *different* tenant. Carried as a flag rather than
    # inferred later: `target` is set equal to `current` for one of these so the
    # ordering and counts stay honest, which leaves nothing to infer it from.
    foreign: bool = False

    @property
    def repath(self) -> bool:
        return self.target != self.current


def target_name(system_id: int, name: str) -> str | None:
    """Where ``name`` belongs once ``system_id`` owns its own namespace.

    Returns None for a path that names a *different* tenant - see ``FOREIGN``.
    """
    owner = system_id_from_name(name)
    if owner == system_id:
        return name          # already correct; copy only
    if owner is not None:
        return None          # someone else's namespace - never touch
    return tenant_path(system_id, name)


# --------------------------------------------------------------------------- #
# Building the plan
# --------------------------------------------------------------------------- #

def scope_queryset(model, queryset, system):
    """Narrow a queryset to one tenant, or None when the model has none.

    Resolution order mirrors ``core.tenant_paths.system_id_for`` exactly, so the
    set of files this module migrates is the same set that storage routing would
    place in the tenant's bucket. A model with no path to a System at all is a
    global lookup table and is skipped - sweeping shared rows into one customer's
    bucket would make a per-tenant migration quietly global.
    """
    from core.backup import SPECS_BY_LABEL
    from core.models import System

    if model is System:
        return queryset.filter(pk=system.pk)

    spec = SPECS_BY_LABEL.get(model._meta.label_lower)
    if spec is not None and spec.scope:
        return queryset.filter(**{spec.scope: system})

    # Not in MODEL_SPECS (SiteBackup, and anything added since), but a direct
    # `system` FK is still an unambiguous answer - and it is the same fallback
    # `system_id_for` applies when it builds the upload path.
    if any(f.name == "system" for f in model._meta.concrete_fields):
        return queryset.filter(system=system)

    return None


def build_plan(system) -> list[PlanItem]:
    """Every non-empty file belonging to ``system``, in a stable order.

    Deterministic ordering is what makes ``offset`` a valid cursor across
    requests: models by label, rows by primary key, fields by name. Every model
    is scanned rather than only those in ``MODEL_SPECS`` - a file left behind is
    a broken image, and this costs one query per model with no bucket calls at
    all.
    """
    plan: list[PlanItem] = []

    for model in sorted(apps.get_models(), key=lambda m: m._meta.label):
        file_fields = sorted(
            f.name
            for f in model._meta.concrete_fields
            if isinstance(f, models.FileField)
        )
        if not file_fields:
            continue

        queryset = scope_queryset(model, model._default_manager.all(), system)
        if queryset is None:
            continue

        label = model._meta.label
        rows = queryset.order_by("pk").values_list("pk", *file_fields)
        for row in rows.iterator():
            pk = row[0]
            # Every (row, field) is its own entry even when two rows happen to
            # share a stored name: the copy is idempotent (the second finds it
            # already at the destination) but each row still needs repointing.
            for field, name in zip(file_fields, row[1:]):
                if not name:
                    continue
                target = target_name(system.pk, name)
                plan.append(
                    PlanItem(
                        label=label,
                        pk=pk,
                        field=field,
                        current=name,
                        target=name if target is None else target,
                        foreign=target is None,
                    )
                )

    return plan


# --------------------------------------------------------------------------- #
# Running a batch
# --------------------------------------------------------------------------- #

def source_storage(kind: str):
    """Where the files are *now*.

    Explicit rather than ``default_storage``: with R2 on, the default IS the
    destination, and copying a bucket onto itself would silently do nothing.
    """
    if kind == SOURCE_PLATFORM:
        return platform_storage()
    return FileSystemStorage(location=str(settings.MEDIA_ROOT))


def _repoint(item: PlanItem) -> None:
    """Point the database row at the file's new name.

    ``QuerySet.update`` rather than ``instance.save()``: ``save()`` would stamp
    every ``auto_now`` column on the row, so a migration would silently claim
    every product was edited today. The cost is that no ``post_save`` receiver
    fires - which is why the caller invalidates the cache namespaces itself once
    the run is done (see ``invalidate_after_restore``).
    """
    model = apps.get_model(item.label)
    model._default_manager.filter(pk=item.pk).update(**{item.field: item.target})


def _process(item, source, router, *, overwrite: bool, dry_run: bool) -> tuple[str, str]:
    """Copy one file if needed. Returns (status, detail)."""
    if item.foreign:
        return FOREIGN, "path names a different tenant"

    destination = router.backend_for(item.target)

    try:
        present = destination.exists(item.target)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator
        return FAILED, f"cannot check destination ({exc})"

    if present and not overwrite:
        # Already copied by an earlier run. The row may still be pointing at the
        # old name if that run died between the write and the repoint, so this
        # branch has to finish the job rather than just report "skipped".
        if item.repath and not dry_run:
            try:
                _repoint(item)
            except Exception as exc:  # noqa: BLE001
                return FAILED, f"cannot update database row ({exc})"
        return SKIPPED, ""

    try:
        if not source.exists(item.current):
            return MISSING, ""
    except Exception as exc:  # noqa: BLE001
        return FAILED, f"cannot read source ({exc})"

    if dry_run:
        return COPIED, ""

    try:
        with source.open(item.current, "rb") as fh:
            payload = fh.read()
        # `_save`, not `save`: `save()` runs the name through
        # `get_available_name`, which with `file_overwrite=False` would write
        # `…_a1b2c3.jpg` instead. The key must match the database exactly or the
        # copy is invisible to the app.
        destination._save(item.target, ContentFile(payload))
    except Exception as exc:  # noqa: BLE001
        return FAILED, f"copy failed ({exc})"

    if item.repath:
        try:
            _repoint(item)
        except Exception as exc:  # noqa: BLE001
            # The file is safely at its new name; only the pointer is stale. The
            # old file was never deleted, so the site still serves - and the next
            # run finds the copy present and repoints it.
            return FAILED, f"copied but could not update database row ({exc})"

    return COPIED, ""


def run_batch(
    system,
    *,
    source: str = SOURCE_LOCAL,
    offset: int = 0,
    limit: int = DEFAULT_LIMIT,
    overwrite: bool = False,
    dry_run: bool = False,
    plan: list[PlanItem] | None = None,
) -> dict:
    """Migrate up to ``limit`` files, starting at ``offset``.

    The caller loops until ``done``, accumulating the counts. ``plan`` is
    accepted so a caller with the whole plan already in hand (the management
    command) does not rebuild it per batch.
    """
    if source not in SOURCES:
        raise ValueError(f"source must be one of {', '.join(SOURCES)}")
    limit = max(1, min(int(limit), MAX_LIMIT))
    offset = max(0, int(offset))

    if plan is None:
        plan = build_plan(system)

    window = plan[offset : offset + limit]
    reader = source_storage(source)
    router = TenantMediaStorage()

    counts = {COPIED: 0, SKIPPED: 0, MISSING: 0, FAILED: 0, FOREIGN: 0}
    entries: list[dict] = []
    repathed = 0

    for item in window:
        status, detail = _process(
            item, reader, router, overwrite=overwrite, dry_run=dry_run
        )
        counts[status] += 1
        if status == COPIED and item.repath:
            repathed += 1
        entries.append(
            {
                "model": item.label,
                "field": item.field,
                "name": item.current,
                "target": item.target,
                "status": status,
                "detail": detail,
            }
        )

    next_offset = offset + len(window)
    return {
        "total": len(plan),
        "offset": offset,
        "processed": len(window),
        "next_offset": next_offset,
        "done": next_offset >= len(plan),
        "repathed": repathed,
        "counts": counts,
        "entries": entries,
    }
