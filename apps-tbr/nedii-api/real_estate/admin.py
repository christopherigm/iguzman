from django.contrib import admin
from real_estate.models import (
    RealEstateClassification,
    RealEstateFeature,
    RealEstatePicture,
    RealEstate
)

# Register your models here.

class RealEstateClassificationAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "name"
    ]
    search_fields=("slug", "name")
    list_filter=("enabled",)
    readonly_fields=(
        "href",
        "version"
    )

admin.site.register(RealEstateClassification, RealEstateClassificationAdmin)


class RealEstateFeatureAdmin(admin.ModelAdmin):
    list_display=[
        "name"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "version",
    )

admin.site.register(RealEstateFeature, RealEstateFeatureAdmin)


class RealEstatePictureAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "real_estate",
        "img_picture"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "href",
        "version"
    )

admin.site.register(RealEstatePicture, RealEstatePictureAdmin)


class RealEstateAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "slug",
        "classification",
        "price",
        "final_price",
        "area",
        "num_of_bedrooms",
        "num_of_bathrooms",
        "num_of_parking_spots"
    ]
    search_fields=("slug",)
    list_filter=("enabled", "classification")
    readonly_fields=(
        "slug",
        "href",
        "version",
        "final_price",
        "times_selled",
        "views",
    )

admin.site.register(RealEstate, RealEstateAdmin)
