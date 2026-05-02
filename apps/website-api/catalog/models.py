from decimal import Decimal

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.db import models

from core.models import Buyable, Common, RegularPicture, StandardPicture, picture


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
      - StandardPicture: image (max 900px)
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
    is_ai_generated = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)

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
      - StandardPicture: image (max 900px)
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
    is_ai_generated = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
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


class ProductImage(StandardPicture):
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


class ServiceImage(StandardPicture):
    """Additional gallery images for a service."""

    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name='images',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Service Image'
        verbose_name_plural = 'Service Images'
        ordering = ['sort_order']

    def __str__(self):
        return f"Image for {self.service} (#{self.sort_order})"


# ---------------------------------------------------------------------------
# Variant system
# ---------------------------------------------------------------------------

class VariantOption(Common):
    """
    A named dimension of variation scoped to a System, e.g. "Size", "Color".

    One VariantOption can be reused across many products within the same system.
    """

    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='variant_options',
    )
    name = models.CharField(max_length=100)
    en_name = models.CharField(max_length=100, null=True, blank=True)
    slug = models.SlugField(max_length=100, unique=True)

    class Meta:
        verbose_name = 'Variant Option'
        verbose_name_plural = 'Variant Options'
        ordering = ['name']

    def __str__(self):
        return self.name


class VariantOptionValue(Common):
    """
    A concrete value within a VariantOption, e.g. "Small", "Red", "Cotton".

    ``color`` is optional and intended for color-swatch UI rendering.
    """

    option = models.ForeignKey(
        VariantOption,
        on_delete=models.CASCADE,
        related_name='values',
    )
    name = models.CharField(max_length=100)
    en_name = models.CharField(max_length=100, null=True, blank=True)
    slug = models.SlugField(max_length=100)
    sort_order = models.PositiveSmallIntegerField(default=0)
    color = ColorField(null=True, blank=True, help_text='Optional hex color for swatch display')

    class Meta:
        verbose_name = 'Variant Option Value'
        verbose_name_plural = 'Variant Option Values'
        ordering = ['sort_order', 'name']
        unique_together = [('option', 'slug')]

    def __str__(self):
        return f"{self.option.name}: {self.name}"


class BaseVariant(Common):
    """
    Abstract base for all purchasable variant models (ProductVariant, ServiceVariant, …).

    Provides the fields and behaviour shared by every variant type:
      - option_values M2M  (Django creates a separate join table per concrete model)
      - identity overrides: name, en_name, image, sku
      - pricing overrides:  price, compare_price, cost_price  (null = inherit from parent)
      - display:            is_default, sort_order
      - effective_* properties that fall back to the parent buyable
      - clean() enforcing one OptionValue per Option dimension

    Subclasses MUST implement ``_parent`` to return the related buyable instance
    (e.g. ``return self.product`` or ``return self.service``).
    """

    option_values = models.ManyToManyField(
        VariantOptionValue,
        blank=True,
        help_text='One value per VariantOption dimension (e.g. Size=Large, Color=Brown)',
    )

    # Identity overrides (null = inherit from parent buyable)
    name = models.CharField(max_length=255, null=True, blank=True)
    en_name = models.CharField(max_length=255, null=True, blank=True)
    image = models.ImageField(null=True, blank=True, upload_to=picture)
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)

    # Pricing overrides (null = inherit from parent buyable)
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    compare_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Display
    is_default = models.BooleanField(
        default=False,
        help_text='The variant pre-selected in the UI. Only one per parent should be default.',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ['sort_order']

    # ------------------------------------------------------------------
    # Subclass contract
    # ------------------------------------------------------------------

    @property
    def _parent(self):
        """Return the parent buyable instance (Product, Service, …)."""
        raise NotImplementedError("Subclasses must implement _parent")

    # ------------------------------------------------------------------
    # Effective-value helpers — always use these in serializers / views
    # ------------------------------------------------------------------

    @property
    def effective_name(self) -> str:
        return self.name or getattr(self._parent, 'name', '') or ''

    @property
    def effective_image(self):
        return self.image if self.image else self._parent.image

    @property
    def effective_price(self) -> Decimal:
        return self.price if self.price is not None else self._parent.price

    @property
    def effective_compare_price(self):
        return self.compare_price if self.compare_price is not None else self._parent.compare_price

    @property
    def effective_cost_price(self):
        return self.cost_price if self.cost_price is not None else self._parent.cost_price

    # ------------------------------------------------------------------
    # Common behaviour
    # ------------------------------------------------------------------

    def __str__(self):
        values = ', '.join(str(v) for v in self.option_values.all())
        label = self.effective_name or str(self.pk)
        return f"{label} ({values})" if values else label

    def clean(self):
        super().clean()
        # Enforce one OptionValue per Option dimension per variant
        if not self.pk:
            return
        seen_options: set = set()
        for val in self.option_values.select_related('option'):
            if val.option_id in seen_options:
                raise ValidationError(
                    f"Variant has more than one value for option '{val.option}'. "
                    "Only one value per option dimension is allowed."
                )
            seen_options.add(val.option_id)


class ProductVariant(BaseVariant):
    """
    A purchasable variant of a Product.

    Adds physical/inventory fields and delegates _parent to self.product.

    Example: a "Mexican Coffee Bag" product with variants:
      - Small  → price=$10, sku="COFFEE-S", stock=50
      - Medium → price=$18, sku="COFFEE-M", stock=30
      - Large  → price=$25, sku="COFFEE-L", stock=20
    """

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='variants',
    )

    # Product-specific fields
    barcode = models.CharField(max_length=100, null=True, blank=True)
    in_stock = models.BooleanField(default=True)
    stock_count = models.PositiveIntegerField(null=True, blank=True)

    # Physical overrides (null = inherit from product)
    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    length = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    width = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    height = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)

    class Meta(BaseVariant.Meta):
        verbose_name = 'Product Variant'
        verbose_name_plural = 'Product Variants'

    @property
    def _parent(self) -> Product:
        return self.product


class ProductVariantImage(StandardPicture):
    """Additional gallery images specific to a product variant."""

    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        related_name='images',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Product Variant Image'
        verbose_name_plural = 'Product Variant Images'
        ordering = ['sort_order']

    def __str__(self):
        return f"Image for {self.variant} (#{self.sort_order})"


class ServiceVariant(BaseVariant):
    """
    A purchasable variant of a Service.

    Adds duration/modality overrides and delegates _parent to self.service.

    Example: a "Personal Training" service with variants:
      - 1-hour session  → price=$60, duration=60
      - 30-min session  → price=$35, duration=30
      - Monthly package → price=$200, duration=None (package)
    """

    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name='variants',
    )

    # Service-specific overrides (null = inherit from service)
    duration = models.PositiveIntegerField(
        null=True, blank=True, help_text='Duration in minutes. Null = inherit from service.'
    )
    modality = models.CharField(
        max_length=16, choices=MODALITY_CHOICES, null=True, blank=True,
        help_text='Null = inherit from service.',
    )

    class Meta(BaseVariant.Meta):
        verbose_name = 'Service Variant'
        verbose_name_plural = 'Service Variants'

    @property
    def _parent(self) -> Service:
        return self.service

    @property
    def effective_duration(self):
        return self.duration if self.duration is not None else self.service.duration

    @property
    def effective_modality(self):
        return self.modality if self.modality is not None else self.service.modality
