"""
URL configuration for website_api project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from core.health import healthz, readyz

urlpatterns = [
    # Container probes. Deliberately at the root and outside /api/: they are for
    # the kubelet, not for a tenant, and they must not be behind anything that
    # resolves a site or a session. See core/health.py for why liveness and
    # readiness are two separate endpoints.
    path('healthz/', healthz),
    path('readyz/', readyz),
    path('admin/', admin.site.urls),
    path('api-auth/', include('rest_framework.urls')),
    path('api/auth/', include('users.urls')),
    # The users app's anonymous endpoints - deliberately outside the /api/auth/
    # prefix, which reads as "requires a session".
    path('api/', include('users.public_urls')),
    path('api/', include('core.urls')),
    path('api/', include('catalog.urls')),
    path('api/', include('orders.urls')),
]

# Development only, and `static()` enforces that itself: it returns [] unless
# DEBUG. Production media lives in Cloudflare R2 and is served by the CDN, so
# Django never has a media file to hand out - see the media block in settings.py.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
