from rest_framework.viewsets import ModelViewSet
from records.models import (
    Plant,
    Measurement,
    PlantType,
    PlantControllerType,
    PlantController,
)
from records.serializers import (
    PlantSerializer,
    MeasurementSerializer,
    PlantTypeSerializer,
    PlantControllerTypeSerializer,
    PlantControllerSerializer,
)

# Create your views here.

class PlantControllerTypeViewSet(ModelViewSet):
    queryset = PlantControllerType.objects.all()
    serializer_class = PlantControllerTypeSerializer
    permission_classes = []
    authentication_classes = []
    ordering = ["id"]
    ordering_fields = [
        "id",
        "name"
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


class PlantControllerViewSet(ModelViewSet):
    queryset = PlantController.objects.all()
    serializer_class = PlantControllerSerializer
    permission_classes = []
    authentication_classes = []
    ordering = ["id"]
    ordering_fields = [
        "id", "name"
    ]
    filterset_fields = {
        "id": ("exact",),
        "plant_controller_type": ("exact", "in"),
        "slug": ("exact",),
        "name": ("exact", "in"),
        "city": ("exact", "in"),
        "city__state": ("exact", "in"),
        "city__state__country": ("exact", "in"),
        "zip_code": ("exact", "in"),
    }
    search_fields = [
        "name",
        "slug",
    ]


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
        "id", "name", "modified", "created"
    ]
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
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
        "created": ("exact", "lt", "gt", "gte", "lte", "in"),
    }
    search_fields = [
        "plant__name",
    ]
