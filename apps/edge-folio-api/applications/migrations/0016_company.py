import applications.models
import core.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0015_jobapplication_company_analysis'),
    ]

    operations = [
        migrations.CreateModel(
            name='Company',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(max_length=200)),
                ('normalized_name', models.CharField(db_index=True, max_length=200, unique=True)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('processing', 'Processing'),
                        ('complete', 'Complete'),
                        ('failed', 'Failed'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('is_refreshing', models.BooleanField(default=False)),
                ('processing_started_at', models.DateTimeField(blank=True, null=True)),
                ('last_refreshed', models.DateTimeField(blank=True, null=True)),
                ('retry_count', models.PositiveSmallIntegerField(default=0)),
                ('description', models.TextField(blank=True)),
                ('intel', models.JSONField(blank=True, null=True)),
                ('analysis', models.JSONField(blank=True, null=True)),
                ('image', core.fields.ResizedImageField(
                    blank=True,
                    max_size=[256, None],
                    null=True,
                    upload_to=applications.models._company_image_upload,
                )),
            ],
            options={
                'verbose_name_plural': 'companies',
                'ordering': ['-created'],
            },
        ),
    ]
