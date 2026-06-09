from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0002_jobapplication_job_url_company_image'),
    ]

    operations = [
        migrations.AlterField(
            model_name='jobapplication',
            name='job_url',
            field=models.URLField(max_length=2048, blank=True),
        ),
    ]
