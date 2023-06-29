from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from service.models import (
    ServiceClassification,
    ServiceFeature,
    ServicePicture,
    Service,
)
from stand.models import Stand

class ServiceClassificationSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    class Meta:
        model=ServiceClassification
        fields="__all__"


class ServiceFeatureSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    class Meta:
        model=ServiceFeature
        fields="__all__"


class ServicePictureSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    service=ResourceRelatedField( queryset=Service.objects )
    class Meta:
        model=ServicePicture
        fields="__all__"


class ServiceSerializer(HyperlinkedModelSerializer):
    classification=ResourceRelatedField( queryset=ServiceClassification.objects )
    stand=ResourceRelatedField( queryset=Stand.objects )
    features=ResourceRelatedField(
        queryset=ServiceFeature.objects,
        many=True
    )
    service_pictures=ResourceRelatedField(
        queryset=ServicePicture.objects,
        many=True
    )
    related=ResourceRelatedField(
        queryset=Service.objects,
        many=True
    )
    included_serializers={
        "stand": "stand.serializers.StandSerializer",
        "classification": "service.serializers.ServiceClassificationSerializer",
        "features": "service.serializers.ServiceFeatureSerializer",
        "service_pictures": "service.serializers.ServicePictureSerializer",
        "related": "service.serializers.ServiceSerializer"
    }
    class Meta:
        model=Service
        fields="__all__"
