# Generated for the watermark logo/brandmark switches.

from django.db import migrations, models


def forwards(apps, schema_editor):
    """Carry the old single `watermark_use_brandmark` choice onto the new pair.

    A row that tiled the brandmark keeps tiling only the brandmark; every other
    row keeps tiling only the logo (the field defaults already encode this, so
    only the brandmark rows need touching)."""
    System = apps.get_model("core", "System")
    System.objects.filter(watermark_use_brandmark=True).update(
        watermark_show_logo=False,
        watermark_show_brandmark=True,
    )


def backwards(apps, schema_editor):
    """Reverse: a row that shows the brandmark but not the logo maps back to
    `watermark_use_brandmark=True`."""
    System = apps.get_model("core", "System")
    System.objects.update(watermark_use_brandmark=False)
    System.objects.filter(
        watermark_show_brandmark=True, watermark_show_logo=False
    ).update(watermark_use_brandmark=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0040_system_spotlight_enabled'),
    ]

    operations = [
        migrations.AddField(
            model_name='system',
            name='watermark_show_logo',
            field=models.BooleanField(
                default=True,
                help_text='Include the logo in the page watermark.',
            ),
        ),
        migrations.AddField(
            model_name='system',
            name='watermark_show_brandmark',
            field=models.BooleanField(
                default=False,
                help_text='Include the brandmark in the page watermark (needs a brandmark image). With the logo also on, the two are intercalated.',
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name='system',
            name='watermark_use_brandmark',
        ),
    ]
