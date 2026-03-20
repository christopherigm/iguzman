from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_companyhighlight_size"),
    ]

    operations = [
        migrations.AddField(
            model_name="system",
            name="highlights_bg",
            field=models.CharField(
                blank=True,
                help_text=(
                    "CSS background value for the Company Highlights section "
                    "(e.g. 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' "
                    "or a solid color). Defaults to a gradient from primary/secondary colors."
                ),
                max_length=512,
                null=True,
            ),
        ),
    ]
