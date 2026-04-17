import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Mod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('prompt', models.TextField()),
                ('llm_model', models.CharField(default='llama-3.3-70b-versatile', max_length=100)),
                ('mod_id', models.SlugField(blank=True, max_length=64)),
                ('mod_name', models.CharField(blank=True, max_length=255)),
                ('description', models.TextField(blank=True)),
                ('main_class', models.CharField(blank=True, max_length=255)),
                ('generated_sources', models.JSONField(blank=True, default=list)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('generating', 'Generating Code'),
                        ('compiling', 'Compiling'),
                        ('ready', 'Ready'),
                        ('failed', 'Failed'),
                    ],
                    db_index=True,
                    default='pending',
                    max_length=20,
                )),
                ('build_log', models.TextField(blank=True)),
                ('error', models.TextField(blank=True)),
                ('fabric_jar', models.FileField(blank=True, null=True, upload_to='mods/')),
                ('neoforge_jar', models.FileField(blank=True, null=True, upload_to='mods/')),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='mods',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Mod',
                'verbose_name_plural': 'Mods',
                'ordering': ['-created'],
            },
        ),
    ]
