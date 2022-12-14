# Generated by Django 3.2.7 on 2022-01-20 07:28

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0009_system'),
    ]

    operations = [
        migrations.AlterField(
            model_name='changelog',
            name='hours',
            field=models.PositiveSmallIntegerField(default=1, verbose_name='Development time (hours)'),
        ),
        migrations.AlterField(
            model_name='changelog',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='changelog',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='city',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='city',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='country',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='country',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='sprint',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='sprint',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='state',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='state',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='system',
            name='order',
            field=models.PositiveSmallIntegerField(blank=True, default=0, help_text='Índice númerico de ordenamiento de este registro', null=True, verbose_name='índice de ordenamiento'),
        ),
        migrations.AlterField(
            model_name='system',
            name='version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]
