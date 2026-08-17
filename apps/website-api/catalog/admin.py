from django.contrib import admin
from django.core.cache import cache

from core.cache import invalidate_pattern as _invalidate_pattern

from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service, ServiceImage,
    MenuCategory, MenuItem, MenuItemImage, MenuItemIngredient,
    MenuItemIngredientOption, MenuSize, RecipeStep,
    CatalogRecommendation,
    Ingredient, IngredientProvider,
)


# ---------------------------------------------------------------------------
# Shared inlines
# ---------------------------------------------------------------------------

def recommendation_inline(source_field, *, label='Checkout recommendation'):
    """A "Checkout recommendations" inline for one of the six possible sources.

    A factory because Django needs a distinct inline class per ``fk_name``, and
    six near-identical hand-written classes is six places for the field list to
    drift.

    ⚠ On an **item** an empty inline does not mean "recommends nothing" - it means
    "offer whatever my category recommends" (`RecommendationSource`). The `label`
    is what says so, since a Django inline has nowhere to put a description.
    """

    class _RecommendationInline(admin.TabularInline):
        model = CatalogRecommendation
        extra = 0
        verbose_name = label
        verbose_name_plural = f'{label}s'
        # All three target columns are shown because the relation is cross-family;
        # fill exactly one per row (a CheckConstraint enforces it).
        fields = (
            'recommended_product', 'recommended_service', 'recommended_menu_item',
            'sort_order', 'enabled',
        )
        raw_id_fields = (
            'recommended_product', 'recommended_service', 'recommended_menu_item',
        )

    _RecommendationInline.fk_name = source_field
    return _RecommendationInline


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    # The credit owed when this image came from a stock bank (BasePicture);
    # a gallery row is only editable through this inline.
    fields = ('image', 'attribution', 'attribution_url', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')



class ServiceImageInline(admin.TabularInline):
    model = ServiceImage
    extra = 0
    # The credit owed when this image came from a stock bank (BasePicture);
    # a gallery row is only editable through this inline.
    fields = ('image', 'attribution', 'attribution_url', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')




# ---------------------------------------------------------------------------
# Category admins
# ---------------------------------------------------------------------------

@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'system', 'parent', 'enabled', 'modified')
    list_filter = ('enabled', 'system')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [recommendation_inline('product_category')]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'parent', 'enabled', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description'),
            'classes': ('collapse',),
        }),
        ('Media', {
            'fields': ('image', 'fit', 'background_color', 'href'),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:product_category:{obj.pk}')
        _invalidate_pattern('catalog:product_categories:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:product_category:{obj.pk}')
        _invalidate_pattern('catalog:product_categories:*')
        super().delete_model(request, obj)


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'system', 'parent', 'enabled', 'modified')
    list_filter = ('enabled', 'system')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [recommendation_inline('service_category')]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'parent', 'enabled', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description'),
            'classes': ('collapse',),
        }),
        ('Media', {
            'fields': ('image', 'fit', 'background_color', 'href'),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:service_category:{obj.pk}')
        _invalidate_pattern('catalog:service_categories:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:service_category:{obj.pk}')
        _invalidate_pattern('catalog:service_categories:*')
        super().delete_model(request, obj)


# ---------------------------------------------------------------------------
# Product / Service admins
# ---------------------------------------------------------------------------

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'in_stock', 'is_featured', 'is_ai_generated', 'is_verified', 'enabled', 'modified')
    list_filter = ('enabled', 'in_stock', 'is_featured', 'is_ai_generated', 'is_verified', 'currency', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku', 'barcode')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    filter_horizontal = ('variants',)
    inlines = [ProductImageInline, recommendation_inline('product', label="Checkout recommendation (overrides the category's)")]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_featured', 'is_ai_generated', 'is_verified', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description', 'image', 'fit', 'background_color', 'href', 'video_link'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description'),
            'classes': ('collapse',),
        }),
        ('Pricing', {
            'fields': ('price', 'compare_price', 'cost_price', 'currency'),
        }),
        ('Inventory', {
            'fields': ('in_stock', 'stock_count', 'sku', 'barcode'),
        }),
        ('Variants', {
            'fields': ('variants',),
            'description': 'Other products that are alternative versions of this '
                           'one (a different size, color, material, etc.). The '
                           'link is mutual - adding it here surfaces it on the '
                           "other product's detail page too.",
        }),
        ('Dimensions', {
            'fields': ('length', 'width', 'height', 'dimension_unit', 'weight', 'weight_unit'),
            'classes': ('collapse',),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:product:{obj.pk}')
        # Variants are symmetrical, so a change here can also alter a sibling's
        # serialized output - clear every product cache, not just this one's.
        _invalidate_pattern('catalog:product:*')
        _invalidate_pattern('catalog:products:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:product:{obj.pk}')
        _invalidate_pattern('catalog:product:*')
        _invalidate_pattern('catalog:products:*')
        super().delete_model(request, obj)


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'modality', 'is_featured', 'is_ai_generated', 'is_verified', 'enabled', 'modified')
    list_filter = ('enabled', 'is_featured', 'is_ai_generated', 'is_verified', 'currency', 'modality', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    filter_horizontal = ('variants',)
    inlines = [ServiceImageInline, recommendation_inline('service', label="Checkout recommendation (overrides the category's)")]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_featured', 'is_ai_generated', 'is_verified', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description', 'image', 'fit', 'background_color', 'href', 'video_link'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description'),
            'classes': ('collapse',),
        }),
        ('Pricing', {
            'fields': ('price', 'compare_price', 'cost_price', 'currency'),
        }),
        ('Service Details', {
            'fields': ('sku', 'duration', 'modality'),
        }),
        ('Variants', {
            'fields': ('variants',),
            'description': 'Other services that are alternative versions of this '
                           'one (a different duration, modality, package, etc.). '
                           'The link is mutual - adding it here surfaces it on the '
                           "other service's detail page too.",
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:service:{obj.pk}')
        # Variants are symmetrical, so a change here can also alter a sibling's
        # serialized output - clear every service cache, not just this one's.
        _invalidate_pattern('catalog:service:*')
        _invalidate_pattern('catalog:services:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:service:{obj.pk}')
        _invalidate_pattern('catalog:service:*')
        _invalidate_pattern('catalog:services:*')
        super().delete_model(request, obj)


# ---------------------------------------------------------------------------
# Menu (food) admins
# ---------------------------------------------------------------------------

class MenuItemImageInline(admin.TabularInline):
    model = MenuItemImage
    extra = 0
    # The credit owed when this image came from a stock bank (BasePicture);
    # a gallery row is only editable through this inline.
    fields = ('image', 'attribution', 'attribution_url', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')


class MenuItemIngredientInline(admin.TabularInline):
    model = MenuItemIngredient
    extra = 0
    autocomplete_fields = ('ingredient',)
    fields = (
        'ingredient', 'group_name', 'group_en_name',
        'quantity', 'unit', 'price',
        'is_removable', 'is_internal', 'max_quantity',
        'number_of_free_portions', 'default_quantity',
        'sort_order', 'enabled',
    )


class MenuCategorySizeInline(admin.TabularInline):
    """The sizes every dish in this category inherits."""

    model = MenuSize
    fk_name = 'category'
    extra = 0
    fields = ('name', 'en_name', 'image', 'portion', 'unit', 'price_delta', 'is_default', 'sort_order', 'enabled')


class MenuItemSizeInline(admin.TabularInline):
    """A dish's OWN size rows, which *replace* its category's list.

    Empty is the normal state - it means the dish is offered in whatever sizes
    its category defines. Adding a row here overrides that list entirely.
    """

    model = MenuSize
    fk_name = 'menu_item'
    extra = 0
    fields = ('name', 'en_name', 'image', 'portion', 'unit', 'price_delta', 'is_default', 'sort_order', 'enabled')


class RecipeStepInline(admin.StackedInline):
    model = RecipeStep
    extra = 0
    fields = (('step_number', 'sort_order'), 'instruction', 'en_instruction', 'image')


@admin.register(MenuCategory)
class MenuCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'system', 'parent', 'enabled', 'modified')
    list_filter = ('enabled', 'system')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [MenuCategorySizeInline, recommendation_inline('menu_category')]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'parent', 'enabled', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description'),
            'classes': ('collapse',),
        }),
        ('Media', {
            'fields': ('image', 'fit', 'background_color', 'href'),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:menu_category:{obj.pk}')
        _invalidate_pattern('catalog:menu_categories:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:menu_category:{obj.pk}')
        _invalidate_pattern('catalog:menu_categories:*')
        super().delete_model(request, obj)


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'is_available', 'is_featured', 'is_ai_generated', 'is_verified', 'enabled', 'modified')
    list_filter = ('enabled', 'is_available', 'sizes_enabled', 'show_nutrition_label', 'is_featured', 'is_organic', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'is_ai_generated', 'is_verified', 'currency', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    filter_horizontal = ('variants',)
    inlines = [
        MenuItemImageInline, MenuItemSizeInline, MenuItemIngredientInline,
        recommendation_inline('menu_item', label="Checkout recommendation (overrides the category's)"), RecipeStepInline,
    ]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_available', 'sizes_enabled', 'show_nutrition_label', 'is_featured', 'is_ai_generated', 'is_verified', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description', 'short_description', 'image', 'fit', 'background_color', 'href', 'video_link'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description', 'en_short_description'),
            'classes': ('collapse',),
        }),
        ('Pricing', {
            'fields': ('price', 'compare_price', 'cost_price', 'currency', 'sku'),
        }),
        ('Dietary & Serving', {
            'fields': ('eta_minutes', 'spice_level', 'servings', 'portions', 'is_organic', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'allergens'),
        }),
        ('Variants', {
            'fields': ('variants',),
            'description': 'Other menu items that are alternative versions of this '
                           'dish (vegan, gluten-free, a different size, etc.). The '
                           'link is mutual - adding it here surfaces it on the '
                           "other item's detail page too.",
        }),
        ('Recipe (internal)', {
            'fields': ('prep_time_minutes', 'cook_time_minutes', 'recipe_notes'),
            'classes': ('collapse',),
            'description': 'Kitchen prep details. Not exposed on the public API.',
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:menu_item:{obj.pk}')
        # Variants are symmetrical, so a change here can also alter a sibling's
        # serialized output - clear every menu-item cache, not just this one's.
        _invalidate_pattern('catalog:menu_item:*')
        _invalidate_pattern('catalog:menu_items:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:menu_item:{obj.pk}')
        _invalidate_pattern(f'catalog:menu_item_ingredients:{obj.pk}:*')
        _invalidate_pattern('catalog:menu_item:*')
        _invalidate_pattern('catalog:menu_items:*')
        super().delete_model(request, obj)


class IngredientProviderInline(admin.TabularInline):
    model = IngredientProvider
    extra = 0
    fields = ('name', 'url', 'price', 'currency', 'sort_order')


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    inlines = [IngredientProviderInline]
    list_display = ('name', 'unit', 'nutrition_basis_quantity', 'price', 'currency', 'calories', 'system', 'enabled', 'modified')
    list_filter = ('enabled', 'unit', 'currency', 'system')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'enabled', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description'),
        }),
        ('Content (EN)', {
            'fields': ('en_name', 'en_description'),
            'classes': ('collapse',),
        }),
        ('Media', {
            'fields': ('image', 'fit', 'background_color', 'href'),
        }),
        ('Measurement', {
            'fields': ('unit', 'nutrition_basis_quantity'),
            'description': 'How the ingredient is bought/measured, and the amount '
                           'the FDA nutrition values below are stated per.',
        }),
        ('Pricing', {
            'fields': (('price', 'currency'),),
            'description': 'Purchasing price for `nutrition_basis_quantity` of `unit`.',
        }),
        ('Nutrition Facts (per basis)', {
            'fields': (
                'calories',
                ('total_fat', 'saturated_fat', 'trans_fat'),
                ('cholesterol', 'sodium'),
                ('total_carbohydrate', 'dietary_fiber'),
                ('total_sugars', 'added_sugars'),
                'protein',
                ('vitamin_d', 'calcium', 'iron', 'potassium'),
            ),
        }),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_pattern('catalog:ingredients:*')

    def delete_model(self, request, obj):
        _invalidate_pattern('catalog:ingredients:*')
        super().delete_model(request, obj)


