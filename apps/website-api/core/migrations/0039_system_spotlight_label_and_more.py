from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0038_system_pay_in_store_enabled_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='system',
            name='spotlight_label',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='en_spotlight_label',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='spotlight_title',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='en_spotlight_title',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='spotlight_text',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='en_spotlight_text',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='spotlight_button_label',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='en_spotlight_button_label',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='spotlight_button_link',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='system',
            name='spotlight_items',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Ordered refs of the featured items, e.g. [{"kind": "product", "id": 12}]. Max 3.',
            ),
        ),
    ]
