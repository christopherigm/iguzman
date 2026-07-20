from decimal import Decimal

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.db import models

from core.models import (
    CURRENCY_CHOICES,
    Buyable,
    Common,
    RegularPicture,
    SmallPicture,
    StandardPicture,
    picture,
)

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

    # Manual display order set by dragging rows in the admin CMS list; all
    # existing rows are 0, so the alphabetical tiebreak below still applies
    # until someone re-arranges the list.
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Product Category'
        verbose_name_plural = 'Product Categories'
        ordering = ['sort_order', 'name']

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

    # Sibling variants: other Products that are alternative versions of THIS one
    # (e.g. "Coffee Bag 250g" <-> "Coffee Bag 1kg"). Each variant is its own
    # standalone, orderable Product with its own price, stock and images - this
    # field only links the family together so the storefront can offer the
    # customer the sibling choices. The relation is *symmetrical*: linking one
    # direction makes the pairing show on both products' detail pages, so a group
    # of siblings only needs each one added once from either side. Same shape as
    # MenuItem.variants.
    variants = models.ManyToManyField(
        'self',
        blank=True,
        symmetrical=True,
        help_text='Other products that are alternative versions of this one '
                  '(a different size, color, material, etc.). Shown as choices '
                  'on the public detail page. The link is mutual - adding it from '
                  'one product surfaces it on the other too.',
    )

    class Meta:
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        # `sort_order` (from Buyable) is the CMS's manual arrangement; newest-first
        # remains the tiebreak, which is every row's order until one is dragged.
        ordering = ['sort_order', '-created']

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

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Service Category'
        verbose_name_plural = 'Service Categories'
        ordering = ['sort_order', 'name']

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

    # Sibling variants: other Services that are alternative versions of THIS one
    # (e.g. "Personal Training - 1h" <-> "Personal Training - 30min"). Each
    # variant is its own standalone, bookable Service with its own price,
    # duration and modality - this field only links the family together so the
    # storefront can offer the customer the sibling choices. The relation is
    # *symmetrical*: linking one direction makes the pairing show on both
    # services' detail pages. Same shape as MenuItem.variants.
    variants = models.ManyToManyField(
        'self',
        blank=True,
        symmetrical=True,
        help_text='Other services that are alternative versions of this one '
                  '(a different duration, modality, package, etc.). Shown as '
                  'choices on the public detail page. The link is mutual - adding '
                  'it from one service surfaces it on the other too.',
    )

    class Meta:
        verbose_name = 'Service'
        verbose_name_plural = 'Services'
        ordering = ['sort_order', '-created']

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

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Menu Category'
        verbose_name_plural = 'Menu Categories'
        ordering = ['sort_order', 'name']

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
    portions = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Number of servings this dish yields. Drives the per-serving '
                  'figures and the "servings per item" line on the public '
                  'nutrition label.',
    )

    # Recipe metadata (INTERNAL - kitchen prep, never served on the public API).
    prep_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    cook_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    servings = models.PositiveIntegerField(null=True, blank=True)
    recipe_notes = models.TextField(
        null=True, blank=True, help_text='Internal kitchen notes; not exposed publicly.'
    )

    # Sibling variants: other MenuItems that are alternative versions of THIS
    # dish (e.g. "Orange Bread" <-> "Orange Bread - Vegan"). Unlike a
    # ProductVariant, a variant here is not a priced customisation of one item -
    # each variant is its own standalone, orderable MenuItem, and this field only
    # links the family together so the storefront can offer the customer the
    # sibling choices. The relation is *symmetrical*: linking one direction makes
    # the pairing show on both items' detail pages, so a group of siblings only
    # needs each one added once from either side.
    variants = models.ManyToManyField(
        'self',
        blank=True,
        symmetrical=True,
        help_text='Other menu items that are alternative versions of this dish '
                  '(vegan, gluten-free, a different size, etc.). Shown as choices '
                  'on the public detail page. The link is mutual - adding it from '
                  'one item surfaces it on the other too.',
    )

    class Meta:
        verbose_name = 'Menu Item'
        verbose_name_plural = 'Menu Items'
        ordering = ['sort_order', '-created']

    def __str__(self):
        return self.name or self.slug

    def price_for_selection(self, selection) -> Decimal:
        """Base price plus every up-charge implied by ``selection``.

        ``selection`` is a normalised list of ``{"ingredient": <id>, "quantity":
        <int>}`` dicts (see ``normalize_selection``). Internal ingredients are
        skipped entirely - they are kitchen-only recipe components excluded from
        the customer's total. Only customer-facing ingredients that belong to
        this item are counted, and only the units charged for beyond
        what the base already includes (``included_units``, i.e. the free
        portions): a default ingredient's included units are free (removing them
        never refunds - the base was already paid), and every unit above that
        costs ``ingredient.price``. An ingredient omitted from ``selection`` is
        priced at its ``default_units`` (what the customer gets untouched), so a
        default that itself carries an up-charge is still counted. This is the
        *only* place the customised total is computed.
        """
        by_id = {
            ing.id: ing for ing in self.ingredients.all() if not ing.is_internal
        }
        chosen = {}
        for row in (selection or []):
            ingredient = by_id.get(row.get('ingredient'))
            if ingredient is None:
                continue
            chosen[ingredient.id] = row
        total = self.price
        for ingredient in by_id.values():
            row = chosen.get(ingredient.id)
            qty = row.get('quantity', ingredient.default_units) if row else ingredient.default_units
            option_id = row.get('option') if row else None
            _, unit_price = ingredient.resolve_option(option_id)
            total += ingredient.upcharge_for_quantity(qty, unit_price)
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

    # Purchasing price for this ingredient, stated per `nutrition_basis_quantity`
    # of `unit` (the same reference amount the nutrition panel uses). Optional -
    # null means "unpriced". `currency` is the currency that price is in.
    price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Price for `nutrition_basis_quantity` of `unit`. Blank = unpriced.',
    )
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='USD')

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

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Ingredient'
        verbose_name_plural = 'Ingredients'
        ordering = ['sort_order', 'name']

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


