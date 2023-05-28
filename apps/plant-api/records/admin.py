from django.contrib import admin
from records.models import (
    PlantType,
    Plant,
    Measurement
)

# Register your models here.

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
        'slug',
        'user',
        'enabled',
    ]
    search_fields = ('name','user')
    list_filter = ('enabled',)
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
        'is_day',
    ]
    search_fields = ('plant__name',)
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
    )
admin.site.register(Measurement, MeasurementAdmin)
