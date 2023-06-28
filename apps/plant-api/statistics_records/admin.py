from django.contrib import admin
from statistics_records.models import DayMeasurement

# Register your models here.

class DayMeasurementAdmin(admin.ModelAdmin):
    list_display = [
        'plant',
        'created',
        'average_ldr',
        'average_soil_moisture',
        'average_temperature',
        'average_humidity',
        'hours_of_direct_light',
    ]
    search_fields = ('plant',)
    list_filter = ('enabled',)
    readonly_fields=(
        'version',
    )
admin.site.register(DayMeasurement, DayMeasurementAdmin)
