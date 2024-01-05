from django.contrib import admin
from records.models import (
    PlantType,
    Plant,
    Measurement,
    PlantControllerType,
    PlantController,
)

# Register your models here.

class PlantControllerTypeAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'slug',
        'total_ram_capacity',
        'total_storage_capacity',
        'min_cpu_temperature',
        'max_cpu_temperature',
    ]
    search_fields = ('name','slug')
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
    )
admin.site.register(PlantControllerType, PlantControllerTypeAdmin)

class PlantControllerAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'plant_controller_type',
        'city',
        'cpu_temperature',
        'ram_allocated',
        'storage_allocated',
    ]
    search_fields = ('name','slug')
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
    )
admin.site.register(PlantController, PlantControllerAdmin)

class PlantTypeAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'slug',
        'min_soil_humidity',
        'min_ambient_temperature',
        'max_ambient_temperature',
    ]
    search_fields = ('name','slug')
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
    )
admin.site.register(PlantType, PlantTypeAdmin)

class PlantAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'plant_type',
        'plant_controller',
        'user',
        'enabled',
    ]
    search_fields = ('name','user')
    list_filter = (
        'enabled',
        'plant_type',
        'plant_controller',
    )
    readonly_fields=(
        'version',
    )
admin.site.register(Plant, PlantAdmin)

class MeasurementAdmin(admin.ModelAdmin):
    list_display = [
        'plant',
        'ldr',
        'soil_moisture',
        'temperature',
        'humidity',
        'created',
    ]
    search_fields = ('plant__name',)
    list_filter = (
        'enabled',
        'plant',
    )
    readonly_fields=(
        'version',
    )
admin.site.register(Measurement, MeasurementAdmin)
