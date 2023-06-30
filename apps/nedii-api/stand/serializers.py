from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from rest_framework_json_api import serializers
from stand.models import (
    Expo,
    Group,
    StandPhone,
    StandRating,
    StandPicture,
    SurveyQuestion,
    VideoLink,
    StandBookingQuestion,
    StandBookingQuestionOption,
    StandNew,
    StandPicture,
    StandPromotion,
    Stand
)
from meal.models import Meal
from product.models import Product
from service.models import Service
from real_estate.models import RealEstate
from vehicle.models import Vehicle
from meal.models import Meal
from users.models import User
from common.models import City, NediiPlan


class ExpoSerializer(HyperlinkedModelSerializer):
    groups=ResourceRelatedField(
        queryset=Group.objects,
        many=True
    )

    included_serializers={
        'groups': 'stand.serializers.GroupSerializer'
    }

    class Meta:
        model=Expo
        fields='__all__'


class GroupSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=Group
        fields='__all__'


class StandBookingQuestionOptionSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=StandBookingQuestionOption
        fields='__all__'


class StandBookingQuestionSerializer(HyperlinkedModelSerializer):
    options=ResourceRelatedField(
        queryset=StandBookingQuestionOption.objects,
        many=True
    )
    included_serializers={
        'options': 'stand.serializers.StandBookingQuestionOptionsSerializer',
    }
    class Meta:
        model=StandBookingQuestion
        fields='__all__'


class StandNewSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    included_serializers={
        'stand': 'stand.serializers.StandSerializer'
    }
    class Meta:
        model=StandNew
        fields='__all__'


class StandPhoneSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    class Meta:
        model=StandPhone
        fields='__all__'


class StandPictureSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    class Meta:
        model=StandPicture
        fields='__all__'


class StandPromotionSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    meal=ResourceRelatedField( queryset=Meal.objects )
    included_serializers={
        'meal': 'meal.serializers.MealSerializer',
        'stand': 'stand.serializers.StandSerializer'
    }
    class Meta:
        model=StandPromotion
        fields='__all__'


class StandRatingSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    author=ResourceRelatedField( queryset=User.objects )
    included_serializers={
        'author': 'users.serializers.UserSerializer',
    }
    class Meta:
        model=StandRating
        fields='__all__'


class SurveyQuestionSerializer(HyperlinkedModelSerializer):
    class Meta:
        model=SurveyQuestion
        fields='__all__'


class VideoLinkSerializer(HyperlinkedModelSerializer):
    stand=ResourceRelatedField( queryset=Stand.objects )
    class Meta:
        model=VideoLink
        fields='__all__'


class StandSerializer(HyperlinkedModelSerializer):
    owner=ResourceRelatedField(
        queryset=User.objects
    )
    group=ResourceRelatedField(
        queryset=Group.objects
    )
    expo=ResourceRelatedField(
        queryset=Expo.objects
    )
    plan=ResourceRelatedField(
        queryset=NediiPlan.objects
    )
    panorama=ResourceRelatedField(
        queryset=StandPicture.objects,
        many=True
    )
    video_links=ResourceRelatedField(
        queryset=VideoLink.objects,
        many=True
    )
    pictures=ResourceRelatedField(
        queryset=StandPicture.objects,
        many=True
    )
    phones=ResourceRelatedField(
        queryset=StandPhone.objects,
        many=True
    )
    city=ResourceRelatedField(
        queryset=City.objects
    )
    stand_booking_questions=ResourceRelatedField(
        queryset=StandBookingQuestion.objects,
        many=True
    )
    stand_news=ResourceRelatedField(
        queryset=StandNew.objects,
        many=True
    )
    promotions=ResourceRelatedField(
        queryset=StandPromotion.objects,
        many=True
    )
    survey_questions=ResourceRelatedField(
        queryset=SurveyQuestion.objects,
        many=True
    )
    ratings=ResourceRelatedField(
        queryset=StandRating.objects,
        many=True
    )
    highlighted_products=ResourceRelatedField(
        queryset=Product.objects,
        many=True
    )
    highlighted_services=ResourceRelatedField(
        queryset=Service.objects,
        many=True
    )
    highlighted_meals=ResourceRelatedField(
        queryset=Meal.objects,
        many=True
    )
    highlighted_real_estates=ResourceRelatedField(
        queryset=RealEstate.objects,
        many=True
    )
    highlighted_vehicles=ResourceRelatedField(
        queryset=Vehicle.objects,
        many=True
    )

    included_serializers={
        'plan': 'common.serializers.NediiPlansSerializer',
        'owner': 'users.serializers.UserSerializer',
        'expo': 'stand.serializers.ExpoSerializer',
        'group': 'stand.serializers.GroupSerializer',
        'panorama': 'stand.serializers.StandPictureSerializer',
        'video_links': 'stand.serializers.VideoLinkSerializer',
        'pictures': 'stand.serializers.StandPictureSerializer',
        'phones': 'stand.serializers.StandPhoneSerializer',
        'city': 'common.serializers.CitySerializer',
        'stand_news': 'stand.serializers.StandNewSerializer',
        'promotions': 'stand.serializers.StandPromotionSerializer',
        'stand_booking_questions': 'stand.serializers.StandBookingQuestionSerializer',
        'ratings': 'stand.serializers.StandRatingSerializer',
        'survey_questions': 'stand.serializers.SurveyQuestionSerializer',
        'highlighted_products': 'product.serializers.ProductSerializer',
        'highlighted_services': 'service.serializers.ServiceSerializer',
        'highlighted_meals': 'meal.serializers.MealSerializer',
        'highlighted_real_estates': 'real_estate.serializers.RealEstateSerializer',
        'highlighted_vehicles': 'vehicle.serializers.VehicleSerializer'
    }

    products=serializers.SerializerMethodField()
    meals=serializers.SerializerMethodField()
    services=serializers.SerializerMethodField()
    vehicles=serializers.SerializerMethodField()
    real_estate=serializers.SerializerMethodField()

    def get_products(self, stand):
        products=Product.objects.filter(stand=stand.id)
        return len(products)

    def get_meals(self, stand):
        meals=Meal.objects.filter(stand=stand.id)
        return len(meals)

    def get_services(self, stand):
        services=Service.objects.filter(stand=stand.id)
        return len(services)

    def get_vehicles(self, stand):
        services=Vehicle.objects.filter(stand=stand.id)
        return len(services)

    def get_real_estate(self, stand):
        services=RealEstate.objects.filter(stand=stand.id)
        return len(services)

    class Meta:
        model=Stand
        fields='__all__'
        meta_fields=(
            'products',
            'meals',
            'services',
            'vehicles',
            'real_estate'
        )

