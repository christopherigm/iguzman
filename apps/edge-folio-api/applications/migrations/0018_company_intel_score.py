from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0017_jobapplication_company_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='intel_score',
            field=models.CharField(
                blank=True,
                choices=[('positive', 'Positive'), ('mixed', 'Mixed'), ('concerning', 'Concerning')],
                max_length=20,
            ),
        ),
    ]
