import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('matrix', '0001_initial'),
        ('career', '0003_techstack_project_tech_stack'),
    ]

    operations = [
        migrations.AddField(
            model_name='bulletpoint',
            name='work_experience',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='bullet_points',
                to='career.workexperience',
            ),
        ),
    ]
