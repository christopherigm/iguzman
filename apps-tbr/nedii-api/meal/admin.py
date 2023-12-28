from django.contrib import admin

from meal.models import (
    MealClassification,
    MealPicture,
    MealAddon,
    Meal
)

# Register your models here.

class MealClassificationAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "name",
        "stand",
        "enabled",
    ]
    search_fields=("slug", "name")
    list_filter=("enabled",)
    readonly_fields=(
        "href",
        "slug"
    )

admin.site.register(MealClassification, MealClassificationAdmin)


class MealPictureAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "meal",
        "enabled",
    ]
    search_fields=("name",)
    list_filter=("enabled","stand","meal")
    readonly_fields=(
        "href",
    )

admin.site.register(MealPicture, MealPictureAdmin)


class MealAddonAdmin(admin.ModelAdmin):
    list_display=[
        "name",
        "stand",
        "quantity",
        "price",
        "enabled",
    ]
    search_fields=("name",)
    list_filter=("enabled","stand",)
    readonly_fields=(
        "href",
        "order"
    )

admin.site.register(MealAddon, MealAddonAdmin)


class MealPictureInline(admin.TabularInline):
    model=MealPicture

class MealAdmin(admin.ModelAdmin):
    list_display=[
        "slug",
        "stand",
        "price",
        "discount",
        "final_price",
        "times_selled",
        "views"
    ]
    search_fields=(
        "slug","name",
        "short_description",
        "classification__name"
    )
    list_filter=(
        "enabled",
        "classification",
        "stand"
    )
    readonly_fields=(
        "slug",
        "href",
        "times_selled",
        "views",
        "final_price"
    )

admin.site.register(Meal, MealAdmin)
