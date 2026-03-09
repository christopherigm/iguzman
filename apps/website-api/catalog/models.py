from django.db import models

from core.models import Buyable, MediumPicture, Common


CURRENCY_CHOICES = [
    ('USD', 'US Dollar'),
    ('EUR', 'Euro'),
    ('MXN', 'Mexican Peso'),
    ('GBP', 'British Pound'),
    ('CAD', 'Canadian Dollar'),
    ('ARS', 'Argentine Peso'),
    ('COP', 'Colombian Peso'),
    ('CLP', 'Chilean Peso'),
    ('BRL', 'Brazilian Real'),
]

DIMENSION_UNIT_CHOICES = [
    ('cm', 'Centimeters'),
    ('in', 'Inches'),
    ('m', 'Meters'),
    ('mm', 'Millimeters'),
]

WEIGHT_UNIT_CHOICES = [
    ('kg', 'Kilograms'),
    ('lb', 'Pounds'),
    ('g', 'Grams'),
    ('oz', 'Ounces'),
]


class Category(Common):
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='categories',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    name = models.CharField(max_length=255)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(null=True, blank=True)
    en_description = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = 'Category'
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(Buyable):
    """
    Concrete product model.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, description, href, fit, background_color
      - RegularPicture: image (max 1200px)
      - Buyable: system (FK), brand (FK)
    """

    category = models.ForeignKey(
        Category,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='products',
    )
    slug = models.SlugField(max_length=255, unique=True)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    en_description = models.TextField(null=True, blank=True)

    # Identifiers
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)
    barcode = models.CharField(max_length=100, null=True, blank=True)

    # Pricing
    price = models.DecimalField(max_digits=12, decimal_places=2)
    compare_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='USD')

    # Inventory
    in_stock = models.BooleanField(default=True)
    stock_count = models.PositiveIntegerField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)

    # Physical dimensions (all optional)
    length = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    width = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    height = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    dimension_unit = models.CharField(
        max_length=4, choices=DIMENSION_UNIT_CHOICES, default='cm', null=True, blank=True
    )
    weight_unit = models.CharField(
        max_length=4, choices=WEIGHT_UNIT_CHOICES, default='kg', null=True, blank=True
    )

    class Meta:
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        ordering = ['-created']

    def __str__(self):
        return self.name or self.slug


class ProductImage(MediumPicture):
    """Additional gallery images for a product."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='images',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Product Image'
        verbose_name_plural = 'Product Images'
        ordering = ['sort_order']

    def __str__(self):
        return f"Image for {self.product} (#{self.sort_order})"
