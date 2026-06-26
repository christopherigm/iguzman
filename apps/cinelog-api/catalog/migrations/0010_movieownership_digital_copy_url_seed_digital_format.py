from django.db import migrations, models


def seed_digital_format(apps, schema_editor):
    """Seed the 'digital' Format lookup row (mirrors FORMAT_CHOICES)."""
    Format = apps.get_model('catalog', 'Format')
    Format.objects.get_or_create(code='digital', defaults={'label': 'Digital'})


def remove_digital_format(apps, schema_editor):
    Format = apps.get_model('catalog', 'Format')
    Format.objects.filter(code='digital').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0009_audioformat_hdrformat_spokenlanguage_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='movieownership',
            name='digital_copy_url',
            field=models.URLField(blank=True, max_length=1000),
        ),
        migrations.AlterField(
            model_name='format',
            name='code',
            field=models.CharField(
                choices=[
                    ('dvd', 'DVD'),
                    ('bluray', 'Blu-ray'),
                    ('4k', '4K UHD'),
                    ('digital', 'Digital'),
                    ('other', 'Other'),
                ],
                max_length=10,
                unique=True,
            ),
        ),
        migrations.RunPython(seed_digital_format, remove_digital_format),
    ]
