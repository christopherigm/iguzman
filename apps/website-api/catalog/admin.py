from django.contrib import admin

from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service,
    VariantOption, VariantOptionValue,
    ProductVariant, ProductVariantImage,
    ServiceVariant,
)


# ---------------------------------------------------------------------------
# Shared inlines
# ---------------------------------------------------------------------------

class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    fields = ('image', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')


class ProductVariantInline(admin.StackedInline):
    model = ProductVariant
    extra = 0
    fields = (
        ('is_default', 'sort_order', 'enabled'),
        'option_values',
        ('name', 'en_name'),
        'image',
        ('sku', 'barcode'),
        ('price', 'compare_price', 'cost_price'),
        ('in_stock', 'stock_count'),
        ('weight', 'length', 'width', 'height'),
    )
    filter_horizontal = ('option_values',)
    show_change_link = True


class ServiceVariantInline(admin.StackedInline):
    model = ServiceVariant
    extra = 0
    fields = (
        ('is_default', 'sort_order', 'enabled'),
        'option_values',
        ('name', 'en_name'),
        'image',
        'sku',
        ('price', 'compare_price', 'cost_price'),
        ('duration', 'modality'),
    )
    filter_horizontal = ('option_values',)
    show_change_link = True


class ProductVariantImageInline(admin.TabularInline):
    model = ProductVariantImage
    extra = 0
    fields = ('image', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')


class VariantOptionValueInline(admin.TabularInline):
    model = VariantOptionValue
    extra = 1
    fields = ('name', 'en_name', 'slug', 'color', 'sort_order', 'enabled')
    prepopulated_fields = {'slug': ('name',)}


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
    )


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'system', 'parent', 'enabled', 'modified')
    list_filter = ('enabled', 'system')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')

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
    )


# ---------------------------------------------------------------------------
# Product / Service admins
# ---------------------------------------------------------------------------

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'in_stock', 'is_featured', 'enabled', 'modified')
    list_filter = ('enabled', 'in_stock', 'is_featured', 'currency', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku', 'barcode')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [ProductImageInline, ProductVariantInline]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_featured', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description', 'image', 'fit', 'background_color', 'href'),
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
        ('Dimensions', {
            'fields': ('length', 'width', 'height', 'dimension_unit', 'weight', 'weight_unit'),
            'classes': ('collapse',),
        }),
    )


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'modality', 'is_featured', 'enabled', 'modified')
    list_filter = ('enabled', 'is_featured', 'currency', 'modality', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [ServiceVariantInline]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_featured', 'version', 'created', 'modified'),
        }),
        ('Content (ES)', {
            'fields': ('name', 'slug', 'description', 'image', 'fit', 'background_color', 'href'),
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
    )


# ---------------------------------------------------------------------------
# Variant admins
# ---------------------------------------------------------------------------

@admin.register(VariantOption)
class VariantOptionAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'system', 'enabled', 'modified')
    list_filter = ('enabled', 'system')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [VariantOptionValueInline]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'enabled', 'version', 'created', 'modified'),
        }),
        ('Content', {
            'fields': ('name', 'slug', 'en_name'),
        }),
    )


@admin.register(VariantOptionValue)
class VariantOptionValueAdmin(admin.ModelAdmin):
    list_display = ('name', 'option', 'slug', 'sort_order', 'color', 'enabled')
    list_filter = ('enabled', 'option')
    search_fields = ('name', 'en_name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')

    fieldsets = (
        ('Identity', {
            'fields': ('option', 'enabled', 'sort_order', 'version', 'created', 'modified'),
        }),
        ('Content', {
            'fields': ('name', 'slug', 'en_name', 'color'),
        }),
    )


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'product', 'sku', 'effective_price', 'in_stock', 'is_default', 'sort_order', 'enabled')
    list_filter = ('enabled', 'in_stock', 'is_default', 'product__system', 'product__category')
    search_fields = ('name', 'en_name', 'sku', 'barcode', 'product__name')
    readonly_fields = ('created', 'modified', 'version', 'effective_price', 'effective_name', 'effective_image')
    filter_horizontal = ('option_values',)
    inlines = [ProductVariantImageInline]

    fieldsets = (
        ('Identity', {
            'fields': ('product', 'enabled', 'is_default', 'sort_order', 'version', 'created', 'modified'),
        }),
        ('Option Values', {
            'fields': ('option_values',),
        }),
        ('Content Override', {
            'fields': ('name', 'en_name', 'image'),
            'description': 'Leave blank to inherit from the parent product.',
        }),
        ('Pricing Override', {
            'fields': ('price', 'compare_price', 'cost_price'),
            'description': 'Leave blank to inherit from the parent product.',
        }),
        ('Inventory', {
            'fields': ('sku', 'barcode', 'in_stock', 'stock_count'),
        }),
        ('Dimensions Override', {
            'fields': ('weight', 'length', 'width', 'height'),
            'classes': ('collapse',),
            'description': 'Leave blank to inherit from the parent product.',
        }),
        ('Effective Values (read-only)', {
            'fields': ('effective_name', 'effective_price', 'effective_image'),
            'classes': ('collapse',),
        }),
    )


@admin.register(ServiceVariant)
class ServiceVariantAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'service', 'sku', 'effective_price', 'effective_duration', 'is_default', 'sort_order', 'enabled')
    list_filter = ('enabled', 'is_default', 'modality', 'service__system', 'service__category')
    search_fields = ('name', 'en_name', 'sku', 'service__name')
    readonly_fields = ('created', 'modified', 'version', 'effective_price', 'effective_name', 'effective_image', 'effective_duration', 'effective_modality')
    filter_horizontal = ('option_values',)

    fieldsets = (
        ('Identity', {
            'fields': ('service', 'enabled', 'is_default', 'sort_order', 'version', 'created', 'modified'),
        }),
        ('Option Values', {
            'fields': ('option_values',),
        }),
        ('Content Override', {
            'fields': ('name', 'en_name', 'image'),
            'description': 'Leave blank to inherit from the parent service.',
        }),
        ('Pricing Override', {
            'fields': ('price', 'compare_price', 'cost_price'),
            'description': 'Leave blank to inherit from the parent service.',
        }),
        ('Service Details Override', {
            'fields': ('sku', 'duration', 'modality'),
            'description': 'Leave blank to inherit from the parent service.',
        }),
        ('Effective Values (read-only)', {
            'fields': ('effective_name', 'effective_price', 'effective_image', 'effective_duration', 'effective_modality'),
            'classes': ('collapse',),
        }),
    )
