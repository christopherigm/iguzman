from django.contrib import admin
from service.models import (
    Service,
    ServiceClassification,
    ServiceFeature,
    ServicePicture
)


class ServiceAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "name",
        "classification",
        "price",
        "final_price",
        "stand"
    ]
    search_fields=("slug", "name")
    list_filter=("enabled", "classification")
    readonly_fields=(
        "href",
        "version",
        "final_price",
        "times_selled",
        "views",
    )
admin.site.register(Service, ServiceAdmin)


class ServiceClassificationAdmin(admin.ModelAdmin):
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
admin.site.register(ServiceClassification, ServiceClassificationAdmin)


class ServiceFeatureAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "stand"
    ]
    search_fields=("name",)
    list_filter=("enabled",)
    readonly_fields=(
        "version",
    )
admin.site.register(ServiceFeature, ServiceFeatureAdmin)


class ServicePictureAdmin(admin.ModelAdmin):
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
admin.site.register(ServicePicture, ServicePictureAdmin)
