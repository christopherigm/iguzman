"""Rebuild a tenant's catalog slugs against its `System.site_prefix`.

The CMS derives a slug **once**, when a record is created, and never again -
renaming a dish leaves its URL saying whatever it said the day it was added.
That is the right default (a URL that moved every time somebody fixed a typo
would be worse), but it leaves two things that only a deliberate pass can fix:

* a site whose ``site_prefix`` has just changed, whose whole catalog is still
  namespaced under the old one;
* a catalog seeded or cloned before this module existed, carrying whichever of
  the three historical conventions its door used.

``rebuild_slugs`` is that pass, and it is what the CMS's "Recreate IDs" button
calls. It is **destructive by design**: every public URL on the site changes,
and nothing here keeps the old ones alive. The confirmation dialog in the CMS
says so; there is no redirect table, deliberately, because the alternative was
a new model plus a lookup on every 404.

⚠ **Coupons and users are not touched, and must not be.** ``Coupon.code`` is
already unique per system and is typed by customers off printed flyers;
``users.build_username`` composes a login from ``(system_id, email)`` and
re-deriving it would lock every customer out. See `core.site_prefix`.
"""

import re
import unicodedata

from django.apps import apps as django_apps
from django.db import transaction


def slug_base(name: str) -> str:
    """The name half of a slug: ASCII, lowercase, hyphen-separated.

    A hand-rolled transliteration rather than `django.utils.text.slugify`,
    because this has to agree **character for character** with the CMS's
    `buildSlug` (`apps/website/lib/slug-utils.ts`) and with
    `catalog.services.clone._slug_base`. A record re-slugged here and the same
    record created through the form must land on the same string, or "Recreate
    IDs" quietly moves URLs that were already correct.
    """
    base = unicodedata.normalize("NFD", name or "")
    base = "".join(ch for ch in base if unicodedata.category(ch) != "Mn")
    base = base.lower()
    base = re.sub(r"[^a-z0-9\s-]", "", base)
    base = re.sub(r"\s+", "-", base.strip())
    return re.sub(r"-+", "-", base)


def build_slug(name: str, prefix: str) -> str:
    """``{site_prefix}-{name}``, the one slug shape this platform has.

    A record with no usable name still gets a slug - ``{prefix}-item`` - rather
    than an empty one, because `slug` is `unique=True` and blank is a value two
    records can collide on.
    """
    base = slug_base(name)
    return f"{prefix}-{base}" if base else f"{prefix}-item"


#: What "everything related to a site" means, as far as slugs go: the eleven
#: models carrying a globally-unique `slug`. The keys are the CMS's own entity
#: names, so a list page can ask for exactly its own rows.
#:
#: ⚠ `check-slug`'s `_MODEL_MAP` in `core.views` looks similar and is not the
#: same list - it still carries a `variant-option` entry for a model deleted in
#: `catalog/0032`. Don't merge them without dropping that dead row first.
SLUG_MODELS = {
    "product": ("catalog", "Product"),
    "product-category": ("catalog", "ProductCategory"),
    "service": ("catalog", "Service"),
    "service-category": ("catalog", "ServiceCategory"),
    "menu-item": ("catalog", "MenuItem"),
    "menu-category": ("catalog", "MenuCategory"),
    "ingredient": ("catalog", "Ingredient"),
    "brand": ("core", "Brand"),
    "success-story": ("core", "SuccessStory"),
    "highlight": ("core", "CompanyHighlight"),
    "event": ("core", "Event"),
}


def _reserved_slugs(Model, system_id):
    """Every slug of `Model` held by a row belonging to some *other* tenant.

    `slug` is unique across the whole table, not per system, so a rebuild has to
    dodge the other tenants' rows as well as its own. Read once per model rather
    than queried per row: a catalog of a few hundred items would otherwise cost
    a few hundred round trips to answer the same question.
    """
    return set(
        Model.objects.exclude(system_id=system_id)
        .exclude(slug__isnull=True)
        .values_list("slug", flat=True)
    )


