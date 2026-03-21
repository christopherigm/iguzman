from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_system_highlights_title_subtitle"),
    ]

    operations = [
        migrations.AddField(
            model_name="system",
            name="catalog_items_bg",
            field=models.CharField(
                blank=True,
                help_text=(
                    "CSS background value for the Catalog Items section "
                    "(e.g. 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' "
                    "or a solid color). Defaults to transparent."
                ),
                max_length=512,
                null=True,
            ),
        ),
    ]
