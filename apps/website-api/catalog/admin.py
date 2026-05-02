from django.contrib import admin
from django.core.cache import cache

from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service, ServiceImage,
    VariantOption, VariantOptionValue,
    ProductVariant, ProductVariantImage,
    ServiceVariant,
)


def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass


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


class ServiceImageInline(admin.TabularInline):
    model = ServiceImage
    extra = 0
    fields = ('image', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')


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
    inlines = [ProductImageInline, ProductVariantInline]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_featured', 'is_ai_generated', 'is_verified', 'version', 'created', 'modified'),
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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:product:{obj.pk}')
        _invalidate_pattern('catalog:products:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:product:{obj.pk}')
        cache.delete(f'catalog:product_variants:{obj.pk}')
        _invalidate_pattern('catalog:products:*')
        super().delete_model(request, obj)


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'modality', 'is_featured', 'is_ai_generated', 'is_verified', 'enabled', 'modified')
    list_filter = ('enabled', 'is_featured', 'is_ai_generated', 'is_verified', 'currency', 'modality', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [ServiceImageInline, ServiceVariantInline]

    fieldsets = (
        ('Identity', {
            'fields': ('system', 'category', 'brand', 'enabled', 'is_featured', 'is_ai_generated', 'is_verified', 'version', 'created', 'modified'),
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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:service:{obj.pk}')
        _invalidate_pattern('catalog:services:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:service:{obj.pk}')
        cache.delete(f'catalog:service_variants:{obj.pk}')
        _invalidate_pattern('catalog:services:*')
        super().delete_model(request, obj)


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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:variant_option:{obj.pk}')
        _invalidate_pattern('catalog:variant_options:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:variant_option:{obj.pk}')
        cache.delete(f'catalog:variant_option_values:{obj.pk}')
        _invalidate_pattern('catalog:variant_options:*')
        super().delete_model(request, obj)


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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:variant_option_values:{obj.option_id}')
        cache.delete(f'catalog:variant_option:{obj.option_id}')
        _invalidate_pattern('catalog:variant_options:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:variant_option_values:{obj.option_id}')
        cache.delete(f'catalog:variant_option:{obj.option_id}')
        _invalidate_pattern('catalog:variant_options:*')
        super().delete_model(request, obj)


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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:product_variants:{obj.product_id}')
        cache.delete(f'catalog:product:{obj.product_id}')
        _invalidate_pattern('catalog:products:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:product_variants:{obj.product_id}')
        cache.delete(f'catalog:product:{obj.product_id}')
        _invalidate_pattern('catalog:products:*')
        super().delete_model(request, obj)


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

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        cache.delete(f'catalog:service_variants:{obj.service_id}')
        cache.delete(f'catalog:service:{obj.service_id}')
        _invalidate_pattern('catalog:services:*')

    def delete_model(self, request, obj):
        cache.delete(f'catalog:service_variants:{obj.service_id}')
        cache.delete(f'catalog:service:{obj.service_id}')
        _invalidate_pattern('catalog:services:*')
        super().delete_model(request, obj)