@transaction.atomic
def rebuild_slugs(system, keys=None):
    """Re-slug `system`'s records, and report what moved.

    `keys` limits the pass to some of `SLUG_MODELS` (what a single CMS list page
    asks for); `None` means all eleven (what /admin/system's button asks for).

    Returns ``{key: {"changed": n, "unchanged": n, "total": n}}``.

    Three things worth knowing about how it writes:

    * **Rows are saved one at a time, through `save()`** - not `bulk_update`.
      Every one of these models has `post_save` receivers that clear the right
      Redis namespace (`catalog.signals`, `core.signals`), and a bulk write
      fires none of them, so the storefront would go on serving the old slugs
      out of cache until the hour was up.
    * **A record whose slug is already correct is not written at all**, so a
      second press is nearly free and does not bump `modified` across the whole
      catalog.
    * **Rows whose current slug another row is about to claim are parked first.**
      See `_park_conflicts`.
    """
    prefix = (system.site_prefix or "").strip()
    if not prefix:
        # Refused rather than defaulted. Building slugs off a blank prefix
        # produces a leading hyphen and no namespace, which is the collision
        # this whole module exists to prevent - and a silently wrong pass here
        # would move every URL on the site to a wrong address.
        raise ValueError("This site has no site_prefix to rebuild slugs from.")

    selected = list(SLUG_MODELS) if keys is None else [k for k in keys if k in SLUG_MODELS]
    report = {}

    for key in selected:
        app_label, model_name = SLUG_MODELS[key]
        Model = django_apps.get_model(app_label, model_name)
        report[key] = _rebuild_one(Model, system, prefix)

    return report


def _rebuild_one(Model, system, prefix):
    """One model's share of `rebuild_slugs`."""
    # Only the *other* tenants' slugs start out reserved. This site's own are
    # not: they are precisely what is being replaced, and treating them as taken
    # would push every record onto a "-2" of itself.
    taken = _reserved_slugs(Model, system.pk)

    # Ordered by pk so two runs over the same data resolve a name collision
    # ("Latte" twice) the same way round - the older row keeps the bare slug and
    # the newer one takes the "-2".
    rows = list(Model.objects.filter(system_id=system.pk).order_by("pk"))

    final = {}
    for row in rows:
        candidate = build_slug(getattr(row, "name", "") or "", prefix)
        base = candidate
        suffix = 2
        while candidate in taken:
            candidate = f"{base}-{suffix}"
            suffix += 1
        taken.add(candidate)
        final[row.pk] = candidate

    changing = [row for row in rows if row.slug != final[row.pk]]
    _park_conflicts(Model, system, changing, final)

    for row in changing:
        row.slug = final[row.pk]
        row.save(update_fields=["slug"])

    return {
        "changed": len(changing),
        "unchanged": len(rows) - len(changing),
        "total": len(rows),
    }


def _park_conflicts(Model, system, changing, final):
    """Move rows out of the way of the slugs their siblings are about to take.

    ⚠ **This is what stops a rebuild dying half way through with an
    IntegrityError.** `slug` is `unique=True` at the database level and the index
    is not deferrable, so the constraint is checked on *every* statement, not at
    commit. Renaming "Latte" to "Espresso" and "Mocha" to "Latte" in the same
    pass therefore fails whenever the second write lands before the first - and
    which one lands first is just pk order, so it fails for some catalogs and not
    others.

    Only the rows actually caught in such a chain are parked: a row is moved to a
    throwaway slug first if the slug it currently holds is one some *other*
    changing row wants. The park uses `queryset.update()` rather than `save()` on
    purpose - it writes no signal, because the transient value is not a state any
    cache should ever be primed with. The real value that follows is saved
    normally and fires the invalidation.

    The throwaway is `__reslug-<system>-<pk>`, which no real slug can collide
    with: `build_slug` strips everything outside `[a-z0-9-]`, so nothing it
    produces can begin with an underscore.
    """
    targets = {final[row.pk] for row in changing}
    for row in changing:
        if row.slug and row.slug in targets:
            Model.objects.filter(pk=row.pk).update(
                slug=f"__reslug-{system.pk}-{row.pk}",
            )
