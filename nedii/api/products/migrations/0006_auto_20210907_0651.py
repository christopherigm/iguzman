# Generated by Django 3.1.5 on 2021-09-07 06:51

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_product_state'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='productdeliverytype',
            name='name',
        ),
        migrations.AlterField(
            model_name='productdeliverytype',
            name='title',
            field=models.CharField(default='Tipo de entrega', max_length=64),
            preserve_default=False,
        ),
    ]
