import uuid

from django.db import migrations, models


def backfill_public_ids(apps, schema_editor):
    """Give every existing order its own UUID.

    The field is added nullable, without a default: a callable default on
    AddField is evaluated *once* and the same value written to every existing
    row, which would leave them all sharing one UUID and blow up the unique
    constraint below. Added NULL instead, each row is stamped individually here
    before the unique constraint goes on.
    """
    Order = apps.get_model("orders", "Order")
    for order in Order.objects.filter(public_id__isnull=True).only("id"):
        order.public_id = uuid.uuid4()
        order.save(update_fields=["public_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="public_id",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(backfill_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="order",
            name="public_id",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
