# Generated by Django 4.1.9 on 2024-01-13 08:49

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_alter_user_legal_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='willing_to_comute',
            field=models.BooleanField(default=True),
        ),
    ]
