# Generated by Django 3.1.5 on 2021-09-07 06:48

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_auto_20210907_0635'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='state',
            field=models.CharField(blank=True, choices=[('new', 'new'), ('like-new', 'like-new'), ('used', 'used')], default='new', max_length=16, null=True),
        ),
    ]
