# Generated migration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0009_alter_product_image_alter_productimage_image_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='product',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='productcategory',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='productcategory',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='productimage',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='productimage',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='productvariantimage',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='productvariantimage',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='service',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='service',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='servicecategory',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='servicecategory',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='serviceimage',
            name='short_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='serviceimage',
            name='en_short_description',
            field=models.TextField(blank=True, null=True),
        ),
    ]
