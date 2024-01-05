from rest_framework.viewsets import ModelViewSet
from statistics_records.models import DayMeasurement
from statistics_records.serializers import DayMeasurementSerializer

# Create your views here.

class DayMeasurementViewSet(ModelViewSet):
    queryset = DayMeasurement.objects.all()
    serializer_class = DayMeasurementSerializer
    permission_classes = []
    authentication_classes = []
    ordering = ["id"]
    ordering_fields = [
        "id",
        "created",
    ]
    filterset_fields = {
        "id": ("exact",),
        "plant": ("exact",),
        "created": ("exact", "lt", "gt", "gte", "lte", "in"),
    }
    search_fields = [
        "plant__name",
    ]
