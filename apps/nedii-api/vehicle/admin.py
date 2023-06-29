from django.contrib import admin
from vehicle.models import (
    VehicleClassification,
    VehicleFeature,
    VehiclePicture,
    VehicleMake,
    VehicleModel,
    Vehicle
)

# Register your models here.

class VehicleClassificationAdmin(admin.ModelAdmin):
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
admin.site.register(VehicleClassification, VehicleClassificationAdmin)


class VehicleFeatureAdmin(admin.ModelAdmin):
    list_display=[
        "name"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "version",
    )
admin.site.register(VehicleFeature, VehicleFeatureAdmin)


class VehiclePictureAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "vehicle",
        "img_picture"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "href",
        "version"
    )
admin.site.register(VehiclePicture, VehiclePictureAdmin)


class VehicleMakeAdmin(admin.ModelAdmin):
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
admin.site.register(VehicleMake, VehicleMakeAdmin)


class VehicleModelAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "make",
        "img_picture"
    ]
    search_fields=("name",)
    list_filter=("enabled", "make")
    readonly_fields=(
        "href",
        "version"
    )
admin.site.register(VehicleModel, VehicleModelAdmin)


class VehicleAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "classification",
        "model",
        "price",
        "final_price",
        "automatic",
        "year",
        "doors",
        "gas",
        "stand"
    ]
    search_fields=("slug",)
    list_filter=("enabled", "classification")
    readonly_fields=(
        "name",
        "slug",
        "href",
        "version",
        "final_price",
        "times_selled",
        "views",
    )
admin.site.register(Vehicle, VehicleAdmin)
