import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django_resized import ResizedImageField
from common.tools import set_media_url
from colorfield.fields import ColorField
from django.db import models
from common.models import (
    CommonFields,
    RegularPicture,
    Address,
)
from enum import Enum


def picture(instance, filename):
    return set_media_url('profile', filename)

class User(AbstractUser):
    token=models.UUIDField(
        null=True,
        blank=True,
        default=uuid.uuid4
    )
    img_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[512, 512],
        quality=90,
        upload_to=picture
    )
    img_hero_picture=ResizedImageField(
        null=True,
        blank=True,
        size=[1920, 1080],
        quality=90,
        upload_to=picture
    )
    theme=models.CharField(
        max_length=16,
        null=False,
        blank=False,
        default='default'
    )
    theme_color=ColorField(
        default='#FF0000'
    )
    profile_picture_shape=models.CharField(
        max_length=16,
        null=False,
        blank=False,
        default='default'
    )

    ######### Nedii specifics #########
    is_seller=models.BooleanField (
        verbose_name='Es expsitor?',
        default=False,
        blank=False,
        null=False
    )
    newsletter=models.BooleanField (
        verbose_name='Newsletter activado?',
        default=False,
        blank=False,
        null=False
    )
    promotions=models.BooleanField (
        verbose_name='Promociones activadas?',
        default=False,
        blank=False,
        null=False
    )
    biography=models.TextField(
        null=True,
        blank=True,
        default='Biografia del expositor'
    )
    owner_position=models.CharField(
        verbose_name='Puesto de Expositor',
        max_length=32,
        null=True,
        blank=True
    )
    owner_position_description=models.TextField(
        verbose_name='Descripción del puesto',
        null=True,
        blank=True,
        default='Descripción del puesto'
    )
    owner_phone=models.CharField(
        verbose_name='Teléfono de Expositor',
        max_length=10,
        null=True,
        blank=True
    )
    owner_office_phone=models.CharField(
        verbose_name='Teléfono de oficina de Expositor',
        max_length=10,
        null=True,
        blank=True
    )
    owner_email=models.EmailField(
        verbose_name='Email de Expositor',
        max_length=256,
        null=True,
        blank=True
    )
    owner_whatsapp=models.CharField(
        verbose_name='Whats App de Expositor',
        max_length=14,
        null=True,
        blank=True
    )
    owner_address=models.CharField(
        verbose_name='Dirección de Expositor',
        max_length=256,
        null=True,
        blank=True
    )
    ######### Nedii specifics #########

    def __str__(self):
        return self.username

    class JSONAPIMeta:
        resource_name='User'


