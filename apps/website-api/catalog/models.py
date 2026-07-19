from decimal import Decimal

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.db import models

from core.models import Buyable, Common, RegularPicture, SmallPicture, StandardPicture, picture

from .units import convert_quantity


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
        on_delete=models.CASCADE,
        related_name='product_categories',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
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
        on_delete=models.CASCADE,
        related_name='products',
    )
    slug = models.SlugField(max_length=255, unique=True)

    # Identifiers
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)
    barcode = models.CharField(max_length=100, null=True, blank=True)

    video_link = models.URLField(
        max_length=255,
        null=True,
        blank=True,
        help_text='YouTube, Vimeo or direct video URL rendered as a hero above the detail page.',
    )

    # Inventory
    in_stock = models.BooleanField(default=True)
    stock_count = models.PositiveIntegerField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    is_ai_generated = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)

    # Physical dimensions (all optional)
    length = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    width = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    height = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
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
        on_delete=models.CASCADE,
        related_name='service_categories',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
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
        on_delete=models.CASCADE,
        related_name='services',
    )
    slug = models.SlugField(max_length=255, unique=True)

    # Identifier
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)

    video_link = models.URLField(
        max_length=255,
        null=True,
        blank=True,
        help_text='YouTube, Vimeo or direct video URL rendered as a hero above the detail page.',
    )

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
        on_delete=models.CASCADE,
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
    # Effective-value helpers - always use these in serializers / views
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
    weight = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    length = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    width = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    height = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)

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


# ---------------------------------------------------------------------------
# Menu (food) system
# ---------------------------------------------------------------------------
#
# The third buyable family alongside Product and Service, for restaurants and
# food businesses: meals, dishes, drinks, packaged food. It differs from Product
# in two ways that earn it its own model rather than a Product category:
#
#   * Ingredients are *priced customisation*. A MenuItem carries a fixed base
#     price plus a list of MenuItemIngredient rows; each ingredient may be a
#     default (included in the base) or an optional add-on with a per-unit
#     up-charge. What the customer picks adjusts the price up from the base, and
#     the chosen selection travels through the cart into the order snapshot.
#   * A Recipe (RecipeStep rows) is *internal*: preparation instructions for the
#     kitchen, never served on the public API. See RecipeStep.

QUANTITY_UNIT_CHOICES = [
    ('g', 'Grams'),
    ('kg', 'Kilograms'),
    ('mg', 'Milligrams'),
    ('ml', 'Milliliters'),
    ('l', 'Liters'),
    ('oz', 'Ounces'),
    ('lb', 'Pounds'),
    ('cup', 'Cups'),
    ('tbsp', 'Tablespoons'),
    ('tsp', 'Teaspoons'),
    ('pc', 'Pieces'),
    ('slice', 'Slices'),
    ('scoop', 'Scoops'),
]


class MenuCategory(RegularPicture):
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='menu_categories',
    )
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='children',
    )
    slug = models.SlugField(max_length=255, unique=True)

    class Meta:
        verbose_name = 'Menu Category'
        verbose_name_plural = 'Menu Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class MenuItem(Buyable):
    """
    A purchasable meal, dish, or drink.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - StandardPicture: image (max 900px)
      - Buyable: system (FK), brand (FK), price, compare_price, cost_price, currency

    ``price`` is the *base* price; the customer's ingredient choices (see
    ``MenuItemIngredient``) add up-charges on top. ``price_for_selection`` is the
    single source of truth for that arithmetic and is used by the cart, checkout,
    and storefront alike so a customised price can never drift between them.
    """

    category = models.ForeignKey(
        MenuCategory,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='menu_items',
    )
    slug = models.SlugField(max_length=255, unique=True)

    # Identifier
    sku = models.CharField(max_length=100, null=True, blank=True, unique=True)

    video_link = models.URLField(
        max_length=255,
        null=True,
        blank=True,
        help_text='YouTube, Vimeo or direct video URL rendered as a hero above the detail page.',
    )

    # Availability / display. Food is not stock-counted like a product; a dish is
    # either on the menu today or it isn't, so a single boolean stands in for the
    # product's in_stock + stock_count pair.
    is_available = models.BooleanField(
        default=True, help_text='Whether this item can be ordered right now.'
    )
    is_featured = models.BooleanField(default=False)
    is_ai_generated = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    show_nutrition_label = models.BooleanField(
        default=True,
        help_text='Show the calorie/nutrition breakdown card on the public detail page.',
    )

    # Dietary / serving metadata (all optional, public).
    spice_level = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text='0-5, where 0 is not spicy.'
    )
    is_organic = models.BooleanField(default=False)
    is_vegetarian = models.BooleanField(default=False)
    is_vegan = models.BooleanField(default=False)
    is_gluten_free = models.BooleanField(default=False)
    allergens = models.CharField(
        max_length=255, null=True, blank=True,
        help_text='Comma-separated allergen list, e.g. "peanuts, dairy, gluten".',
    )

    # Recipe metadata (INTERNAL - kitchen prep, never served on the public API).
    prep_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    cook_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    servings = models.PositiveIntegerField(null=True, blank=True)
    recipe_notes = models.TextField(
        null=True, blank=True, help_text='Internal kitchen notes; not exposed publicly.'
    )

    class Meta:
        verbose_name = 'Menu Item'
        verbose_name_plural = 'Menu Items'
        ordering = ['-created']

    def __str__(self):
        return self.name or self.slug

    def price_for_selection(self, selection) -> Decimal:
        """Base price plus every up-charge implied by ``selection``.

        ``selection`` is a normalised list of ``{"ingredient": <id>, "quantity":
        <int>}`` dicts (see ``normalize_selection``). Only ingredients that
        belong to this item are counted, and only the units charged for beyond
        what the base already includes: a default ingredient's first unit is free
        (removing it never refunds - the base was already paid), and every unit
        above that costs ``ingredient.price``. This is the *only* place the
        customised total is computed.
        """
        by_id = {ing.id: ing for ing in self.ingredients.all()}
        total = self.price
        for row in (selection or []):
            ingredient = by_id.get(row.get('ingredient'))
            if ingredient is None:
                continue
            total += ingredient.upcharge_for_quantity(row.get('quantity', 0))
        return total


