from rest_framework.viewsets import ModelViewSet
from records.models import (
    Plant,
    Measurement,
    PlantType
)
from records.serializers import (
    PlantSerializer,
    MeasurementSerializer,
    PlantTypeSerializer
)

# Create your views here.

class PlantTypeViewSet(ModelViewSet):
    queryset = PlantType.objects.all()
    serializer_class = PlantTypeSerializer
    permission_classes = []
    authentication_classes = []
    ordering = ["id"]
    ordering_fields = [
        "id", "name"
    ]
    filterset_fields = {
        "id": ("exact",),
        "slug": ("exact",),
        "name": ("exact", "in"),
    }
    search_fields = [
        "name",
        "slug",
    ]


class PlantViewSet(ModelViewSet):
    queryset = Plant.objects.all()
    serializer_class = PlantSerializer
    permission_classes = []
    authentication_classes = []
    ordering = ["id"]
    ordering_fields = [
        "id", "name"
    ]
    filterset_fields = {
        "id": ("exact",),
        "user": ("exact",),
        "slug": ("exact",),
        "plant_type": ("exact", "in"),
        "name": ("exact", "in"),
    }
    search_fields = [
        "name",
        "slug",
    ]


class MeasurementViewSet(ModelViewSet):
    queryset = Measurement.objects.all()
    serializer_class = MeasurementSerializer
    permission_classes = []
    authentication_classes = []
    ordering = ["id"]
    ordering_fields = [
        "id",
    ]
    filterset_fields = {
        "id": ("exact",),
        "plant": ("exact",),
    }
    search_fields = [
        "plant__name",
    ]