######### Nedii specifics #########
class UserAbstractBuyableItem(CommonFields):
    user=models.ForeignKey(
        'users.User',
        verbose_name='Usuario',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    product=models.ForeignKey(
        'product.Product',
        verbose_name='Producto',
        null=True,
        blank=True,
        help_text='Producto de la promoción',
        on_delete=models.CASCADE
    )
    service=models.ForeignKey(
        'service.Service',
        verbose_name='Servicio',
        blank=True,
        null=True,
        on_delete=models.CASCADE
    )
    meal=models.ForeignKey(
        'meal.Meal',
        verbose_name='Platillo',
        blank=True,
        null=True,
        on_delete=models.CASCADE
    )
    real_estate=models.ForeignKey(
        'real_estate.RealEstate',
        verbose_name='Inmueble',
        blank=True,
        null=True,
        on_delete=models.CASCADE
    )
    vehicle=models.ForeignKey(
        'vehicle.Vehicle',
        verbose_name='Vehículo',
        blank=True,
        null=True,
        on_delete=models.CASCADE
    )
    meal_addons=models.ManyToManyField(
        'meal.MealAddon',
        verbose_name='Adicionales',
        blank=True,
        help_text='Ingredientes / Adicionales'
    )
    backup_name=models.CharField(
        verbose_name='Nombre de elemento comprado',
        null=False,
        blank=False,
        max_length=64,
    )
    backup_user_name=models.CharField(
        verbose_name='Nombre del comprador',
        null=False,
        blank=False,
        max_length=64,
    )
    backup_final_price=models.DecimalField(
        verbose_name='Precio final',
        max_digits=10,
        decimal_places=2,
        null=False,
        blank=False,
        default=0
    )

    def __str__(self):
        name=''
        if self.product is not None:
            name=self.product.name
        if self.service is not None:
            name=self.service.name
        if self.meal is not None:
            name=self.meal.name
        if self.real_estate is not None:
            name=self.real_estate.name
        if self.vehicle is not None:
            name='{} {} {}'.format(
                self.vehicle.model.make.name,
                self.vehicle.model.name,
                self.vehicle.year,
            )
        return name

    def save(self, *args, **kwargs):
        name=''
        if self.product is not None:
            name=self.product.name
        if self.service is not None:
            name=self.service.name
        if self.meal is not None:
            name=self.meal.name
        if self.real_estate is not None:
            name=self.real_estate.name
        if self.vehicle is not None:
            name='{} {} {}'.format(
                self.vehicle.model.make.name,
                self.vehicle.model.name,
                self.vehicle.year,
            )
        self.backup_name=name

        final_price=0
        if self.product is not None:
            final_price=self.product.final_price
        if self.service is not None:
            final_price=self.service.final_price
        if self.meal is not None:
            final_price=self.meal.final_price
        if self.real_estate is not None:
            final_price=self.real_estate.final_price
        if self.vehicle is not None:
            final_price=self.vehicle.final_price
        self.backup_final_price=final_price

        backup_user_name='{} {}'.format(
            self.user.last_name,
            self.user.first_name
        )
        self.backup_user_name=backup_user_name

        super().save(*args, **kwargs)

    class Meta:
        abstract=True


class AddressType(Enum):
    HOUSE='house'
    APARTMENT='apartment'
    WORK='work'
    MAIL_BOX='mail_box'

class UserAddress(Address):
    user=models.ForeignKey (
        User,
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    city=models.ForeignKey (
        'common.City',
        related_name='user_city_address',
        null=True,
        blank=True,
        on_delete=models.CASCADE
    )
    address_type=models.CharField(
        null=True,
        blank=True,
        max_length=16,
        choices=[(i.value, i.value) for i in AddressType]
    )
    delivery_instructions=models.CharField (
        max_length=32,
        null=True,
        blank=True
    )
    def __str__(self):
        return self.alias
    class Meta:
        verbose_name='User address'
        verbose_name_plural='User address'

    class JSONAPIMeta:
        resource_name='UserAddress'


class UserCartBuyableItem(UserAbstractBuyableItem):
    quantity=models.PositiveSmallIntegerField(
        verbose_name='Cantidad',
        null=False,
        blank=False,
        default=1,
        help_text='Cantidad comprada'
    )
    class Meta:
        verbose_name='Carrito de compras'
        verbose_name_plural='Carritos de compras'
        unique_together=[
            ('user', 'product'),
            ('user', 'service'),
            ('user', 'meal'),
            ('user', 'real_estate'),
            ('user', 'vehicle'),
        ]

    class JSONAPIMeta:
        resource_name='UserCartBuyableItem'


class UserFavoriteBuyableItem(UserAbstractBuyableItem):
    class Meta:
        verbose_name='Elemento de compra favorito'
        verbose_name_plural='Elementos de compra favoritos'
    class JSONAPIMeta:
        resource_name='UserFavoriteBuyableItem'


class UserFavoriteStand(CommonFields):
    stand=models.ForeignKey(
        'stand.Stand',
        verbose_name='Empresa',
        null=True,
        blank=False,
        help_text='Empresa al que pertenece este registro',
        on_delete=models.CASCADE
    )
    user=models.ForeignKey(
        'users.User',
        verbose_name='Usuario',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    def __str__(self):
        return '{} likes {}'.format(
            self.user.first_name,
            self.stand.name
        )
    class Meta:
        verbose_name='Stands favorito'
        verbose_name_plural='Stands favoritos'
        unique_together=(('stand', 'user'),)

    class JSONAPIMeta:
        resource_name='UserFavoriteStand'


class UserOrderBuyableItem(UserAbstractBuyableItem):
    quantity=models.PositiveSmallIntegerField(
        verbose_name='Cantidad',
        null=False,
        blank=False,
        default=1,
        help_text='Cantidad comprada'
    )
    purchase_order=models.ForeignKey(
        'users.UserOrder',
        verbose_name='Orden de compra',
        null=True,
        blank=False,
        on_delete=models.CASCADE
    )

    class Meta:
        verbose_name='Elemento de la órden'
        verbose_name_plural='Elementos de la órden'

    class JSONAPIMeta:
        resource_name='UserOrderBuyableItem'


class UserOrder(CommonFields):
    user=models.ForeignKey(
        User,
        verbose_name='Usuario',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    address=models.CharField(
        verbose_name='Dirección de entrega',
        null=False,
        blank=False,
        max_length=128
    )
    receptor_name=models.CharField(
        verbose_name='Nombre del receptor',
        null=False,
        blank=False,
        max_length=40,
    )
    phone=models.CharField(
        verbose_name='Teléfono',
        null=False,
        blank=False,
        max_length=10,
    )
    reference=models.CharField(
        verbose_name='Referencia del lugar',
        null=True,
        blank=True,
        max_length=64,
    )
    broker_id=models.CharField(
        verbose_name='Broker ID',
        max_length=64,
        null=False,
        blank=False
    )
    order_items=models.ManyToManyField(
        'users.UserOrderBuyableItem',
        related_name='order_buyable_items',
        verbose_name='Elementos de la órden',
        blank=True
    )
    backup_user_name=models.CharField(
        verbose_name='Nombre del comprador',
        null=False,
        blank=False,
        max_length=64,
    )
    def save(self, *args, **kwargs):
        backup_user_name='{} {}'.format(
            self.user.last_name,
            self.user.first_name
        )
        self.backup_user_name=backup_user_name
        super().save(*args, **kwargs)
    def __str__(self):
        return '{0} ({1})'.format(self.user,self.broker_id)
    class Meta:
        verbose_name='Órden de compra'
        verbose_name_plural='Órdenes de compra'
        unique_together=(('user', 'broker_id'),)
    class JSONAPIMeta:
        resource_name='UserOrder'
