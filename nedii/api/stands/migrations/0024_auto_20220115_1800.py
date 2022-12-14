# Generated by Django 3.2.7 on 2022-01-16 01:00

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stands', '0023_auto_20220110_2246'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='standpictures',
            options={'verbose_name': 'Foto de la empresa', 'verbose_name_plural': 'Fotos de la empresa'},
        ),
        migrations.AlterField(
            model_name='standnews',
            name='stand',
            field=models.ForeignKey(help_text='Empresa al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Empresa'),
        ),
        migrations.AlterField(
            model_name='standphones',
            name='phone',
            field=models.CharField(help_text='Teléfono de la empresa', max_length=10, verbose_name='Teléfono'),
        ),
        migrations.AlterField(
            model_name='standphones',
            name='stand',
            field=models.ForeignKey(help_text='Empresa al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Empresa'),
        ),
        migrations.AlterField(
            model_name='standpictures',
            name='stand',
            field=models.ForeignKey(help_text='Empresa al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Empresa'),
        ),
        migrations.AlterField(
            model_name='standpromotion',
            name='stand',
            field=models.ForeignKey(help_text='Empresa al que pertenece este registro', on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Empresa'),
        ),
        migrations.AlterField(
            model_name='standrating',
            name='stand',
            field=models.ForeignKey(help_text='Empresa al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Empresa'),
        ),
        migrations.AlterField(
            model_name='videolink',
            name='stand',
            field=models.ForeignKey(help_text='Empresa al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stands.stand', verbose_name='Empresa'),
        ),
    ]
