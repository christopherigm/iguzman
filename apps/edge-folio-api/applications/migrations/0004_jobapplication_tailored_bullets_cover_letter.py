from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0003_alter_jobapplication_job_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='tailored_bullets',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='jobapplication',
            name='cover_letter',
            field=models.TextField(blank=True),
        ),
    ]
