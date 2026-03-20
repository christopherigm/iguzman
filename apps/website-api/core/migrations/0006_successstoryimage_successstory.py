import colorfield.fields
import core.fields
import core.models
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_system_slogan'),
    ]

    operations = [
        migrations.CreateModel(
            name='SuccessStoryImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(blank=True, max_length=255, null=True)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('en_description', models.TextField(blank=True, null=True)),
                ('href', models.URLField(blank=True, max_length=255, null=True)),
                ('fit', models.CharField(blank=True, choices=[('cover', 'Cover'), ('contain', 'Contain'), ('fill', 'Fill'), ('scale-down', 'Scale Down'), ('none', 'None')], default='cover', max_length=16, null=True)),
                ('background_color', colorfield.fields.ColorField(blank=True, default='#fff', image_field=None, max_length=25, null=True, samples=None)),
                ('image', core.fields.ResizedImageField(blank=True, max_size=[512, None], null=True, quality=85, upload_to=core.models.picture)),
            ],
            options={
                'verbose_name': 'Success Story Image',
                'verbose_name_plural': 'Success Story Images',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='SuccessStory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(blank=True, max_length=255, null=True)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('en_description', models.TextField(blank=True, null=True)),
                ('href', models.URLField(blank=True, max_length=255, null=True)),
                ('fit', models.CharField(blank=True, choices=[('cover', 'Cover'), ('contain', 'Contain'), ('fill', 'Fill'), ('scale-down', 'Scale Down'), ('none', 'None')], default='cover', max_length=16, null=True)),
                ('background_color', colorfield.fields.ColorField(blank=True, default='#fff', image_field=None, max_length=25, null=True, samples=None)),
                ('image', core.fields.ResizedImageField(blank=True, max_size=[512, None], null=True, quality=85, upload_to=core.models.picture)),
                ('system', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='success_stories', to='core.system')),
                ('gallery', models.ManyToManyField(blank=True, related_name='stories', to='core.successstoryimage')),
            ],
            options={
                'verbose_name': 'Success Story',
                'verbose_name_plural': 'Success Stories',
                'ordering': ['-created'],
            },
        ),
    ]
