from django.db import migrations


class Migration(migrations.Migration):
    """Drop the per-branch slot-interval override.

    Start times are spaced by the service's own duration and by nothing else
    (`orders.services.booking.slot_step_minutes`). A branch-level grid was the
    wrong shape for that decision twice over: it applied to every service sold
    out of the location, and it was a second source of truth beside the duration
    it could only disagree with.

    No data migration is needed in either direction. `core.0058` had already
    cleared the column to NULL on every row and nothing in the CMS could set it
    afterwards, so this drops a column that is NULL everywhere - and the reverse
    re-adds it as the same nullable field, where NULL is exactly the "follow the
    service's duration" the 0060-state code reads it as.
    """

    dependencies = [
        ('core', '0060_branch_map_image'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='branch',
            name='booking_slot_minutes',
        ),
    ]
