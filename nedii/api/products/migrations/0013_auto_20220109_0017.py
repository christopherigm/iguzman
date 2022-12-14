# Generated by Django 3.2.7 on 2022-01-09 07:17

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stands', '0021_alter_stand_group'),
        ('products', '0012_auto_20210918_0425'),
    ]

    operations = [
        migrations.AddField(
            model_name='productclassification',
            name='stand',
            field=models.ForeignKey(default=1, help_text='Stand al que pertenece este registro', on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Stand'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='productfeature',
            name='stand',
            field=models.ForeignKey(default=1, help_text='Stand al que pertenece este registro', on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Stand'),
            preserve_default=False,
        ),
    ]
