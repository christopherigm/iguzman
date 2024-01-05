from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from meal.models import (
    MealClassification,
    MealAddon,
    MealPicture,
    Meal,
)
from stand.models import Stand

class MealAddonSerializer(HyperlinkedModelSerializer):

    stand=ResourceRelatedField( queryset=Stand.objects )

    class Meta:
        model=MealAddon
        fields="__all__"


class MealClassificationSerializer(HyperlinkedModelSerializer):

    stand=ResourceRelatedField( queryset=Stand.objects )

    class Meta:
        model=MealClassification
        fields="__all__"


class MealPictureSerializer(HyperlinkedModelSerializer):

    stand=ResourceRelatedField( queryset=Stand.objects )
    meal=ResourceRelatedField( queryset=Meal.objects )

    class Meta:
        model=MealPicture
        fields="__all__"


class MealSerializer(HyperlinkedModelSerializer):

    stand=ResourceRelatedField( queryset=Stand.objects )
    classification=ResourceRelatedField( queryset=MealClassification.objects )
    meal_pictures=ResourceRelatedField(
        queryset=MealPicture.objects,
        many=True
    )
    meal_addons=ResourceRelatedField(
        queryset=MealAddon.objects,
        many=True
    )

    included_serializers={
        "classification": "meal.serializers.MealClassificationSerializer",
        "meal_pictures": "meal.serializers.MealPictureSerializer",
        "meal_addons": "meal.serializers.MealAddonSerializer",
        "stand": "stand.serializers.StandSerializer"
    }

    class Meta:
        model=Meal
        fields="__all__"
