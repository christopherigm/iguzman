# Generated by Django 3.1.5 on 2021-08-12 05:08

from django.db import migrations, models
import tinymce.models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0003_auto_20210812_0501'),
    ]

    operations = [
        migrations.AddField(
            model_name='changelog',
            name='hours',
            field=models.PositiveIntegerField(default=1, verbose_name='Development time'),
        ),
        migrations.AddField(
            model_name='changelog',
            name='type',
            field=models.CharField(blank=True, choices=[('back-end', 'back-end'), ('front-end', 'front-end'), ('server', 'server'), ('ci-cd', 'ci-cd')], default='front-end', max_length=32, null=True),
        ),
        migrations.AlterField(
            model_name='changelog',
            name='description',
            field=tinymce.models.HTMLField(default='Task description, including git commit'),
        ),
    ]
