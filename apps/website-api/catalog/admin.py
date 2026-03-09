from django.contrib import admin

from .models import Category, Product, ProductImage


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    fields = ('image', 'name', 'sort_order', 'enabled')
    readonly_fields = ('created', 'modified')


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
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


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'brand', 'price', 'currency', 'in_stock', 'is_featured', 'enabled', 'modified')
    list_filter = ('enabled', 'in_stock', 'is_featured', 'currency', 'system', 'category', 'brand')
    search_fields = ('name', 'en_name', 'slug', 'sku', 'barcode')
    prepopulated_fields = {'slug': ('name',)}
    readonly_fields = ('created', 'modified', 'version')
    inlines = [ProductImageInline]

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
