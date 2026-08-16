"""stock_images - how much of a site is still running on bank photography.

A record whose `attribution` is non-empty is showing an image that came from a
stock bank (Pexels, Pixabay) rather than from the customer's own camera. That
one fact drives two surfaces:

  * the storefront footer, which owes the bank a visible credit for as long as
    any of its images are on the page (`System.stock_image_count > 0`);
  * the CMS, which uses the same number to tell a tenant how many items are
    still on placeholder photography and should be replaced.

Clearing the field is what marks an image as the customer's own, and the CMS
image uploader does it on every upload - so the count falls to zero on its own
as a site is filled in, with nothing to remember to tick.

**The model list is derived, never hand-written.** `core.backup.MODEL_SPECS`
already states every model's ORM path to its `System` and is kept honest by the
backup engine's round-trip tests; a second hand-listed tuple here would drift
from it exactly as `site_payload` and `import_site` drifted from the models
(see that module's docstring). So a picture model added to `MODEL_SPECS` starts
being counted with no edit in this file.
"""

from __future__ import annotations

from core.backup import MODEL_SPECS

# The two `System` images that can legitimately come from a bank. Its other
# img_* fields are logos, favicons, brandmarks and manifest icons - the
# customer's own mark by definition - so they carry no attribution columns at
# all. See `System.img_hero_attribution`.
SYSTEM_ATTRIBUTION_FIELDS = ("img_hero_attribution", "img_about_attribution")

ATTRIBUTION_FIELD = "attribution"


def _has_attribution(model) -> bool:
    return any(f.name == ATTRIBUTION_FIELD for f in model._meta.concrete_fields)


def attributed_specs() -> list:
    """Every tenant-scoped spec whose model carries an `attribution` column."""
    return [
        spec
        for spec in MODEL_SPECS
        if spec.scope and _has_attribution(spec.model)
    ]


def stock_image_count(system) -> int:
    """How many of this system's images are still credited to a stock bank.

    Counts `System`'s own hero/about pair plus every attributed row across the
    catalog and content models. One COUNT per model is a lot of queries to run
    on a page render, which is why the only caller is `SystemSerializer` - a
    payload cached for `SYSTEM_CACHE_TTL` (one hour) and invalidated by the
    receivers in `core/signals.py`. Do not call it in a loop.
    """
    total = sum(
        1
        for field in SYSTEM_ATTRIBUTION_FIELDS
        if (getattr(system, field, "") or "").strip()
    )
    for spec in attributed_specs():
        total += (
            spec.model.objects.filter(**{spec.scope: system})
            .exclude(**{ATTRIBUTION_FIELD: ""})
            .count()
        )
    return total
