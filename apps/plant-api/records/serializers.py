from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from rest_framework_json_api import serializers
from users.models import User
from records.models import (
    Plant,
    Measurement,
    PlantType
)

# Create your serializers here.

class PlantTypeSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=PlantType
        fields="__all__"


class PlantSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField(
        queryset=User.objects
    )
    plant_type = ResourceRelatedField(
        queryset=PlantType.objects
    )
    included_serializers={
        "user": "users.serializers.UserSerializer",
        "plant_type": "records.serializers.PlantTypeSerializer",
    }
    last_measurement = serializers.SerializerMethodField()

    def get_last_measurement(self, plant):
        last_measurements = Measurement.objects.filter(plant=plant.id).order_by('-id')[0:1]
        if len(last_measurements) > 0:
            data = last_measurements[0]
            return {
                'soil_moisture': data.soil_moisture,
                'ldr': data.ldr,
                'temperature': data.temperature,
                'humidity': data.humidity,
                'is_day': data.is_day,
                'cpu_temperature': data.cpu_temperature,
                'created': data.created,
            }
        return None

    class Meta:
        model=Plant
        fields="__all__"


class MeasurementSerializer(HyperlinkedModelSerializer):
    plant = ResourceRelatedField(
        queryset=Plant.objects
    )
    included_serializers={
        "plant": "records.serializers.PlantSerializer",
    }
    class Meta:
        model=Measurement
        fields="__all__"
