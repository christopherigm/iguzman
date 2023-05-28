from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from common.models import System as SystemModel
from common.serializers import SystemSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet


class System(APIView):
    def get( self, request ):
        data={
            "system": {
                "version": "1.0.3"
            }
        }
        return Response(data, status.HTTP_200_OK)


class SystemViewSet(ReadOnlyModelViewSet):
    queryset=SystemModel.objects.all()
    serializer_class=SystemSerializer
    ordering=["id"]
