from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/', include('users.urls')),
    # The reference catalog (categories, species, seasons, weather, locations)
    # and the journal feed (sightings and their media). Both are public on GET
    # and staff-only on write - see core/permissions.py.
    path('api/', include('catalog.urls')),
    path('api/', include('journal.urls')),
]

# Development only, and `static()` enforces that itself: it returns [] unless
# DEBUG. Production media lives in Cloudflare R2 and is served by the CDN, so
# Django never has a media file to hand out - see the media block in settings.py.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
