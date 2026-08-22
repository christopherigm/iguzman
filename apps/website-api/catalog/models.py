import operator
from decimal import Decimal
from functools import reduce

from colorfield.fields import ColorField
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
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


class RecommendationSource:
    """Checkout-recommendation resolution, shared by the three buyable families.

    A plain (non-model) mixin rather than a field on ``Buyable``: everything it
    reads is a *reverse* relation declared by ``CatalogRecommendation`` at the
    bottom of this module, and ``core`` has no business knowing those names.
    Product, Service and MenuItem all mix it in, because all three are sold
    through the same cart and all three carry a ``category``.

    The inherit/override rule is the one ``MenuItem.effective_sizes`` already
    follows, for the same reason: a tenant states "with a pizza, offer a soda"
    once on the *Pizzas category* rather than on every pizza, and an edge-case
    dish overrides that list. Own rows **replace** the category's entirely and
    never merge - a merge could only ever add, and could not express "this dish
    recommends nothing".

    ⚠ The fallback is decided on the **presence of rows**, not on whether their
    targets are currently offerable. An item whose single own recommendation is
    out of stock recommends nothing today; it must not silently start showing
    its category's list, which would read as a lost edit.
    """

    @property
    def own_recommendation_rows(self):
        """This item's own rows, in display order.

        Empty is the normal state and *means* "offer whatever my category
        recommends" - which is why the relation is named ``own_recommendations``
        and not ``recommendations``, the same trap ``MenuItem.own_sizes`` is
        named around.
        """
        return sorted(
            (r for r in self.own_recommendations.all() if r.enabled),
            key=lambda r: (r.sort_order, r.id),
        )

    @property
    def category_recommendation_rows(self):
        """What this item's category recommends, in display order. Empty when the
        item is filed under nothing (Product and Service allow that; MenuItem
        does not)."""
        if not self.category_id:
            return []
        return sorted(
            (r for r in self.category.recommendations.all() if r.enabled),
            key=lambda r: (r.sort_order, r.id),
        )

    @property
    def effective_recommendation_rows(self):
        """Own rows if it has any, else its category's."""
        return self.own_recommendation_rows or self.category_recommendation_rows

    @property
    def effective_recommendations(self):
        """``[(kind, buyable)]`` this item may actually be offered alongside.

        The single answer every consumer reads - the cart strip, the item
        payload's ``recommendations`` - so the storefront, the API and the till
        cannot come to disagree about what goes with what.
        """
        return offerable_recommendations(self.effective_recommendation_rows)


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

    # What buying anything filed here earns, when the item does not state its
    # own. See `Buyable.points_award`: an item's null means "inherit this", and
    # this column's null means "nothing in this category earns by default".
    points_award = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Points earned per unit for items in this category. Blank means none.",
    )

    class Meta:
        verbose_name = 'Product Category'
        verbose_name_plural = 'Product Categories'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Product(RecommendationSource, Buyable):
    """
    Concrete product model.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - StandardPicture: image (max 900px)
      - Buyable: system (FK), brand (FK), price, compare_price, cost_price, currency
    """

    # Required, and CASCADE: deleting a category deletes the products filed
    # under it. There is no "no category" state for a product to fall back to -
    # the category slug is the first segment of every product URL
    # (`/products/<category>/<slug>`), so an uncategorized product would have no
    # page to be reached at.
    category = models.ForeignKey(
        ProductCategory,
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

    # What buying anything filed here earns, when the item does not state its
    # own. See `Buyable.points_award`: an item's null means "inherit this", and
    # this column's null means "nothing in this category earns by default".
    points_award = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Points earned per unit for items in this category. Blank means none.",
    )

    class Meta:
        verbose_name = 'Service Category'
        verbose_name_plural = 'Service Categories'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Service(RecommendationSource, Buyable):
    """
    Concrete service model.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - StandardPicture: image (max 900px)
      - Buyable: system (FK), brand (FK), price, compare_price, cost_price, currency
    """

    # Required, and CASCADE, for the same reason as `Product.category`: the
    # category slug is the first segment of every service URL
    # (`/services/<category>/<slug>`).
    category = models.ForeignKey(
        ServiceCategory,
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

    # ── Booking ────────────────────────────────────────────────────────────────
    # A bookable service is sold as an *appointment* rather than as a cart line:
    # the detail page drops "Add to cart"/"Buy now" for a "Book now" that leads
    # to the scheduling checkout. Off by default, so every existing service keeps
    # behaving exactly as it did.
    booking_enabled = models.BooleanField(
        default=False,
        help_text='Sell this service as a scheduled appointment instead of a cart item.',
    )
    # Where the work happens. Independent switches rather than a three-way choice
    # because "both" is a real configuration the customer then picks between -
    # and a tenant that offers both should not have to model it as a third value
    # that every consumer has to expand back into two.
    booking_in_branch = models.BooleanField(
        default=True,
        help_text='Can be fulfilled at one of the business locations.',
    )
    booking_on_premises = models.BooleanField(
        default=False,
        help_text="Can be fulfilled at the customer's own address.",
    )
    # Which locations offer it. **Empty means every branch** - not "no branches",
    # which would make an unconfigured bookable service unbookable and read as a
    # bug. A tenant with no Branch rows at all is the home-business case: the
    # booking then has no branch and follows the System's implicit single
    # location (see `orders.services.booking.branches_for`).
    booking_branches = models.ManyToManyField(
        'core.Branch',
        blank=True,
        related_name='bookable_services',
        help_text='Locations this service can be booked at. Leave empty to offer every location.',
    )

    # ── Booking party size ─────────────────────────────────────────────────────
    # Whether one booking may cover several people. Off - the default, and what
    # every existing service keeps - means one booking is one person: the price
    # is the price and the slot loses one seat.
    #
    # On, the party size **multiplies the price and consumes that many seats**.
    # That is the only pricing model here on purpose: a flat group rate
    # ("MX$2,000 for up to 6") is not a party size, it is a different service
    # with this switch off, and modelling it as a third mode would put two
    # incompatible meanings behind one number.
    booking_party_enabled = models.BooleanField(
        default=False,
        help_text='One booking can cover several people (price is per person).',
    )
    booking_party_min = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text='Smallest party this service accepts.',
    )
    booking_party_max = models.PositiveSmallIntegerField(
        default=10,
        validators=[MinValueValidator(1)],
        help_text='Largest party this service accepts (still capped by what a resource holds).',
    )
    # Which pools this service draws on. **Empty means every pool at the resolved
    # branch**, the same "empty is everything" rule `booking_branches` follows -
    # an unconfigured bookable service must stay bookable. Composes with
    # `booking_branches` rather than fighting it: pools are always filtered by
    # the branch the request resolved to, so a pool belonging to a branch this
    # service is not offered at is simply never reachable.
    booking_pools = models.ManyToManyField(
        'core.ResourcePool',
        blank=True,
        related_name='services',
        help_text='Which resources this service uses. Leave empty to use every pool at the location.',
    )

    # ── Booking payment ────────────────────────────────────────────────────────
    # Each is its own switch and a tenant may enable any combination; the
    # customer picks from what is on at checkout. All three off is the same as
    # `booking_pay_in_person` on - see `booking_payment_options`, which is what
    # every consumer reads rather than the raw flags.
    booking_pay_full = models.BooleanField(
        default=False,
        help_text='Customer pays the full price online to confirm the booking.',
    )
    booking_pay_deposit = models.BooleanField(
        default=False,
        help_text='Customer pays a percentage online to secure the booking; the rest is due later.',
    )
    booking_deposit_percent = models.PositiveSmallIntegerField(
        default=30,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text='Percentage charged up front when paying a deposit.',
    )
    booking_pay_in_person = models.BooleanField(
        default=True,
        help_text='Customer pays nothing now; the service is paid once delivered.',
    )

    class Meta:
        verbose_name = 'Service'
        verbose_name_plural = 'Services'
        ordering = ['sort_order', '-created']

    def __str__(self):
        return self.name or self.slug

    # Payment options as the rest of the stack sees them. Read this, never the
    # three booleans: a service with every switch off would otherwise offer the
    # customer nothing to pick and the Book now button would dead-end. Paying in
    # person is the safe fallback because it is the only option that commits the
    # tenant to no payment infrastructure at all.
    PAY_FULL = 'full'
    PAY_DEPOSIT = 'deposit'
    PAY_IN_PERSON = 'in_person'

    @property
    def booking_payment_options(self):
        options = []
        if self.booking_pay_full:
            options.append(self.PAY_FULL)
        if self.booking_pay_deposit:
            options.append(self.PAY_DEPOSIT)
        if self.booking_pay_in_person or not options:
            options.append(self.PAY_IN_PERSON)
        return options

    @property
    def booking_fulfillment_options(self):
        """Where it can be delivered, same fallback logic as the payment options.

        Both switches off means the tenant enabled booking and touched nothing
        else; at a branch is the assumption that matches the default state of
        `booking_in_branch`.
        """
        options = []
        if self.booking_in_branch:
            options.append('branch')
        if self.booking_on_premises:
            options.append('on_premises')
        return options or ['branch']

    @property
    def booking_party_range(self):
        """``(min, max)`` party size, with the same "read this, not the raw
        switches" contract the two properties above carry.

        Party off collapses to ``(1, 1)`` so a caller never has to special-case
        the switch, and a max that a CMS edit left below the min is widened to
        the min rather than producing an empty range that would make the service
        unbookable at every size.
        """
        if not self.booking_party_enabled:
            return 1, 1
        low = max(self.booking_party_min or 1, 1)
        return low, max(self.booking_party_max or low, low)


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

