from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0011_jobapplication_professional_summary'),
        ('matrix', '0002_bulletpoint_work_experience'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobapplication',
            name='tailored_skills',
            field=models.ManyToManyField(
                blank=True,
                related_name='job_applications',
                to='matrix.skill',
            ),
        ),
    ]