class IngredientProvider(models.Model):
    """A purchasing source (store/supplier) for an Ingredient: a link + its price.

    One Ingredient may list several providers - the places it can be bought from -
    each with an optional store name, a URL, and the price that source quotes (in
    its own currency). These back the "Providers" section of the admin ingredient
    form and can be seeded from the web price lookup, which returns the sources it
    found. They are informational purchasing references; the ingredient's own
    ``price`` remains the single value used for costing.
    """

    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE,
        related_name='providers',
    )
    name = models.CharField(
        max_length=255, null=True, blank=True,
        help_text='Store or supplier name, e.g. "Costco".',
    )
    url = models.URLField(max_length=500)
    price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="This provider's quoted price. Blank = unquoted.",
    )
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='USD')
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Ingredient Provider'
        verbose_name_plural = 'Ingredient Providers'
        ordering = ['sort_order', 'id']

    def __str__(self):
        label = self.name or self.url
        return f"{label} ({self.ingredient.name})" if self.ingredient_id else label


class MenuItemIngredient(Common):
    """One priced, customisable component of a MenuItem.

    The pricing model is *base price + add-on deltas* (see ``MenuItem``):

      - ``is_removable`` - the single switch describing how the ingredient behaves:
          * ``False`` - *included by default*: part of the base price, always in
            the dish, shown to the customer as a locked "Included" line (no price,
            no stepper).
          * ``True`` - an *optional add-on*: not in the base, the customer chooses
            a quantity from 0 up to ``max_quantity``, and every selected unit is
            charged ``price`` (0 for a free add-on).
      - ``price`` - the up-charge per selected unit of a removable add-on. Ignored
        for a non-removable (included) ingredient, which is already in the base.
      - ``max_quantity`` - the largest quantity the customer may add (e.g. 2 for
        "double"). ``quantity``/``unit`` are the descriptive recipe portion (e.g.
        100 g of cheese) and do not affect price.

    A row may also be a **single-select choice group**: ``ingredient`` (below) is
    the *default* option and drives the base price/nutrition, while
    ``MenuItemIngredientOption`` rows add *alternative* ingredients the customer
    may swap in instead (e.g. a "Sweetener" group offering Refined sugar / Organic
    sugar / Splenda). Every option carries its own per-unit ``price``; the shared
    ``quantity``/``unit`` portion is used for all of them. A row with no options
    behaves exactly as a plain single-ingredient row.
    """

    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name='ingredients',
    )
    # Identity (name, image) and nutrition now live on the shared Ingredient;
    # PROTECT so an ingredient still used by a dish cannot be deleted. When the
    # row is a choice group this is the *default* option (see ``options``).
    ingredient = models.ForeignKey(
        'Ingredient',
        on_delete=models.PROTECT,
        related_name='menu_uses',
    )

    # An optional customer-facing label for a single-select choice group (e.g.
    # "Sweetener", "Choose your protein"). Only meaningful when the row has
    # ``options``; the customiser shows it as the heading above the choice chips
    # so the customer knows what they are picking. Empty on a plain row.
    group_name = models.CharField(max_length=120, null=True, blank=True)
    group_en_name = models.CharField(max_length=120, null=True, blank=True)

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
    is_removable = models.BooleanField(
        default=False,
        help_text='On: an optional add-on the customer chooses (0..max_quantity), '
                  'each unit charged at price. Off: included by default in the base '
                  'price and locked into the dish.',
    )
    is_internal = models.BooleanField(
        default=False,
        help_text='Internal recipe-only component. Hidden from the customer '
                  'customiser and excluded from the price, but still counted in '
                  'the public nutrition label (it is really in the food). For '
                  'kitchen/recipe use, e.g. cooking oil or a seasoning base.',
    )
    max_quantity = models.PositiveSmallIntegerField(
        default=1, help_text='Largest quantity the customer may select.'
    )
    number_of_free_portions = models.PositiveSmallIntegerField(
        default=0,
        help_text='Units the customer gets at no charge before the per-unit '
                  'price applies. Must be ≤ max_quantity. Only meaningful for a '
                  'removable add-on; a non-removable ingredient is always its '
                  'single included portion regardless.',
    )
    default_quantity = models.PositiveSmallIntegerField(
        default=0,
        help_text='Quantity pre-selected for the customer in the stepper (and '
                  'the baseline a "no change" selection is measured against). '
                  'Must be ≤ max_quantity. Ignored for a non-removable '
                  'ingredient, which is locked at its single portion.',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Menu Item Ingredient'
        verbose_name_plural = 'Menu Item Ingredients'
        ordering = ['sort_order', 'ingredient__name']

    def __str__(self):
        name = self.ingredient.name if self.ingredient_id else '?'
        return f"{name} ({self.menu_item})"

    def clean(self):
        super().clean()
        # The free-portion count is a discount on the customer's selection, so it
        # can never exceed the cap; the pre-selected default must also fit within
        # it. Enforced here (admin) and in the write serializer (API).
        if self.number_of_free_portions > self.max_quantity:
            raise ValidationError(
                {'number_of_free_portions': 'Number of free portions cannot exceed max quantity.'}
            )
        if self.default_quantity > self.max_quantity:
            raise ValidationError(
                {'default_quantity': 'Default quantity cannot exceed max quantity.'}
            )

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
        """Units already covered by the base price (never charged): the single
        included portion of a non-removable ingredient, or
        ``number_of_free_portions`` for a removable add-on (0 = every selected
        unit is charged)."""
        if not self.is_removable:
            return 1
        return self.number_of_free_portions

    @property
    def default_units(self) -> int:
        """The quantity pre-selected for the customer, and the baseline a "no
        change" selection is measured against: 1 for a locked non-removable
        ingredient, ``default_quantity`` for a removable add-on."""
        if not self.is_removable:
            return 1
        return self.default_quantity

    def resolve_option(self, option_id):
        """Resolve a selection's ``option`` id to its ``(ingredient, price)``.

        The group's own ``ingredient``/``price`` is the default option; the
        ``options`` rows are the alternatives. An empty or unrecognised id falls
        back to the default, so a stale or forged option can never crash pricing -
        it simply prices as the default.
        """
        if option_id and option_id != self.ingredient_id:
            for option in self.options.all():
                if option.ingredient_id == option_id:
                    return option.ingredient, option.price
        return self.ingredient, self.price

    def upcharge_for_quantity(self, quantity, option_price=None) -> Decimal:
        """Price contribution of selecting ``quantity`` of this ingredient.

        ``option_price`` is the per-unit price of the *chosen* option (from
        ``resolve_option``); it defaults to this row's own ``price`` (the default
        option). The base price already paid for ``included_units`` of the default
        option, so only the value selected *beyond* that baseline is charged -
        which is what lets a premium alternative cost its delta even on an
        otherwise-"included" group, and never refunds when a cheaper option or
        fewer units are picked.
        """
        try:
            qty = int(quantity)
        except (TypeError, ValueError):
            return Decimal('0.00')
        qty = max(0, min(qty, self.max_quantity))
        unit_price = self.price if option_price is None else option_price
        # What the base price already covers (default option x its free units)
        # versus what the customer's chosen option x quantity is worth.
        included_value = self.price * self.included_units
        upcharge = unit_price * qty - included_value
        return upcharge if upcharge > Decimal('0.00') else Decimal('0.00')


class MenuItemIngredientOption(models.Model):
    """One *alternative* ingredient in a single-select choice group.

    The parent ``MenuItemIngredient`` is the group: its own ``ingredient`` is the
    default option, and each ``MenuItemIngredientOption`` is another ingredient the
    customer may swap in instead (e.g. Organic sugar or Splenda in place of the
    default Refined sugar). The group owns the shared portion (``quantity``/
    ``unit``) and behaviour (removable/max/free); an option only adds *which*
    ingredient and its own per-unit ``price``.
    """

    menu_item_ingredient = models.ForeignKey(
        MenuItemIngredient,
        on_delete=models.CASCADE,
        related_name='options',
    )
    # PROTECT mirrors the group's default ingredient: an ingredient still offered
    # as an option cannot be deleted out from under a dish.
    ingredient = models.ForeignKey(
        'Ingredient',
        on_delete=models.PROTECT,
        related_name='menu_option_uses',
    )
    price = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text='Up-charge per unit when this option is chosen.',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Menu Item Ingredient Option'
        verbose_name_plural = 'Menu Item Ingredient Options'
        ordering = ['sort_order', 'id']

    def __str__(self):
        name = self.ingredient.name if self.ingredient_id else '?'
        return f"{name} (option of {self.menu_item_ingredient_id})"


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

    Returns a list of ``{"ingredient": <id>, "quantity": <int>}`` (plus an
    ``"option": <ingredient id>`` when the customer swapped in an alternative
    from a choice group) sorted by ingredient id, keeping only ids that belong to
    ``ingredients`` and only rows that differ from the group's default - a changed
    quantity (vs. ``default_units``) *or* a non-default option - so two carts that
    mean the same thing compare equal and the "no changes" case stores an empty
    list. ``quantity`` is clamped to ``[0, max_quantity]`` and ``option`` is kept
    only when it is a real option of that group. Internal ingredients are excluded
    - they are kitchen-only, not customer-selectable, and never priced.
    """
    customer_ingredients = [ing for ing in ingredients if not ing.is_internal]
    by_id = {ing.id: ing for ing in customer_ingredients}
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
        # Keep the chosen alternative only when it is a real option of this group;
        # the default (or a bogus id) is stored as None.
        option = row.get('option')
        valid_option_ids = {ing.ingredient_id} | {o.ingredient_id for o in ing.options.all()}
        if option not in valid_option_ids:
            option = None
        rows[ing.id] = {'quantity': qty, 'option': option}
    normalized = []
    for ing in customer_ingredients:
        entry = rows.get(ing.id)
        qty = entry['quantity'] if entry else ing.default_units
        option = entry['option'] if entry else None
        is_default_option = option is None or option == ing.ingredient_id
        if qty == ing.default_units and is_default_option:
            continue
        record = {'ingredient': ing.id, 'quantity': qty}
        if not is_default_option:
            record['option'] = option
        normalized.append(record)
    normalized.sort(key=lambda r: r['ingredient'])
    return normalized
