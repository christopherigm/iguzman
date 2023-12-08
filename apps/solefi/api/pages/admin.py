from django.contrib import admin
from pages.models import (
    PageAddress,
    Page
)

# Register your models here.

class PageAdmin(admin.ModelAdmin):
    list_display = [
        'slogan',
        'enabled'
    ]
    search_fields = ('slogan',)
    list_filter = ('enabled',)
    readonly_fields = ('views', 'version')
admin.site.register(Page, PageAdmin)

class PageAddressAdmin(admin.ModelAdmin):
    list_display = [
        'alias',
        'city',
        'enabled',
    ]
    search_fields = ('alias',)
    list_filter = ('enabled','city')
admin.site.register(PageAddress, PageAddressAdmin)
