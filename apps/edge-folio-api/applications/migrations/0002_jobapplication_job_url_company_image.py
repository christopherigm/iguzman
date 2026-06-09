from django.db import migrations, models
import applications.models
import core.fields


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='job_url',
            field=models.URLField(max_length=2048, blank=True),
        ),
        migrations.AddField(
            model_name='jobapplication',
            name='company_image',
            field=core.fields.ResizedImageField(
                blank=True,
                max_size=[256, None],
                null=True,
                upload_to=applications.models._application_image_upload,
            ),
        ),
    ]
