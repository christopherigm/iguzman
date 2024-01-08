# Generated by Django 4.1.9 on 2023-08-09 15:51

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0003_alter_changelog_version_alter_city_version_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='changelog',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='city',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='country',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='homepicture',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='sprint',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='state',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='system',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]