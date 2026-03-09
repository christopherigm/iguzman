import colorfield.fields
import core.fields
import core.models
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0002_brand'),
    ]

    operations = [
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(max_length=255)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('slug', models.SlugField(max_length=255, unique=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('en_description', models.TextField(blank=True, null=True)),
                ('parent', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='children',
                    to='catalog.category',
                )),
                ('system', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='categories',
                    to='core.system',
                )),
            ],
            options={
                'verbose_name': 'Category',
                'verbose_name_plural': 'Categories',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Product',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(blank=True, max_length=255, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('href', models.URLField(blank=True, max_length=255, null=True)),
                ('fit', models.CharField(
                    blank=True,
                    choices=[('cover', 'Cover'), ('contain', 'Contain'), ('fill', 'Fill'), ('scale-down', 'Scale Down'), ('none', 'None')],
                    default='cover', max_length=16, null=True,
                )),
                ('background_color', colorfield.fields.ColorField(blank=True, default='#fff', image_field=None, max_length=25, null=True, samples=None)),
                ('image', core.fields.ResizedImageField(blank=True, max_size=[1200, None], null=True, upload_to=core.models.picture)),
                ('en_name', models.CharField(blank=True, max_length=255, null=True)),
                ('en_description', models.TextField(blank=True, null=True)),
                ('slug', models.SlugField(max_length=255, unique=True)),
                ('sku', models.CharField(blank=True, max_length=100, null=True, unique=True)),
                ('barcode', models.CharField(blank=True, max_length=100, null=True)),
                ('price', models.DecimalField(decimal_places=2, max_digits=12)),
                ('compare_price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('cost_price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('currency', models.CharField(
                    choices=[
                        ('USD', 'US Dollar'), ('EUR', 'Euro'), ('MXN', 'Mexican Peso'),
                        ('GBP', 'British Pound'), ('CAD', 'Canadian Dollar'), ('ARS', 'Argentine Peso'),
                        ('COP', 'Colombian Peso'), ('CLP', 'Chilean Peso'), ('BRL', 'Brazilian Real'),
                    ],
                    default='USD', max_length=3,
                )),
                ('in_stock', models.BooleanField(default=True)),
                ('stock_count', models.PositiveIntegerField(blank=True, null=True)),
                ('is_featured', models.BooleanField(default=False)),
                ('length', models.DecimalField(blank=True, decimal_places=3, max_digits=10, null=True)),
                ('width', models.DecimalField(blank=True, decimal_places=3, max_digits=10, null=True)),
                ('height', models.DecimalField(blank=True, decimal_places=3, max_digits=10, null=True)),
                ('weight', models.DecimalField(blank=True, decimal_places=3, max_digits=10, null=True)),
                ('dimension_unit', models.CharField(
                    blank=True,
                    choices=[('cm', 'Centimeters'), ('in', 'Inches'), ('m', 'Meters'), ('mm', 'Millimeters')],
                    default='cm', max_length=4, null=True,
                )),
                ('weight_unit', models.CharField(
                    blank=True,
                    choices=[('kg', 'Kilograms'), ('lb', 'Pounds'), ('g', 'Grams'), ('oz', 'Ounces')],
                    default='kg', max_length=4, null=True,
                )),
                ('brand', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to='core.brand',
                )),
                ('system', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to='core.system',
                )),
                ('category', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='products',
                    to='catalog.category',
                )),
            ],
            options={
                'verbose_name': 'Product',
                'verbose_name_plural': 'Products',
                'ordering': ['-created'],
            },
        ),
        migrations.CreateModel(
            name='ProductImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=0)),
                ('name', models.CharField(blank=True, max_length=255, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('href', models.URLField(blank=True, max_length=255, null=True)),
                ('fit', models.CharField(
                    blank=True,
                    choices=[('cover', 'Cover'), ('contain', 'Contain'), ('fill', 'Fill'), ('scale-down', 'Scale Down'), ('none', 'None')],
                    default='cover', max_length=16, null=True,
                )),
                ('background_color', colorfield.fields.ColorField(blank=True, default='#fff', image_field=None, max_length=25, null=True, samples=None)),
                ('image', core.fields.ResizedImageField(blank=True, max_size=[512, None], null=True, upload_to=core.models.picture)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
                ('product', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='images',
                    to='catalog.product',
                )),
            ],
            options={
                'verbose_name': 'Product Image',
                'verbose_name_plural': 'Product Images',
                'ordering': ['sort_order'],
            },
        ),
    ]
