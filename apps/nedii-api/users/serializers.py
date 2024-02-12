import uuid
from django.conf import settings
from rest_framework_json_api import serializers
from rest_framework_json_api.serializers import (
    HyperlinkedModelSerializer,
    ResourceRelatedField,
)
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import Group
from rest_framework.validators import UniqueValidator
from django.core.mail import EmailMultiAlternatives
from users.models import (
    User,
    UserFavoriteStand,
    UserAddress,
    UserCartBuyableItem,
    UserFavoriteBuyableItem,
    UserFavoriteStand,
    UserOrderBuyableItem,
    UserOrder,
)
from common.models import City
from stand.models import Stand
from product.models import Product
from service.models import Service
from meal.models import Meal, MealAddon
from real_estate.models import RealEstate
from vehicle.models import Vehicle

class GroupSerializer(HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ["url", "name"]


class UserLoginSerializer(
        HyperlinkedModelSerializer,
        TokenObtainPairSerializer
    ):
    access = serializers.SerializerMethodField()
    refresh = serializers.SerializerMethodField()

    def get_access(self, user):
        token = super().get_token(user).access_token
        token["admin"] = user.is_superuser
        token["user_agent"] = user.user_agent
        token["ip"] = user.remote_addr
        return str(token)

    def get_refresh(self, user):
        token = super().get_token(user)
        return str(token)

    class Meta:
        model = User
        exclude = (
            "is_staff",
            "password"
        )
        meta_fields = (
            "access",
            "refresh"
        )


class UserSerializer(HyperlinkedModelSerializer):
    groups = ResourceRelatedField (
        queryset = Group.objects,
        many = True,
        required = False
    )
    email = serializers.EmailField (
        required = False,
        validators = [
            UniqueValidator(queryset=User.objects.all())
        ]
    )
    included_serializers = {
        "groups": "users.serializers.GroupSerializer"
    }
    class Meta:
        model = User
        exclude = (
            "user_permissions", "token", "is_superuser",
            "is_staff", "is_active", "date_joined",
            "last_login",
        )
        extra_kwargs = {
            "password": {
                "write_only": True,
                "required": False
            },
            "is_superuser": {
                "read_only": True
            },
            "is_staff": {
                "read_only": True
            },
            "is_active": {
                "read_only": True
            },
            "last_login": {
                "read_only": True
            },
            "date_joined": {
                "read_only": True
            },
            "token": {
                "read_only": True
            }
        }
    def create(self, validated_data):
        user = User()
        for i in validated_data:
            setattr(user, i, validated_data[i])
        user.set_password(validated_data["password"])
        user.token = uuid.uuid4()
        user.is_active = False
        subject = "Activa tu cuenta de {0}".format(
            settings.EMAIL_TEMPLATE_COMPANY_NAME
        )
        from_email = "{0} <{1}>".format(
            settings.EMAIL_TEMPLATE_COMPANY_NAME,
            settings.EMAIL_HOST_USER,
        )
        to = user.email
        text_content = """
            Para verificar tu cuenta de {0} con tu correo electronico
            por favor da click <a href={1}activate/{2}">en este link.</a>
        """.format(
            settings.EMAIL_TEMPLATE_COMPANY_NAME,
            settings.WEB_APP_URL,
            user.token,
        )
        html_content = """
            <h2>Bienvenido a {0} {1}!</h2>
            <p>
                Para verificar tu cuenta de correo electronico, por favor da click 
                <a href="{2}activate/{3}">en este link.</a>
            </p>
            <br/><br/>
            <span>Equipo de {0}</span>
            <br/><br/>
            <img width="140" src="{4}" />
            <br/>
        """.format(
            settings.EMAIL_TEMPLATE_COMPANY_NAME,
            user.first_name or user.username,
            settings.WEB_APP_URL,
            user.token,
            settings.EMAIL_TEMPLATE_COMPANY_LOGO,
        )
        msg = EmailMultiAlternatives(subject, text_content, from_email, [to])
        msg.attach_alternative(html_content, "text/html")
        msg.send()
        user.save()
        return user

    def update(self, instance, validated_data):
        for i in validated_data:
            setattr(instance, i, validated_data[i])
        if "password" in validated_data:
            instance.set_password(validated_data["password"])
        instance.save()
        return instance


######### Nedii specifics #########
class UserFavoriteStandSerializer(HyperlinkedModelSerializer):
    stand = ResourceRelatedField (
        queryset = Stand.objects,
        required = False
    )
    user = ResourceRelatedField (
        queryset = User.objects,
        required = False
    )
    included_serializers = {
        "stand": "common.serializers.StandSerializer",
        "user": "users.serializers.UserSerializer"
    }

    class Meta:
        model = UserFavoriteStand
        fields = "__all__"
        extra_kwargs = {
            "created": {
                "read_only": True
            },
            "modified": {
                "read_only": True
            }
        }


class UserAddressSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField (
        queryset = User.objects,
        required = False
    )
    city = ResourceRelatedField (
        queryset = City.objects,
        required = False
    )
    included_serializers = {
        "city": "common.serializers.CitySerializer",
        "user": "users.serializers.UserSerializer"
    }
    class Meta:
        model = UserAddress
        fields = "__all__"
        extra_kwargs = {
            "user": {
                "read_only": True
            },
            "created": {
                "read_only": True
            },
            "modified": {
                "read_only": True
            }
        }


class UserCartBuyableItemSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField (
        queryset = User.objects
    )
    product = ResourceRelatedField (
        queryset = Product.objects,
        required=False,
        allow_null=True
    )
    service = ResourceRelatedField (
        queryset = Service.objects,
        required=False,
        allow_null=True
    )
    meal = ResourceRelatedField (
        queryset = Meal.objects,
        required=False,
        allow_null=True
    )
    meal_addons = ResourceRelatedField (
        queryset = MealAddon.objects,
        many=True,
        required=False,
        allow_null=True
    )
    real_estate = ResourceRelatedField (
        queryset = RealEstate.objects,
        required=False,
        allow_null=True
    )
    vehicle = ResourceRelatedField (
        queryset = Vehicle.objects,
        required=False,
        allow_null=True
    )
    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "product": "product.serializers.ProductSerializer",
        "service": "service.serializers.ServiceSerializer",
        "meal": "meal.serializers.MealSerializer",
        "meal_addons": "meal.serializers.MealAddonSerializer",
        "real_estate": "real_estate.serializers.RealEstateSerializer",
        "vehicle": "vehicle.serializers.VehicleSerializer"
    }
    class Meta:
        model = UserCartBuyableItem
        fields = "__all__"
        extra_kwargs = {
            "created": {
                "read_only": True
            },
            "modified": {
                "read_only": True
            }
        }


class UserFavoriteBuyableItemSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField (
        queryset = User.objects,
        required = True
    )
    product = ResourceRelatedField (
        queryset = Product.objects,
        required=False,
        allow_null=True
    )
    service = ResourceRelatedField (
        queryset = Service.objects,
        required=False,
        allow_null=True
    )
    meal = ResourceRelatedField (
        queryset = Meal.objects,
        required=False,
        allow_null=True
    )
    meal_addons = ResourceRelatedField (
        queryset = MealAddon.objects,
        required=False,
        allow_null=True,
        many=True
    )
    real_estate = ResourceRelatedField (
        queryset = RealEstate.objects,
        required=False,
        allow_null=True
    )
    vehicle = ResourceRelatedField (
        queryset = Vehicle.objects,
        required=False,
        allow_null=True
    )
    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "product": "product.serializers.ProductSerializer",
        "service": "service.serializers.ServiceSerializer",
        "meal": "meal.serializers.MealSerializer",
        "meal_addons": "meal.serializers.MealAddonSerializer",
        "real_estate": "real_estate.serializers.RealEstateSerializer",
        "vehicle": "vehicle.serializers.VehicleSerializer"
    }
    class Meta:
        model = UserFavoriteBuyableItem
        fields = "__all__"
        extra_kwargs = {
            "created": {
                "read_only": True
            },
            "modified": {
                "read_only": True
            }
        }


class UserOrderBuyableItemSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField (
        queryset = User.objects,
        required = True
    )
    purchase_order = ResourceRelatedField (
        queryset = UserOrder.objects,
        required=False,
        allow_null=True
    )
    product = ResourceRelatedField (
        queryset = Product.objects,
        required=False,
        allow_null=True
    )
    service = ResourceRelatedField (
        queryset = Service.objects,
        required=False,
        allow_null=True
    )
    meal = ResourceRelatedField (
        queryset = Meal.objects,
        required = False
    )
    meal_addons = ResourceRelatedField (
        queryset = MealAddon.objects,
        required=False,
        allow_null=True,
        many=True
    )
    real_estate = ResourceRelatedField (
        queryset = RealEstate.objects,
        required=False,
        allow_null=True
    )
    vehicle = ResourceRelatedField (
        queryset = Vehicle.objects,
        required=False,
        allow_null=True
    )
    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "product": "product.serializers.ProductSerializer",
        "service": "service.serializers.ServiceSerializer",
        "meal": "meal.serializers.MealSerializer",
        "meal_addons": "meal.serializers.MealAddonSerializer",
        "real_estate": "real_estate.serializers.RealEstateSerializer",
        "vehicle": "vehicle.serializers.VehicleSerializer"
    }
    class Meta:
        model = UserOrderBuyableItem
        fields = "__all__"
        extra_kwargs = {
            "created": {
                "read_only": True
            },
            "modified": {
                "read_only": True
            }
        }


class UserOrderSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField (
        queryset = User.objects,
        required = True
    )
    order_items = ResourceRelatedField (
        queryset = UserOrderBuyableItem.objects,
        required = False,
        many=True
    )
    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "order_items": "users.serializers.UserOrderBuyableItemSerializer"
    }
    class Meta:
        model = UserOrder
        fields = "__all__"
        extra_kwargs = {
            "created": {
                "read_only": True
            },
            "modified": {
                "read_only": True
            }
        }
