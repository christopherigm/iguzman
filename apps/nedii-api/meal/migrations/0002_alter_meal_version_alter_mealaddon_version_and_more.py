# Generated by Django 4.1.9 on 2024-01-27 04:03

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meal', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='meal',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='mealaddon',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='mealclassification',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='mealpicture',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]
