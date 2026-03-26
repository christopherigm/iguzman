import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_alter_companyhighlight_image_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='brand',
            name='system',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='brands',
                to='core.system',
            ),
        ),
    ]
