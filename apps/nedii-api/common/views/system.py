from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from common.models import System as SystemModel
from common.serializers import SystemSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet
from django.conf import settings
import zoneinfo
from django.utils import timezone
from datetime import datetime

class System(APIView):
    def get( self, request ):
        server_time_raw=datetime.now()
        server_time=timezone.make_aware(server_time_raw)
        server_time.replace(
            tzinfo=zoneinfo.ZoneInfo(settings.TIME_ZONE)
        )
        data={
            "system": {
                "hostname": settings.HOSTNAME,
                "version": settings.VERSION,
                "time": server_time_raw,
                "server_time": server_time
            }
        }
        return Response(data, status.HTTP_200_OK)


class SystemViewSet(ReadOnlyModelViewSet):
    queryset=SystemModel.objects.all()
    serializer_class=SystemSerializer
    ordering=["id"]