class MenuItemImage(StandardPicture):
    """Additional gallery images for a menu item."""

    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name='images',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Menu Item Image'
        verbose_name_plural = 'Menu Item Images'
        ordering = ['sort_order']

    def __str__(self):
        return f"Image for {self.menu_item} (#{self.sort_order})"


class Ingredient(SmallPicture):
    """A reusable, System-scoped ingredient shared across menu items.

    One ``Ingredient`` is the single source of truth for an edible component's
    identity (name, image) and its nutrition, so the same "butter" or "orange"
    can be referenced by many dishes instead of being re-typed on each. A
    ``MenuItemIngredient`` points at one of these and adds the per-dish recipe
    *portion* and *pricing*; calories and every other nutrient are then computed
    by scaling this record's values to that portion.

    Nutrition is stored per a fixed reference amount - ``nutrition_basis_quantity``
    of ``unit`` (e.g. 100 g, or 1 pc). ``unit`` doubles as *how the ingredient is
    bought/measured*, so it fits the purchasing reality: an orange is counted in
    pieces (``unit='pc'``, basis 1), butter is weighed in grams (``unit='g'``,
    basis 100). See ``nutrient_for_portion`` for the scaling, and ``catalog.units``
    for the same-dimension conversion it relies on.
    """

    # The 15 FDA "Nutrition Facts" quantities, each stated per
    # ``nutrition_basis_quantity`` of ``unit``. Listed once here so the scaling
    # helper and serializers can iterate them without repetition.
    NUTRIENT_FIELDS = (
        'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol',
        'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
        'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
    )

    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='ingredients',
    )
    # `name` is required here, overriding BasePicture's nullable `name`; `image`
    # (256px), `en_name`, `description`, etc. come from SmallPicture.
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)

    # How the ingredient is bought/measured, and the unit the nutrition basis and
    # every recipe portion are expressed in (orange -> 'pc', butter -> 'g').
    unit = models.CharField(max_length=8, choices=QUANTITY_UNIT_CHOICES)
    nutrition_basis_quantity = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('100'),
        help_text='The nutrition values below are stated per this many `unit` '
                  '(e.g. 100 for "per 100 g", 1 for "per piece").',
    )

    # ── FDA Nutrition Facts panel (all per `nutrition_basis_quantity` `unit`) ──
    calories = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, help_text='kcal.'
    )
    total_fat = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    saturated_fat = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    trans_fat = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    cholesterol = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='milligrams.')
    sodium = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='milligrams.')
    total_carbohydrate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    dietary_fiber = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    total_sugars = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    added_sugars = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    protein = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='grams.')
    vitamin_d = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='micrograms.')
    calcium = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='milligrams.')
    iron = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='milligrams.')
    potassium = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='milligrams.')

    class Meta:
        verbose_name = 'Ingredient'
        verbose_name_plural = 'Ingredients'
        ordering = ['name']

    def __str__(self):
        return self.name

    def nutrient_for_portion(self, field, quantity, unit):
        """Scale one stored nutrient to a recipe portion.

        Converts ``quantity`` of ``unit`` into this ingredient's basis ``unit``
        and scales the per-basis value by ``portion / nutrition_basis_quantity``.
        Returns ``None`` (nutrient not chartable) when the portion unit is not
        convertible to the basis unit, the basis is zero, or the value is unset.
        """
        base_qty = convert_quantity(quantity, unit, self.unit)
        if base_qty is None or not self.nutrition_basis_quantity:
            return None
        value = getattr(self, field, None)
        if value is None:
            return None
        return value * base_qty / self.nutrition_basis_quantity


