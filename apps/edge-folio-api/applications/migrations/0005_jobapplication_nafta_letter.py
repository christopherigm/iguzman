from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0004_jobapplication_tailored_bullets_cover_letter'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='nafta_letter',
            field=models.TextField(blank=True),
        ),
    ]
