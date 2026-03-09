from django.db import models

from core.models import Buyable, MediumPicture, RegularPicture


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


class ProductCategory(RegularPicture):
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='product_categories',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    slug = models.SlugField(max_length=255, unique=True)

    class Meta:
        verbose_name = 'Product Category'
        verbose_name_plural = 'Product Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(Buyable):
    """
    Concrete product model.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - RegularPicture: image (max 1200px)
      - Buyable: system (FK), brand (FK), price, compare_price, cost_price, currency
    """

    category = models.ForeignKey(
        ProductCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='products',
    )
    slug = models.SlugField(max_length=255, unique=True)

    # Identifiers
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)
    barcode = models.CharField(max_length=100, null=True, blank=True)

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


MODALITY_CHOICES = [
    ('online', 'Online'),
    ('in_person', 'In Person'),
    ('hybrid', 'Hybrid'),
]


class ServiceCategory(RegularPicture):
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='service_categories',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    slug = models.SlugField(max_length=255, unique=True)

    class Meta:
        verbose_name = 'Service Category'
        verbose_name_plural = 'Service Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Service(Buyable):
    """
    Concrete service model.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - RegularPicture: image (max 1200px)
      - Buyable: system (FK), brand (FK), price, compare_price, cost_price, currency
    """

    category = models.ForeignKey(
        ServiceCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='services',
    )
    slug = models.SlugField(max_length=255, unique=True)

    # Identifier
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)

    # Service details
    is_featured = models.BooleanField(default=False)
    duration = models.PositiveIntegerField(null=True, blank=True, help_text='Duration in minutes')
    modality = models.CharField(
        max_length=16, choices=MODALITY_CHOICES, default='in_person', null=True, blank=True
    )

    class Meta:
        verbose_name = 'Service'
        verbose_name_plural = 'Services'
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
