# Generated by Django 3.1.5 on 2021-09-07 07:29

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stands', '0019_standpromotion_product'),
        ('products', '0010_auto_20210907_0707'),
    ]

    operations = [
        migrations.AddField(
            model_name='productpicture',
            name='stand',
            field=models.ForeignKey(help_text='Stand al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Stand'),
        ),
    ]
