from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from rest_framework_json_api import serializers
from datetime import date
from django.conf import settings
import zoneinfo
from django.utils import timezone
from users.models import User
from records.models import (
    Plant,
    Measurement,
    PlantType,
    PlantControllerType,
    PlantController
)
from common.models import City

# Create your serializers here.

class PlantControllerTypeSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=PlantControllerType
        fields="__all__"


class PlantControllerSerializer(HyperlinkedModelSerializer):
    city = ResourceRelatedField(
        queryset=City.objects
    )
    plant_controller_type = ResourceRelatedField(
        queryset=PlantControllerType.objects
    )

    included_serializers={
        "city": "common.serializers.CitySerializer",
        "plant_controller_type": "records.serializers.PlantControllerTypeSerializer",
    }

    class Meta:
        model=PlantController
        fields="__all__"


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
    plant_controller = ResourceRelatedField(
        queryset=PlantController.objects
    )
    included_serializers={
        "user": "users.serializers.UserSerializer",
        "plant_type": "records.serializers.PlantTypeSerializer",
        "plant_controller": "records.serializers.PlantControllerSerializer",
    }
    last_measurement = serializers.SerializerMethodField()

    def get_last_measurement(self, plant):
        last_measurement = Measurement.objects.filter(plant=plant.id).order_by('-id')[0:1]

        if (len(last_measurement) > 0 and
                plant.plant_type is not None and
                plant.plant_type.min_light_value is not None and
                plant.plant_type.max_light_value is not None and
                plant.plant_controller.plant_controller_type is not None
            ):
            data=last_measurement[0]
            
            today=date.today()
            measurements_of_direct_light = Measurement.objects.filter(
                plant=plant.id,
                created__day=today.day,
                created__month=today.month,
                created__year=today.year,
                # created__hour__gte=6,
                # created__hour__lte=18,
                ldr__gte=plant.plant_type.min_light_value,
                ldr__lte=plant.plant_type.max_light_value
            )
            computed_hours_of_direct_light = 0
            if (len(measurements_of_direct_light) > 0):
                a = int(len(measurements_of_direct_light))
                b = int(plant.plant_type.minutes_to_upload_sensor_data)
                computed_hours_of_direct_light = round(((a*b) / 60), 2)

            ram_free = 0
            storage_free = 0

            total_ram_capacity=plant.plant_controller.plant_controller_type.total_ram_capacity
            total_storage_capacity=plant.plant_controller.plant_controller_type.total_storage_capacity

            if total_ram_capacity is not None and data.ram_allocated is not None:
                ram_free = total_ram_capacity - data.ram_allocated

            if total_storage_capacity is not None and data.storage_allocated is not None:
                storage_free = total_storage_capacity - data.storage_allocated
            
            created_fixed = timezone.make_naive(data.created)
            created_fixed.replace(tzinfo=zoneinfo.ZoneInfo(settings.TIME_ZONE))

            return {
                'soil_moisture': data.soil_moisture,
                'ldr': data.ldr,
                'temperature': data.temperature,
                'humidity': data.humidity,
                'is_day': data.is_day,
                'cpu_temperature': data.cpu_temperature,
                'computed_hours_of_direct_light': computed_hours_of_direct_light,
                'total_ram_capacity': total_ram_capacity,
                'ram_allocated': data.ram_allocated,
                'ram_free': ram_free,
                'total_storage_capacity': total_storage_capacity,
                'storage_allocated': data.storage_allocated,
                'storage_free': storage_free,
                'created': created_fixed,
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
        exclude=['debug_measurment_data']
