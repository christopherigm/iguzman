# Generated for the hero logo-background badge feature.

from django.db import migrations, models


def backfill_profile_circle(apps, schema_editor):
    """Existing "profile" sites drew a hard-coded circle; keep that look by
    setting their new hero_logo_background to "circle". Default-layout sites keep
    "none" (no badge), matching how they render today."""
    System = apps.get_model("core", "System")
    System.objects.filter(hero_video_layout="profile").update(
        hero_logo_background="circle"
    )


def noop_reverse(apps, schema_editor):
    # Nothing to undo: the column is dropped by the AddField's own reversal.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0029_system_hero_logo_scale'),
    ]

    operations = [
        migrations.AddField(
            model_name='system',
            name='hero_logo_background',
            field=models.CharField(
                choices=[
                    ('none', 'None'),
                    ('circle', 'Circle'),
                    ('square', 'Square'),
                    ('rounded', 'Square with rounded corners (8px)'),
                    ('triangle', 'Triangle'),
                    ('pentagon', 'Pentagon'),
                    ('hexagon', 'Hexagon'),
                    ('octagon', 'Octagon'),
                ],
                default='none',
                help_text="Shape drawn behind the hero logo, in either layout. 'None' draws the logo plain.",
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='system',
            name='hero_logo_scale',
            field=models.PositiveSmallIntegerField(
                default=100,
                help_text='Logo size inside the background shape, as a whole percent (50-100).',
            ),
        ),
        migrations.RunPython(backfill_profile_circle, noop_reverse),
    ]
