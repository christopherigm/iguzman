"""The site-settings endpoint.

``GET /api/system/``   public, cached - read by every page of the public site
``PATCH /api/system/`` administrators only - what the CMS saves

No pk in either URL, and that is deliberate: ``System`` is a singleton here (see
its docstring), so an addressable id would only invite code that assumes there
could be a second one. ``System.load()`` creates the row with its defaults if it
is missing, so a fresh database serves the defaults rather than 404ing before
anyone has opened the CMS.
"""

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import cache_keys as keys
from .cache import cached_get, cached_set, invalidate
from .models import System
from .permissions import IsSiteAdmin
from .system_serializers import SystemSerializer, SystemWriteSerializer


class SystemView(APIView):
    """Read or update the one settings row."""

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [AllowAny()]
        return [IsSiteAdmin()]

    def get(self, request):
        cached = cached_get(keys.SYSTEM)
        if cached is not None:
            return Response(cached)
        data = SystemSerializer(System.load(), context={'request': request}).data
        cached_set(keys.SYSTEM, data)
        return Response(data)

    def patch(self, request):
        instance = System.load()
        serializer = SystemWriteSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        # `post_save` on System already clears this (core/signals.py); the
        # explicit call keeps the view honest on its own, exactly as the generic
        # cached views do, and costs one Redis delete.
        invalidate(keys.SYSTEM)
        return Response(SystemSerializer(instance, context={'request': request}).data)