class MenuItemIngredientOptionInline(admin.TabularInline):
    model = MenuItemIngredientOption
    extra = 0
    autocomplete_fields = ('ingredient',)
    fields = ('ingredient', 'price', 'sort_order')


@admin.register(MenuItemIngredient)
class MenuItemIngredientAdmin(admin.ModelAdmin):
    list_display = ('ingredient', 'menu_item', 'quantity', 'unit', 'price', 'calories', 'is_removable', 'is_internal', 'max_quantity', 'number_of_free_portions', 'default_quantity', 'sort_order', 'enabled')
    list_filter = ('enabled', 'is_removable', 'is_internal', 'menu_item__system')
    search_fields = ('ingredient__name', 'ingredient__en_name', 'menu_item__name')
    autocomplete_fields = ('ingredient',)
    inlines = [MenuItemIngredientOptionInline]
    readonly_fields = ('created', 'modified', 'version')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _invalidate_pattern(f'catalog:menu_item_ingredients:{obj.menu_item_id}:*')
        cache.delete(f'catalog:menu_item:{obj.menu_item_id}')
        _invalidate_pattern('catalog:menu_items:*')

    def delete_model(self, request, obj):
        _invalidate_pattern(f'catalog:menu_item_ingredients:{obj.menu_item_id}:*')
        cache.delete(f'catalog:menu_item:{obj.menu_item_id}')
        _invalidate_pattern('catalog:menu_items:*')
        super().delete_model(request, obj)


