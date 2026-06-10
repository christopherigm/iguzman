from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('career', '0002_project_language'),
    ]

    operations = [
        migrations.CreateModel(
            name='TechStack',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='project',
            name='tech_stack',
            field=models.ManyToManyField(blank=True, related_name='projects', to='career.techstack'),
        ),
    ]
