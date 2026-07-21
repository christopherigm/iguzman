from django.db import migrations, models


class Migration(migrations.Migration):
    """The hero's dark overlay, made tenant-configurable.

    The defaults reproduce the gradient both heroes used to hard-code
    ("bottom" at 75%), so no existing site changes appearance.
    """

    dependencies = [
        ('core', '0033_system_font_body_system_font_display_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='system',
            name='hero_overlay_style',
            field=models.CharField(
                choices=[
                    ('none', 'None - no overlay'),
                    ('full', 'Full - flat tint over the whole frame'),
                    ('bottom', 'Bottom to top - dark at the bottom edge'),
                    ('top', 'Top to bottom - dark at the top edge'),
                    ('both', 'Top and bottom - clear through the middle'),
                    ('vignette', 'Vignette - clear centre, dark edges'),
                ],
                default='bottom',
                help_text='Shape of the dark overlay drawn over the hero background.',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='system',
            name='hero_overlay_opacity',
            field=models.PositiveSmallIntegerField(
                default=75,
                help_text='Strength of the darkest part of the overlay, as a whole percent (0-100).',
            ),
        ),
    ]
