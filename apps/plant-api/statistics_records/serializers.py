from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from records.models import Plant
from statistics_records.models import DayMeasurement

# Create your serializers here.

class DayMeasurementSerializer(HyperlinkedModelSerializer):
    plant = ResourceRelatedField(
        queryset=Plant.objects
    )
    included_serializers={
        "plant": "records.serializers.PlantSerializer",
    }
    class Meta:
        model=DayMeasurement
        exclude=['debug_data']
