from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0021_jobapplication_language_requirement_unmet'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='nafta_letter_status',
            field=models.CharField(
                blank=True,
                choices=[('processing', 'Processing'), ('complete', 'Complete'), ('failed', 'Failed')],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='jobapplication',
            name='nafta_letter_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
