"""Where a tenant's files live inside the media namespace.

Every file this project writes is stored under a path that *names its tenant*::

    t/<system_id>/pictures/product/9f2c….jpg
    t/<system_id>/backups/4a17….zip

That prefix is not cosmetic - it is the routing key. `core.storage` resolves
which R2 bucket a file belongs to by reading the system id back out of its
**name**, because Django gives it nothing else to go on:

* ``FileField.storage`` is resolved **once, when the model class is loaded**
  (a callable passed as ``storage=`` is called at field construction, not per
  save), so a per-tenant bucket can never come from there; and
* ``Storage.url(name)`` is called from serializers, management commands, email
  builders and the Django admin alike - most of which have no request, and some
  of which render *another* tenant's rows. A thread-local "current tenant" would
  therefore be right most of the time and silently wrong in exactly the places
  (cross-tenant admin, a `sync_media_to_r2` run) where a wrong answer means a
  broken image or a file written into someone else's bucket.

Reading the tenant off the name makes every storage operation stateless and
correct without a request, which is the whole point.

A name with **no** prefix is legacy - every file written before this landed - and
routes to the platform bucket, which is where `sync_media_to_r2` copies it. That
is why the prefix has to be an unambiguous shape (``t/<digits>/``) rather than
just a leading number: `pictures/…` and `profile_pictures/…` must keep resolving
to the platform, forever.
"""

from __future__ import annotations

import re

# `t` rather than `tenant` or `system`: it prefixes every media path in the
# bucket and ends up in every image URL on every page.
TENANT_ROOT = "t"

_TENANT_RE = re.compile(r"^t/(\d+)/")


def tenant_path(system_id: int | None, path: str) -> str:
    """Prefix a storage-relative path with its tenant, when there is one.

    Falls back to the bare path for anything that cannot name a System (a row
    created before its FK is set, a fixture). Such a file lands on the platform
    bucket and stays reachable - it just cannot follow a tenant to its own R2.
    """
    if not system_id:
        return path
    return f"{TENANT_ROOT}/{system_id}/{path}"


def system_id_from_name(name: str) -> int | None:
    """The tenant a stored path belongs to, or None for a legacy/unscoped path."""
    if not name:
        return None
    match = _TENANT_RE.match(name.replace("\\", "/").lstrip("/"))
    return int(match.group(1)) if match else None


def system_id_for(instance) -> int | None:
    """The tenant a model instance belongs to, for building its upload path.

    Resolved from ``core.backup.MODEL_SPECS``, which already states every model's
    ORM path to its ``System`` (``"system"``, ``"story__system"``,
    ``"menu_item_ingredient__menu_item__system"``) and is kept current because
    the backup engine breaks loudly when it drifts. Adding a model there gives it
    tenant-scoped storage with no edit here.

    A miss is not an error: it returns None and the file goes to the platform
    bucket. This runs at *upload* time only (once per file), so walking a couple
    of FKs is affordable in a way it would not be inside ``url()``.
    """
    if instance is None:
        return None

    # System is its own tenant. An unsaved one has no pk yet; the caller then
    # gets an unprefixed path, which is correct - there is no tenant to name.
    if instance.__class__.__name__ == "System":
        return instance.pk

    from core.backup import SPECS_BY_LABEL

    spec = SPECS_BY_LABEL.get(instance._meta.label_lower)
    if spec is None or not spec.scope:
        # Not a backed-up model, or the System itself. Try the common case
        # anyway so a new model works before it is added to MODEL_SPECS.
        return getattr(instance, "system_id", None)

    # `scope` is a query path ("story__system"); walk it as attributes. The last
    # hop is read as `<name>_id` so a direct FK costs no query at all.
    parts = spec.scope.split("__")
    obj = instance
    for hop in parts[:-1]:
        obj = getattr(obj, hop, None)
        if obj is None:
            return None
    return getattr(obj, f"{parts[-1]}_id", None)