class MenuItemIngredient(Common):
    """One priced, customisable component of a MenuItem.

    The pricing model is *base price + add-on deltas* (see ``MenuItem``):

      - ``is_default`` - included in the item's base price and pre-selected.
      - ``is_removable`` - a default the customer may deselect. Removing it does
        not refund (the base already covered it); it just changes the kitchen
        ticket.
      - ``price`` - the up-charge for one *chargeable* unit. For a default
        ingredient the first unit is free and this applies to each extra; for an
        optional add-on every selected unit is charged.
      - ``max_quantity`` - the largest quantity the customer may select (e.g. 2
        for "double patty"). ``quantity``/``unit`` are the descriptive recipe
        portion (e.g. 100 g of cheese) and do not affect price.
    """

    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name='ingredients',
    )
    # Identity (name, image) and nutrition now live on the shared Ingredient;
    # PROTECT so an ingredient still used by a dish cannot be deleted.
    ingredient = models.ForeignKey(
        'Ingredient',
        on_delete=models.PROTECT,
        related_name='menu_uses',
    )

    # The recipe portion. `quantity`/`unit` are descriptive *and* drive the
    # nutrient scaling (see `calories`/`nutrient`); they do not affect price.
    quantity = models.DecimalField(max_digits=10, decimal_places=1, null=True, blank=True)
    unit = models.CharField(
        max_length=8, choices=QUANTITY_UNIT_CHOICES, null=True, blank=True,
    )

    price = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text='Up-charge per chargeable unit. 0 for a free included ingredient.',
    )
    is_default = models.BooleanField(
        default=True, help_text='Included in the base price and pre-selected.'
    )
    is_removable = models.BooleanField(
        default=True, help_text='Whether a default ingredient can be removed by the customer.'
    )
    max_quantity = models.PositiveSmallIntegerField(
        default=1, help_text='Largest quantity the customer may select.'
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Menu Item Ingredient'
        verbose_name_plural = 'Menu Item Ingredients'
        ordering = ['sort_order', 'ingredient__name']

    def __str__(self):
        name = self.ingredient.name if self.ingredient_id else '?'
        return f"{name} ({self.menu_item})"

    # ── Identity delegated to the shared Ingredient ──────────────────────────

    @property
    def effective_name(self):
        return self.ingredient.name if self.ingredient_id else None

    @property
    def effective_en_name(self):
        return self.ingredient.en_name if self.ingredient_id else None

    @property
    def effective_image(self):
        return self.ingredient.image if self.ingredient_id else None

    # ── Nutrition scaled from the Ingredient to this portion ─────────────────

    def nutrient(self, field):
        """This portion's contribution of one nutrient field, or None."""
        if not self.ingredient_id:
            return None
        return self.ingredient.nutrient_for_portion(field, self.quantity, self.unit)

    @property
    def calories(self):
        """kcal this portion contributes, rounded to a whole number, or None."""
        value = self.nutrient('calories')
        return None if value is None else int(round(value))

    @property
    def included_units(self) -> int:
        """Units already covered by the base price (1 for a default, else 0)."""
        return 1 if self.is_default else 0

    def upcharge_for_quantity(self, quantity) -> Decimal:
        """Price contribution of selecting ``quantity`` of this ingredient."""
        try:
            qty = int(quantity)
        except (TypeError, ValueError):
            return Decimal('0.00')
        qty = max(0, min(qty, self.max_quantity))
        chargeable = max(0, qty - self.included_units)
        return self.price * chargeable


class RecipeStep(Common):
    """One step of a MenuItem's internal preparation recipe.

    Deliberately kitchen-facing only: RecipeStep is never included in the public
    MenuItem serializer, and its API endpoints require system-admin auth for
    every method (including GET). It is business IP, not customer-facing content.
    """

    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name='recipe_steps',
    )
    step_number = models.PositiveSmallIntegerField(default=1)
    instruction = models.TextField()
    en_instruction = models.TextField(null=True, blank=True)
    image = models.ImageField(null=True, blank=True, upload_to=picture)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Recipe Step'
        verbose_name_plural = 'Recipe Steps'
        ordering = ['sort_order', 'step_number']

    def __str__(self):
        return f"Step {self.step_number} for {self.menu_item}"


def normalize_selection(selection, ingredients):
    """Canonicalise a customer's ingredient selection for storage & comparison.

    Returns a list of ``{"ingredient": <id>, "quantity": <int>}`` sorted by
    ingredient id, keeping only ids that belong to ``ingredients`` and only rows
    whose effective quantity differs from the ingredient's default (so two carts
    that mean the same thing compare equal, and the "no changes" case stores an
    empty list). ``quantity`` is clamped to ``[0, max_quantity]``.
    """
    by_id = {ing.id: ing for ing in ingredients}
    rows = {}
    for row in (selection or []):
        ing = by_id.get(row.get('ingredient'))
        if ing is None:
            continue
        try:
            qty = int(row.get('quantity', 0))
        except (TypeError, ValueError):
            continue
        qty = max(0, min(qty, ing.max_quantity))
        rows[ing.id] = qty
    normalized = []
    for ing in ingredients:
        qty = rows.get(ing.id, ing.included_units)
        if qty != ing.included_units:
            normalized.append({'ingredient': ing.id, 'quantity': qty})
    normalized.sort(key=lambda r: r['ingredient'])
    return normalized
