from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_brand_slug'),
        ('users', '0003_passwordresettoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='system',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='users',
                to='core.system',
            ),
        ),
    ]
