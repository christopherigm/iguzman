from django.contrib import admin
from product.models import (
    Product,
    ProductClassification,
    ProductDeliveryType,
    ProductFeature,
    ProductFeatureOption,
    ProductPicture
)

# Register your models here.

class ProductAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "name",
        "classification",
        "price",
        "final_price",
        "stand",
        "stock"
    ]
    search_fields=("slug", "name")
    list_filter=("enabled", "classification")
    readonly_fields=(
        "href",
        "version",
        "final_price"
    )

admin.site.register(Product, ProductAdmin)


class ProductClassificationAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "name",
        "stand"
    ]
    search_fields=("slug", "name")
    list_filter=("enabled",)
    readonly_fields=(
        "href",
        "version"
    )

admin.site.register(ProductClassification, ProductClassificationAdmin)


class ProductFeatureAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "stand"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "version",
    )

admin.site.register(ProductFeature, ProductFeatureAdmin)


class ProductFeatureOptionAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "feature"
    ]
    search_fields=("name",)
    list_filter=("enabled","feature")
    readonly_fields=(
        "version",
    )

admin.site.register(ProductFeatureOption, ProductFeatureOptionAdmin)


class ProductDeliveryTypeAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "icon"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "version",
    )

admin.site.register(ProductDeliveryType, ProductDeliveryTypeAdmin)


class ProductPictureAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "img_picture"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "href",
        "version"
    )

admin.site.register(ProductPicture, ProductPictureAdmin)
