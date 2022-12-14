# Generated by Django 3.1.5 on 2021-09-05 08:10

from django.db import migrations
import tinymce.models


class Migration(migrations.Migration):

    dependencies = [
        ('stands', '0016_auto_20210818_0540'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='group',
            options={'verbose_name': 'Pabellon', 'verbose_name_plural': 'Pabellones'},
        ),
        migrations.AddField(
            model_name='stand',
            name='mission',
            field=tinymce.models.HTMLField(blank=True, default='Misión del Stand', help_text='Misión del Stand', null=True, verbose_name='Misión del Stand'),
        ),
    ]
