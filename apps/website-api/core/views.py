from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import System
from .serializers import SystemSerializer, SystemWriteSerializer


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
        host = request.get_host().split(":")[0]  # strip port if present
        instance = System.objects.filter(host=host, enabled=True).first()
        if instance is None:
            instance = System.objects.filter(enabled=True).first()
        if instance is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SystemSerializer(instance, context={"request": request})
        return Response(serializer.data)

    def patch(self, request, pk):
        try:
            instance = System.objects.get(pk=pk)
        except System.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SystemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        return Response(SystemSerializer(instance, context={"request": request}).data)
