# Generated by Django 3.2.7 on 2022-01-09 07:17

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stands', '0021_alter_stand_group'),
        ('meals', '0006_mealclassification_stand'),
    ]

    operations = [
        migrations.AlterField(
            model_name='mealaddon',
            name='stand',
            field=models.ForeignKey(default=1, help_text='Restaurante al que pertenece este registro', on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Restaurante'),
            preserve_default=False,
        ),
    ]
