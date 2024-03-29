# Generated by Django 4.1.9 on 2024-01-27 04:03

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stand', '0003_rename_real_expo_is_real_stand_highlighted_meals_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='expo',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='group',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='stand',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standbookingquestion',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standbookingquestionoption',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standnew',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standphone',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standpicture',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standpromotion',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='standrating',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='surveyquestion',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='videolink',
            name='version',
            field=models.PositiveBigIntegerField(default=0),
        ),
    ]