# ---------------------------------------------------------------------------
# Checkout recommendations
# ---------------------------------------------------------------------------

@admin.register(CatalogRecommendation)
class CatalogRecommendationAdmin(admin.ModelAdmin):
    """The flat view over every "don't forget this" pairing on the site.

    The six inlines above are where a pairing is normally authored (beside the
    item or category it hangs off); this exists to audit them all at once -
    "which of my dishes still recommend the discontinued soda?" is a question no
    per-item inline can answer.

    Cache invalidation is deliberately **not** duplicated here: the
    `post_save`/`post_delete` receivers in `catalog/signals.py` cover this admin,
    the six inlines, the API and any cascade alike.
    """

    list_display = ('source', 'target', 'target_kind', 'system', 'sort_order', 'enabled', 'modified')
    list_filter = ('enabled', 'system')
    readonly_fields = ('created', 'modified', 'version', 'system')
    raw_id_fields = (
        'product', 'service', 'menu_item',
        'product_category', 'service_category', 'menu_category',
        'recommended_product', 'recommended_service', 'recommended_menu_item',
    )

    fieldsets = (
        ('Source - exactly one', {
            'fields': (
                'product', 'service', 'menu_item',
                'product_category', 'service_category', 'menu_category',
            ),
            'description': 'What the customer is buying. An item overrides its '
                           "category's list entirely; a category applies to every "
                           'item in it that has no rows of its own.',
        }),
        ('Recommendation - exactly one', {
            'fields': (
                'recommended_product', 'recommended_service', 'recommended_menu_item',
            ),
            'description': 'What to offer alongside it at checkout. The relation is '
                           'one-way: this does not make the source show up under the '
                           'target.',
        }),
        ('Display', {
            'fields': ('sort_order', 'enabled', 'system', 'version', 'created', 'modified'),
        }),
    )
