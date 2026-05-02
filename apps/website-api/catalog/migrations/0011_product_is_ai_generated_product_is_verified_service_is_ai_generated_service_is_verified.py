from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0010_basepicture_short_description'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='is_ai_generated',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='product',
            name='is_verified',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='service',
            name='is_ai_generated',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='service',
            name='is_verified',
            field=models.BooleanField(default=False),
        ),
    ]
