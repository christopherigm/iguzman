from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from vehicle.models import (
    VehicleClassification,
    VehicleFeature,
    VehiclePicture,
    VehicleMake,
    VehicleModel,
    Vehicle,
)
from stand.models import Stand

class VehicleClassificationSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=VehicleClassification
        fields="__all__"


class VehicleFeatureSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=VehicleFeature
        fields="__all__"


class VehiclePictureSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    vehicle=ResourceRelatedField( queryset=Vehicle.objects )
    class Meta:
        model=VehiclePicture
        fields="__all__"

class VehicleMakeSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=VehicleMake
        fields="__all__"


class VehicleModelSerializer(HyperlinkedModelSerializer):
    make=ResourceRelatedField( queryset=VehicleMake.objects )
    included_serializers={
        "make": "vehicle.serializers.VehicleMakeSerializer"
    }
    class Meta:
        model=VehicleModel
        fields="__all__"


class VehicleSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    classification=ResourceRelatedField( queryset=VehicleClassification.objects )
    model=ResourceRelatedField( queryset=VehicleModel.objects )
    features=ResourceRelatedField(
        queryset=VehicleFeature.objects,
        many=True
    )
    vehicle_pictures=ResourceRelatedField(
        queryset=VehiclePicture.objects,
        many=True
    )
    related=ResourceRelatedField(
        queryset=Vehicle.objects,
        many=True
    )
    included_serializers={
        "stand": "stand.serializers.StandSerializer",
        "classification": "vehicle.serializers.VehicleClassificationSerializer",
        "model": "vehicle.serializers.VehicleModelSerializer",
        "features": "vehicle.serializers.VehicleFeatureSerializer",
        "vehicle_pictures": "vehicle.serializers.VehiclePictureSerializer",
        "related": "vehicle.serializers.VehicleSerializer"
    }
    class Meta:
        model=Vehicle
        fields="__all__"
