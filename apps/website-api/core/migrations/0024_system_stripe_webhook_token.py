import uuid

from django.db import migrations, models


def assign_tokens(apps, schema_editor):
    """Give every existing System its own token.

    Row by row, not a bulk update: the point of the column is that no two
    Systems share a value, and a single `update(...=uuid.uuid4())` would
    evaluate uuid4 once and write that one value to every row - which then fails
    the unique constraint added in the next step, or worse, would let one
    tenant's webhook resolve to another's System if it did not.
    """
    System = apps.get_model("core", "System")
    for pk in System.objects.values_list("pk", flat=True):
        System.objects.filter(pk=pk).update(stripe_webhook_token=uuid.uuid4())


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0023_system_stripe_enabled_system_stripe_publishable_key_and_more"),
    ]

    # Added nullable and non-unique, backfilled, then tightened. Adding it as
    # unique with a callable default in one step does not work: the default is
    # evaluated once for the whole ALTER TABLE, so every existing row would get
    # the same uuid and the constraint would be rejected on any table with more
    # than one System.
    operations = [
        migrations.AddField(
            model_name="system",
            name="stripe_webhook_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        migrations.RunPython(assign_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="system",
            name="stripe_webhook_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
