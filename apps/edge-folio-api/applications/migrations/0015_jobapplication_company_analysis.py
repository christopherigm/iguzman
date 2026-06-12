from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0014_jobapplication_company_intel'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='company_analysis',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
