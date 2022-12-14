# Generated by Django 3.2.7 on 2022-01-20 07:28

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('meals', '0008_auto_20220110_2246'),
    ]

    operations = [
        migrations.AlterField(
            model_name='meal',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='meal',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='mealaddon',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='mealaddon',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='mealclassification',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='mealclassification',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='mealpicture',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='mealpicture',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]