# How a *size* is measured, which is deliberately not QUANTITY_UNIT_CHOICES: a
# size is a dimension of the finished dish (a 12-inch pizza, a 355 ml soda, a
# 6-piece box), never a recipe portion, so the cooking measures that only make
# sense against an ingredient - cups, tablespoons, teaspoons, scoops - have no
# meaning here. The overlap with the quantity list is the units a size genuinely
# can be stated in.
SIZE_UNIT_CHOICES = [
    ('in', 'Inches'),
    ('cm', 'Centimeters'),
    ('mm', 'Millimeters'),
    ('ml', 'Milliliters'),
    ('l', 'Liters'),
    ('oz', 'Ounces'),
    ('g', 'Grams'),
    ('kg', 'Kilograms'),
    ('lb', 'Pounds'),
    ('pc', 'Pieces'),
    ('slice', 'Slices'),
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

    # What buying anything filed here earns, when the item does not state its
    # own. See `Buyable.points_award`: an item's null means "inherit this", and
    # this column's null means "nothing in this category earns by default".
    points_award = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Points earned per unit for items in this category. Blank means none.",
    )

    class Meta:
        verbose_name = 'Menu Category'
        verbose_name_plural = 'Menu Categories'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class MenuItem(RecommendationSource, Buyable):
    """
    A purchasable meal, dish, or drink.

    Inherits from Buyable which provides:
      - Common: enabled, created, modified, version
      - BasePicture: name, en_name, description, en_description, href, fit, background_color
      - StandardPicture: image (max 900px)
      - Buyable: system (FK), brand (FK), price, compare_price, cost_price, currency

    ``price`` is the *base* price; the chosen size (see ``MenuSize``) shifts it
    up or down by a signed delta, and the customer's ingredient choices (see
    ``MenuItemIngredient``) add up-charges on top. ``price_for_selection`` is the
    single source of truth for that arithmetic and is used by the cart, checkout,
    and storefront alike so a customised price can never drift between them.

    The tenant's own ``MenuCategory`` is the only sectioning there is, and it is
    **required**: it groups the menu page, fills the navbar's Menu dropdown and
    is a segment of every item's URL (``/menu/<category>/<slug>``), none of
    which has an answer for an item filed under nothing. This replaced a
    structural ``kind`` enum (food/drink/dessert/side/appetizer) that sat
    alongside the category and could only ever be a second, disagreeing
    sectioning of the same menu.
    """

    # Required, and CASCADE: deleting a category deletes the items filed under
    # it. There is no "no category" state for an item to fall back to.
    category = models.ForeignKey(
        MenuCategory,
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

    # Whether this dish is sold in several sizes at all. On (the default) it
    # offers whatever `effective_sizes` resolves to - its own MenuSize rows if it
    # has any, otherwise its category's. Off, it is sold in one size and no size
    # picker is shown, which is how an edge-case dish opts out of a category that
    # sizes everything else (a dessert on a pizza menu).
    sizes_enabled = models.BooleanField(
        default=True,
        help_text='Offer this dish in several sizes (its own if it has any, '
                  'otherwise its category\'s). Off: sold in one size.',
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
    #
    # `eta_minutes` is the promise made to the customer - "ready in 30 min" on
    # the detail page and in the cart - and is deliberately not derived from the
    # internal `prep_time_minutes`/`cook_time_minutes` below: those are kitchen
    # recipe metadata that never leave the admin API, and their sum is what one
    # cook takes from scratch, not what the counter quotes for an order.
    eta_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Estimated time until this item is ready, in minutes.',
    )
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

    # ── Sizes ────────────────────────────────────────────────────────────────

    @property
    def effective_sizes(self):
        """The sizes a customer may pick from, in display order, or ``[]``.

        Own rows **replace** the category's entirely rather than merging with
        them - that is the only rule that lets an edge-case dish *drop* a size
        its category offers (a personal-only calzone on a menu whose pizzas come
        in five sizes). A merge could only ever add.

        Sorted in Python rather than re-queried so a ``prefetch_related`` on
        ``own_sizes`` / ``category__sizes`` is not thrown away - this is read
        once per card on a menu page of a few hundred dishes.
        """
        if not self.sizes_enabled:
            return []
        own = sorted(
            (s for s in self.own_sizes.all() if s.enabled),
            key=lambda s: (s.sort_order, s.id),
        )
        if own:
            return own
        if not self.category_id:
            return []
        return sorted(
            (s for s in self.category.sizes.all() if s.enabled),
            key=lambda s: (s.sort_order, s.id),
        )

    @property
    def default_size(self):
        """The size a customer gets without choosing: the one flagged
        ``is_default``, else the first in display order. ``None`` when the dish
        is sold in one size."""
        sizes = self.effective_sizes
        if not sizes:
            return None
        return next((s for s in sizes if s.is_default), sizes[0])

    def resolve_size(self, size_id):
        """Resolve a chosen size id to its ``MenuSize``, falling back to the
        default.

        Same contract as ``MenuItemIngredient.resolve_option``: an id that is
        stale (the size was deleted), forged, or belongs to another dish can
        never crash pricing - it simply prices as the default.
        """
        sizes = self.effective_sizes
        if not sizes:
            return None
        if size_id:
            for size in sizes:
                if size.id == size_id:
                    return size
        return self.default_size

    def price_for_selection(self, selection, size=None) -> Decimal:
        """Base price, the chosen size's delta, plus every up-charge implied by
        ``selection``.

        ``size`` is a ``MenuSize`` (or ``None``, which means *the default size* -
        a dish sold in several sizes always has one, and a line that names none
        is the line that took what it was offered). Its ``price_delta`` is
        signed, so a small size discounts the base and a large one adds to it;
        the total is floored at zero, because a delta bigger than the base is a
        misconfiguration, not a refund.

        Size does **not** scale the ingredient up-charges: extra cheese costs the
        same on a small as on a large. One pricing axis, deliberately - a
        multiplier would have to be applied identically in the customiser, the
        cart, the till and here, and the first disagreement between them would be
        a price on screen that is not the price charged.

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
        if size is None:
            size = self.default_size
        if size is not None:
            total += size.price_delta
        for ingredient in by_id.values():
            row = chosen.get(ingredient.id)
            qty = row.get('quantity', ingredient.default_units) if row else ingredient.default_units
            option_id = row.get('option') if row else None
            _, unit_price = ingredient.resolve_option(option_id)
            total += ingredient.upcharge_for_quantity(qty, unit_price)
        return total if total > Decimal('0.00') else Decimal('0.00')


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


class MenuSize(SmallPicture):
    """One size a dish is offered in, priced as a signed delta off the base.

    Sizes are **per category** first - a pizzeria's pizzas come in five sizes
    while its drinks come in two, and neither list belongs on the individual
    dish. A ``MenuItem`` may then carry its own rows to *override* that list for
    an edge case. One model serves both, distinguished by which owner FK is set
    (exactly one, enforced below), so the API, the CMS editor and the customer's
    picker are one implementation rather than a category copy and an item copy
    that would drift.

    ``price_delta`` is what makes this a size rather than a separate dish: a
    pizzeria prices "pizza" once at its regular size and states that small is
    -2.00 and large is +2.00. Signed on purpose - a size list with only additions
    forces the tenant to price its *smallest* size as the base and quote every
    real size as an up-charge, which is not how a menu is written.

    ``portion`` + ``unit`` are the size's own measurement ("Small (4 in)",
    "Grande (1 l)"), shown beside the name. They are descriptive: nothing is
    computed from them, unlike ``MenuItemIngredient.quantity``, which scales
    nutrition. A size with no measurement is perfectly ordinary - "Individual" /
    "Familiar" says everything some menus need to.

    Inherits from SmallPicture (256 px): a size's picture is a thumbnail in a
    chip beside its name, the same role an ``Ingredient``'s picture plays.
    """

    # Derived from the owner below, never authored - see `save`. It is stored
    # rather than reached through `category__system` / `menu_item__system`
    # because those are *two* paths to one tenant, and every piece of machinery
    # that scopes a model to its System takes exactly one: `core.backup`'s
    # `ModelSpec.scope`, and through it `core.tenant_paths.system_id_for`, which
    # decides which R2 bucket this row's image is written to. With a two-way
    # path, an item-level override resolves to None on the category branch and
    # its picture silently lands in the platform bucket instead of the tenant's.
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='menu_sizes',
    )

    # Exactly one of these is set. CASCADE both ways: a category's sizes have no
    # meaning without the category, and an override has none without its dish.
    category = models.ForeignKey(
        MenuCategory,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='sizes',
    )
    menu_item = models.ForeignKey(
        MenuItem,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        # Not `sizes`: that name belongs to the *effective* list a dish offers
        # (see ``MenuItem.effective_sizes``), which is usually its category's.
        # A property and a related manager sharing one name is how a caller ends
        # up reading an empty override and concluding the dish has no sizes.
        related_name='own_sizes',
    )

    # `name` is required here, overriding BasePicture's nullable `name`: a size
    # the customer cannot name is not a choice. `en_name`, `description` and
    # `image` come from SmallPicture.
    name = models.CharField(max_length=255)

    portion = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='How big this size is, in `unit` (e.g. 12 for a 12-inch '
                  'pizza). Descriptive - nothing is computed from it.',
    )
    unit = models.CharField(
        max_length=8, choices=SIZE_UNIT_CHOICES, null=True, blank=True,
    )

    price_delta = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        help_text='Added to the item base price when this size is chosen. '
                  'Negative discounts it (a small size), positive adds to it.',
    )

    # The size a customer gets without choosing. At most one row per owner should
    # carry it; more than one simply means the first in display order wins, which
    # is also the fallback when none does - so this can never leave a dish with
    # no resolvable size.
    is_default = models.BooleanField(
        default=False,
        help_text='Pre-selected for the customer. With none flagged, the first '
                  'size in display order is used.',
    )

    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Menu Size'
        verbose_name_plural = 'Menu Sizes'
        ordering = ['sort_order', 'id']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(category__isnull=False, menu_item__isnull=True)
                    | models.Q(category__isnull=True, menu_item__isnull=False)
                ),
                name='menu_size_exactly_one_owner',
            ),
        ]

    def save(self, *args, **kwargs):
        # `system` follows the owner rather than being set by the caller: a size
        # whose tenant disagreed with its category's would render on one site and
        # be backed up with another's. Kept out of `update_fields` trouble by
        # only ever moving when the owner does, which is at creation.
        owner = self.menu_item or self.category
        if owner is not None and self.system_id != owner.system_id:
            self.system_id = owner.system_id
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = list(update_fields) + ['system']
        super().save(*args, **kwargs)

    def __str__(self):
        owner = self.menu_item or self.category
        return f"{self.name} ({owner})" if owner else self.name

    @property
    def measurement(self):
        """``"12 in"``, or None when the size carries no measurement."""
        if self.portion is None or not self.unit:
            return None
        # Trim a trailing ".00" - a 12-inch pizza is not a 12.00-inch pizza.
        #
        # ⚠ `normalize()` alone is not enough, and its failure is invisible until
        # a tenant types a round ten: it strips trailing zeros from the *exponent*
        # too, so Decimal("10.00") becomes Decimal("1E+1") and prints as "1E+1 cm".
        # `quantize(Decimal(1))` is what brings an integral value back to a plain
        # exponent-0 string; a fractional one is safe to normalize (12.50 -> 12.5).
        portion = self.portion
        if portion == portion.to_integral_value():
            amount = portion.quantize(Decimal(1))
        else:
            amount = portion.normalize()
        return f"{amount} {self.unit}"


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


# ---------------------------------------------------------------------------
# Checkout recommendations
# ---------------------------------------------------------------------------
#
# "Don't forget these" - the strip of extras a customer is offered under their
# cart lines, because a pizzeria that never mentions a drink sells fewer drinks.
#
# It is deliberately *not* shaped like `variants`, which it otherwise resembles:
#
#   * **Directional, not symmetrical.** A pizza recommends a soda; a soda does
#     not recommend a pizza. `variants` is a symmetrical M2M because being an
#     alternative version of something is mutual, and being a suggested extra is
#     not - a symmetrical relation here would fill every drink's checkout strip
#     with the food it was offered beside.
#   * **Cross-family.** A dish may recommend a Product (a bottle of wine, a
#     branded mug) and a product may recommend a Service (installation), so the
#     source and the target are each one of three families rather than a
#     `ManyToManyField('self')`.
#   * **Authored per category, overridable per item** - see
#     `RecommendationSource`. A tenant states "with a pizza, offer a soda" once.
#
# Which is why this is a real model with its own rows rather than nine M2M
# fields: the pairing carries a `sort_order` and an `enabled` switch, and one
# table is one editor, one serializer and one cache receiver instead of nine.

# The six columns a recommendation can hang off, and the three it can point at.
# Named once here so the constraints, the write layer and the admin cannot come
# to disagree about the set.
RECOMMENDATION_SOURCE_FIELDS = (
    'product', 'service', 'menu_item',
    'product_category', 'service_category', 'menu_category',
)
RECOMMENDATION_TARGET_FIELDS = (
    'recommended_product', 'recommended_service', 'recommended_menu_item',
)

# Which source column a buyable family's item and category live in.
RECOMMENDATION_ITEM_FIELD = {
    'product': 'product',
    'service': 'service',
    'menu_item': 'menu_item',
}
RECOMMENDATION_CATEGORY_FIELD = {
    'product': 'product_category',
    'service': 'service_category',
    'menu_item': 'menu_category',
}
RECOMMENDATION_TARGET_FIELD = {
    'product': 'recommended_product',
    'service': 'recommended_service',
    'menu_item': 'recommended_menu_item',
}


def _exactly_one(*fields):
    """A ``Q`` matching rows where exactly one of ``fields`` is non-null.

    Built rather than typed out because the source side is six columns, which
    spelled by hand is thirty-six clauses nobody would read - and one typo in
    which is a constraint that lets a malformed row through.
    """
    terms = []
    for chosen in fields:
        term = models.Q(**{f'{chosen}__isnull': False})
        for other in fields:
            if other != chosen:
                term &= models.Q(**{f'{other}__isnull': True})
        terms.append(term)
    return reduce(operator.or_, terms)


def offerable_recommendations(rows):
    """``[(kind, buyable)]`` for the rows whose target a customer can add today.

    Filters out what the customer could only be frustrated by: a disabled item, a
    product with no stock, a dish that is off the menu today. Recommending
    something unbuyable is worse than recommending nothing - the whole strip is a
    prompt to add one more thing, and a dead card in it is a prompt to give up.

    Sorted in Python rather than re-queried so a ``prefetch_related`` on the
    source's rows is not thrown away; `rows` arrives already ordered.
    """
    resolved = []
    for row in rows:
        target = row.target
        if target is None or not target.enabled:
            continue
        kind = row.target_kind
        # A service is always orderable, food follows its availability flag, and
        # only a product carries stock - the same per-family rule the cart's
        # `in_stock` and the catalog card apply.
        if kind == 'product' and not target.in_stock:
            continue
        if kind == 'menu_item' and not target.is_available:
            continue
        resolved.append((kind, target))
    return resolved


class CatalogRecommendation(Common):
    """One "don't forget this" pairing: a source, and a buyable to offer with it.

    Exactly one of the six source columns and exactly one of the three target
    columns is set (both enforced by a ``CheckConstraint``), which is the same
    shape ``users.CartItem`` uses to point at one of three families - and the
    same "exactly one owner" rule ``MenuSize`` carries, widened.

    Inherits ``Common``: ``enabled`` lets a tenant retire a pairing for a season
    without losing it, and ``created`` is what a tenant backup keys the row by
    (it has no slug, and it hangs off nine possible parents, so
    ``_restore_children``'s single named parent cannot serve it - exactly
    ``MenuSize``'s situation).

    There is deliberately **no unique constraint** on the nine columns. In
    Postgres a unique index over mostly-NULL columns enforces nothing (NULL is
    never equal to NULL), so it would be a comforting no-op; the write layer
    replaces a source's whole set and dedupes there instead.
    """

    # Derived from the source in `save()`, never authored - the same rule, and the
    # same reason, as `MenuSize.system`: every mechanism that scopes a model to
    # its tenant (`core.backup`'s `ModelSpec.scope`, and through it
    # `core.tenant_paths.system_id_for`) takes exactly **one** ORM path, and this
    # row has six possible ways up to a System.
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='catalog_recommendations',
    )

    # ── The source: what the customer is buying (exactly one) ────────────────
    #
    # CASCADE throughout: a pairing has no meaning once either end of it is gone.
    # `own_recommendations` rather than `recommendations` on the item side is
    # load-bearing - see `RecommendationSource.own_recommendation_rows`.
    product = models.ForeignKey(
        Product, null=True, blank=True, on_delete=models.CASCADE,
        related_name='own_recommendations',
    )
    service = models.ForeignKey(
        Service, null=True, blank=True, on_delete=models.CASCADE,
        related_name='own_recommendations',
    )
    menu_item = models.ForeignKey(
        'MenuItem', null=True, blank=True, on_delete=models.CASCADE,
        related_name='own_recommendations',
    )
    product_category = models.ForeignKey(
        ProductCategory, null=True, blank=True, on_delete=models.CASCADE,
        related_name='recommendations',
    )
    service_category = models.ForeignKey(
        ServiceCategory, null=True, blank=True, on_delete=models.CASCADE,
        related_name='recommendations',
    )
    menu_category = models.ForeignKey(
        'MenuCategory', null=True, blank=True, on_delete=models.CASCADE,
        related_name='recommendations',
    )

    # ── The target: what to offer alongside it (exactly one) ─────────────────
    recommended_product = models.ForeignKey(
        Product, null=True, blank=True, on_delete=models.CASCADE,
        related_name='recommended_by',
    )
    recommended_service = models.ForeignKey(
        Service, null=True, blank=True, on_delete=models.CASCADE,
        related_name='recommended_by',
    )
    recommended_menu_item = models.ForeignKey(
        'MenuItem', null=True, blank=True, on_delete=models.CASCADE,
        related_name='recommended_by',
    )

    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Checkout Recommendation'
        verbose_name_plural = 'Checkout Recommendations'
        ordering = ['sort_order', 'id']
        constraints = [
            models.CheckConstraint(
                condition=_exactly_one(*RECOMMENDATION_SOURCE_FIELDS),
                name='catalog_recommendation_exactly_one_source',
            ),
            models.CheckConstraint(
                condition=_exactly_one(*RECOMMENDATION_TARGET_FIELDS),
                name='catalog_recommendation_exactly_one_target',
            ),
        ]

    def save(self, *args, **kwargs):
        # `system` follows the source, exactly as `MenuSize.system` follows its
        # owner: a row whose tenant disagreed with its source's would be backed
        # up with one site's data and rendered on another's.
        source = self.source
        if source is not None and self.system_id != source.system_id:
            self.system_id = source.system_id
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = list(update_fields) + ['system']
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.source} → {self.target}"

    @property
    def source(self):
        """The item or category this recommendation hangs off."""
        return (
            self.product or self.service or self.menu_item
            or self.product_category or self.service_category or self.menu_category
        )

    @property
    def target(self):
        """The buyable being recommended."""
        return (
            self.recommended_product
            or self.recommended_service
            or self.recommended_menu_item
        )

    @property
    def target_kind(self):
        """``'product'`` | ``'service'`` | ``'menu_item'`` - the family the
        target belongs to, and the ``kind`` every cart and favorites endpoint
        already speaks."""
        if self.recommended_product_id:
            return 'product'
        if self.recommended_service_id:
            return 'service'
        return 'menu_item'


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
