"""Give every System the slug namespace its catalog will be rebuilt against.

Three operations rather than one, because the column is `unique=True` and every
existing row would otherwise be added with the same default and collide on the
spot: add it nullable-ish (blank, non-unique), back-fill each row from its own
host, then tighten the constraint.

The back-fill is deliberately **not** a re-slug. Existing catalog rows keep the
``{system_id}-{name}`` slugs the CMS gave them; this only records what the
prefix *is* from now on, so new records and an explicit "Recreate IDs" press
have something to build from. Re-slugging a live site changes every public URL
it has, which is an operator's decision, not a migration's.
"""

from django.db import migrations, models


def _prefix_for(host):
    """`core.site_prefix.default_prefix_for_host`, inlined.

    A migration must not import from the live app: `site_prefix.py` is free to
    change its mind about what a default prefix looks like, and this back-fill
    has to keep producing the values it produced the day it ran.
    """
    from django.utils.text import slugify

    label = (host or "").strip().lower().split(":")[0].split(".")[0]
    return slugify(label)[:32] or "site"


def backfill_site_prefix(apps, schema_editor):
    System = apps.get_model("core", "System")

    taken = set()
    # Oldest first, so a re-run and a fresh install agree on which of two
    # colliding sites gets the bare prefix and which gets the "-2".
    for system in System.objects.order_by("pk").iterator():
        base = _prefix_for(system.host)
        value = base
        suffix = 2
        while value in taken:
            tail = f"-{suffix}"
            value = f"{base[: 32 - len(tail)]}{tail}"
            suffix += 1
        taken.add(value)
        system.site_prefix = value
        system.save(update_fields=["site_prefix"])


def noop(apps, schema_editor):
    """Reversing only drops the column, which `RemoveField` already does."""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0071_system_navbar_translucent"),
    ]

    operations = [
        migrations.AddField(
            model_name="system",
            name="site_prefix",
            field=models.SlugField(blank=True, default="", max_length=32),
        ),
        migrations.RunPython(backfill_site_prefix, noop),
        migrations.AlterField(
            model_name="system",
            name="site_prefix",
            field=models.SlugField(default="site", max_length=32, unique=True),
        ),
    ]
