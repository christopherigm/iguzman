from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from stand.models import Stand
from real_estate.models import (
    RealEstateClassification,
    RealEstateFeature,
    RealEstatePicture,
    RealEstate,
)


class RealEstateClassificationSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=RealEstateClassification
        fields="__all__"


class RealEstateFeatureSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=RealEstateFeature
        fields="__all__"


class RealEstatePictureSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    real_estate=ResourceRelatedField( queryset=RealEstate.objects )

    class Meta:
        model=RealEstatePicture
        fields="__all__"


class RealEstateSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    classification=ResourceRelatedField( queryset=RealEstateClassification.objects )
    features=ResourceRelatedField(
        queryset=RealEstateFeature.objects,
        many=True
    )
    real_estate_pictures=ResourceRelatedField(
        queryset=RealEstatePicture.objects,
        many=True
    )
    related=ResourceRelatedField(
        queryset=RealEstate.objects,
        many=True
    )
    included_serializers={
        "stand": "stand.serializers.StandSerializer",
        "classification": "real_estate.serializers.RealEstateClassificationSerializer",
        "features": "real_estate.serializers.RealEstateFeatureSerializer",
        "real_estate_pictures": "real_estate.serializers.RealEstatePictureSerializer",
        "related": "real_estate.serializers.RealEstateSerializer"
    }
    class Meta:
        model=RealEstate
        fields="__all__"
