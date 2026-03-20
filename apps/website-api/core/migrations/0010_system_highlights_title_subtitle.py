from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_system_highlights_bg"),
    ]

    operations = [
        migrations.AddField(
            model_name="system",
            name="highlights_title",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="system",
            name="highlights_en_title",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="system",
            name="highlights_subtitle",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="system",
            name="highlights_en_subtitle",
            field=models.TextField(blank=True, null=True),
        ),
    ]
