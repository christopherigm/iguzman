# Generated by Django 4.1.9 on 2023-06-29 20:43

import common.validators
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('service', '0001_initial'),
        ('product', '0001_initial'),
        ('common', '0003_nediiplan'),
        ('stand', '0002_stand_plan'),
        ('vehicle', '0001_initial'),
        ('meal', '0001_initial'),
        ('real_estate', '0001_initial'),
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('address', models.CharField(max_length=128, verbose_name='Dirección de entrega')),
                ('receptor_name', models.CharField(max_length=40, verbose_name='Nombre del receptor')),
                ('phone', models.CharField(max_length=10, verbose_name='Teléfono')),
                ('reference', models.CharField(blank=True, max_length=64, null=True, verbose_name='Referencia del lugar')),
                ('broker_id', models.CharField(max_length=64, verbose_name='Broker ID')),
                ('backup_user_name', models.CharField(max_length=64, verbose_name='Nombre del comprador')),
            ],
            options={
                'verbose_name': 'Órden de compra',
                'verbose_name_plural': 'Órdenes de compra',
            },
        ),
        migrations.AddField(
            model_name='user',
            name='biography',
            field=models.TextField(blank=True, default='Biografia del expositor', null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='is_seller',
            field=models.BooleanField(default=False, verbose_name='Es expsitor?'),
        ),
        migrations.AddField(
            model_name='user',
            name='newsletter',
            field=models.BooleanField(default=False, verbose_name='Newsletter activado?'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_address',
            field=models.CharField(blank=True, max_length=256, null=True, verbose_name='Dirección de Expositor'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_email',
            field=models.EmailField(blank=True, max_length=256, null=True, verbose_name='Email de Expositor'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_office_phone',
            field=models.CharField(blank=True, max_length=10, null=True, verbose_name='Teléfono de oficina de Expositor'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_phone',
            field=models.CharField(blank=True, max_length=10, null=True, verbose_name='Teléfono de Expositor'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_position',
            field=models.CharField(blank=True, max_length=32, null=True, verbose_name='Puesto de Expositor'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_position_description',
            field=models.TextField(blank=True, default='Descripción del puesto', null=True, verbose_name='Descripción del puesto'),
        ),
        migrations.AddField(
            model_name='user',
            name='owner_whatsapp',
            field=models.CharField(blank=True, max_length=14, null=True, verbose_name='Whats App de Expositor'),
        ),
        migrations.AddField(
            model_name='user',
            name='promotions',
            field=models.BooleanField(default=False, verbose_name='Promociones activadas?'),
        ),
        migrations.CreateModel(
            name='UserOrderBuyableItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('backup_name', models.CharField(max_length=64, verbose_name='Nombre de elemento comprado')),
                ('backup_user_name', models.CharField(max_length=64, verbose_name='Nombre del comprador')),
                ('backup_final_price', models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Precio final')),
                ('quantity', models.PositiveSmallIntegerField(default=1, help_text='Cantidad comprada', verbose_name='Cantidad')),
                ('meal', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='meal.meal', verbose_name='Platillo')),
                ('meal_addons', models.ManyToManyField(blank=True, help_text='Ingredientes / Adicionales', to='meal.mealaddon', verbose_name='Adicionales')),
                ('product', models.ForeignKey(blank=True, help_text='Producto de la promoción', null=True, on_delete=django.db.models.deletion.CASCADE, to='product.product', verbose_name='Producto')),
                ('purchase_order', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='users.userorder', verbose_name='Orden de compra')),
                ('real_estate', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='real_estate.realestate', verbose_name='Inmueble')),
                ('service', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='service.service', verbose_name='Servicio')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL, verbose_name='Usuario')),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='vehicle.vehicle', verbose_name='Vehículo')),
            ],
            options={
                'verbose_name': 'Elemento de la órden',
                'verbose_name_plural': 'Elementos de la órden',
            },
        ),
        migrations.AddField(
            model_name='userorder',
            name='order_items',
            field=models.ManyToManyField(blank=True, related_name='order_buyable_items', to='users.userorderbuyableitem', verbose_name='Elementos de la órden'),
        ),
        migrations.AddField(
            model_name='userorder',
            name='user',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL, verbose_name='Usuario'),
        ),
        migrations.CreateModel(
            name='UserFavoriteBuyableItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('backup_name', models.CharField(max_length=64, verbose_name='Nombre de elemento comprado')),
                ('backup_user_name', models.CharField(max_length=64, verbose_name='Nombre del comprador')),
                ('backup_final_price', models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Precio final')),
                ('meal', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='meal.meal', verbose_name='Platillo')),
                ('meal_addons', models.ManyToManyField(blank=True, help_text='Ingredientes / Adicionales', to='meal.mealaddon', verbose_name='Adicionales')),
                ('product', models.ForeignKey(blank=True, help_text='Producto de la promoción', null=True, on_delete=django.db.models.deletion.CASCADE, to='product.product', verbose_name='Producto')),
                ('real_estate', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='real_estate.realestate', verbose_name='Inmueble')),
                ('service', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='service.service', verbose_name='Servicio')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL, verbose_name='Usuario')),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='vehicle.vehicle', verbose_name='Vehículo')),
            ],
            options={
                'verbose_name': 'Elemento de compra favorito',
                'verbose_name_plural': 'Elementos de compra favoritos',
            },
        ),
        migrations.CreateModel(
            name='UserAddress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('alias', models.CharField(max_length=64)),
                ('receptor_name', models.CharField(blank=True, max_length=64, null=True, validators=[common.validators.ModelValidators.name])),
                ('phone', models.CharField(blank=True, max_length=10, null=True, validators=[common.validators.ModelValidators.us_phone])),
                ('zip_code', models.CharField(blank=True, max_length=5, null=True, validators=[common.validators.ModelValidators.us_zip_code])),
                ('street', models.CharField(max_length=32)),
                ('ext_number', models.CharField(blank=True, max_length=10, null=True)),
                ('int_number', models.CharField(blank=True, max_length=10, null=True)),
                ('reference', models.CharField(blank=True, max_length=128, null=True)),
                ('address_type', models.CharField(blank=True, choices=[('house', 'house'), ('apartment', 'apartment'), ('work', 'work'), ('mail_box', 'mail_box')], max_length=16, null=True)),
                ('delivery_instructions', models.CharField(blank=True, max_length=32, null=True)),
                ('city', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='user_city_address', to='common.city')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'User address',
                'verbose_name_plural': 'User address',
            },
        ),
        migrations.AlterUniqueTogether(
            name='userorder',
            unique_together={('user', 'broker_id')},
        ),
        migrations.CreateModel(
            name='UserFavoriteStand',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('stand', models.ForeignKey(help_text='Empresa al que pertenece este registro', null=True, on_delete=django.db.models.deletion.CASCADE, to='stand.stand', verbose_name='Empresa')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL, verbose_name='Usuario')),
            ],
            options={
                'verbose_name': 'Stands favorito',
                'verbose_name_plural': 'Stands favoritos',
                'unique_together': {('stand', 'user')},
            },
        ),
        migrations.CreateModel(
            name='UserCartBuyableItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('order', models.PositiveSmallIntegerField(blank=True, default=0, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveSmallIntegerField(default=0)),
                ('backup_name', models.CharField(max_length=64, verbose_name='Nombre de elemento comprado')),
                ('backup_user_name', models.CharField(max_length=64, verbose_name='Nombre del comprador')),
                ('backup_final_price', models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Precio final')),
                ('quantity', models.PositiveSmallIntegerField(default=1, help_text='Cantidad comprada', verbose_name='Cantidad')),
                ('meal', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='meal.meal', verbose_name='Platillo')),
                ('meal_addons', models.ManyToManyField(blank=True, help_text='Ingredientes / Adicionales', to='meal.mealaddon', verbose_name='Adicionales')),
                ('product', models.ForeignKey(blank=True, help_text='Producto de la promoción', null=True, on_delete=django.db.models.deletion.CASCADE, to='product.product', verbose_name='Producto')),
                ('real_estate', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='real_estate.realestate', verbose_name='Inmueble')),
                ('service', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='service.service', verbose_name='Servicio')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL, verbose_name='Usuario')),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='vehicle.vehicle', verbose_name='Vehículo')),
            ],
            options={
                'verbose_name': 'Carrito de compras',
                'verbose_name_plural': 'Carritos de compras',
                'unique_together': {('user', 'meal'), ('user', 'product'), ('user', 'service'), ('user', 'vehicle'), ('user', 'real_estate')},
            },
        ),
    ]
