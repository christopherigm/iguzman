from django.db import migrations, models
import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_brand_slug"),
    ]

    operations = [
        migrations.AddField(
            model_name="system",
            name="img_hero",
            field=models.ImageField(blank=True, null=True, upload_to=core.models.picture),
        ),
    ]
