from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_alter_successstoryimage_image"),
    ]

    operations = [
        migrations.RenameField(
            model_name="system",
            old_name="highlights_en_title",
            new_name="en_highlights_title",
        ),
        migrations.RenameField(
            model_name="system",
            old_name="highlights_en_subtitle",
            new_name="en_highlights_subtitle",
        ),
    ]
