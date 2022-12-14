# Generated by Django 3.1.5 on 2021-08-12 04:35

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stands', '0006_stand_expo'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stand',
            name='expo',
            field=models.ForeignKey(default=1, help_text='Expo al que pertenece este registro', on_delete=django.db.models.deletion.CASCADE, to='stands.expo', verbose_name='Expo'),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='stand',
            name='group',
            field=models.ForeignKey(default=1, help_text='Grupo al que pertenece este registro', on_delete=django.db.models.deletion.CASCADE, to='stands.group', verbose_name='Grupo'),
            preserve_default=False,
        ),
    ]
