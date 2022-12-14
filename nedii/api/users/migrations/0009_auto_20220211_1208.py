# Generated by Django 3.2.7 on 2022-02-11 19:08

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('users', '0008_auto_20220211_1013'),
    ]

    operations = [
        migrations.AddField(
            model_name='userorder',
            name='backup_user_name',
            field=models.CharField(default='User name', max_length=64, verbose_name='Nombre del comprador'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='userorderbuyableitem',
            name='purchase_order',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='users.userorder', verbose_name='Orden de compra'),
        ),
        migrations.AlterField(
            model_name='userorder',
            name='broker_id',
            field=models.CharField(default='Broker ID', max_length=64, verbose_name='Broker ID'),
            preserve_default=False,
        ),
        migrations.AlterUniqueTogether(
            name='userorder',
            unique_together={('user', 'broker_id')},
        ),
    ]
