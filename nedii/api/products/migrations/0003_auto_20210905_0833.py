# Generated by Django 3.1.5 on 2021-09-05 08:33

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0002_auto_20210905_0828'),
    ]

    operations = [
        migrations.AlterField(
            model_name='product',
            name='price',
            field=models.DecimalField(decimal_places=2, default=5, help_text='Precio del producto', max_digits=10, verbose_name='Precio del producto'),
        ),
    ]
