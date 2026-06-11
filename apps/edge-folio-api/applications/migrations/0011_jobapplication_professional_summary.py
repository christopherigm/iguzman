from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0010_jobapplication_location_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='professional_summary',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
    ]
