from django.core.cache import cache

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import System
from .serializers import SystemSerializer, SystemWriteSerializer

SYSTEM_CACHE_TTL = 3600  # 1 hour


class SystemView(APIView):
    """
    GET  /api/system/          — returns the System record matching the request host (public).
    PATCH /api/system/<pk>/   — partial update of a System record (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
        # X-Website-Host is forwarded by the Next.js SSR layer so that
        # server-side fetches (which originate from the Next.js process)
        # carry the original browser host for correct System record lookup.
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]

        cache_key = f"system:host:{host}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        instance = System.objects.filter(host=host, enabled=True).first()
        if instance is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)

        data = SystemSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, SYSTEM_CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        try:
            instance = System.objects.get(pk=pk)
        except System.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SystemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)

        cache.delete(f"system:host:{instance.host}")

        return Response(SystemSerializer(instance, context={"request": request}).data)
