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
    UserPicture,
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


class UserPictureSerializer(HyperlinkedModelSerializer):
    user=ResourceRelatedField (
        queryset=User.objects
    )

    included_serializers = {
        "user": "users.serializers.UserSerializer"
    }
    
    class Meta:
        model = UserPicture
        fields = "__all__"


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
        subject = "Activa tu cuenta"
        from_email = "My Resume via Christopher Guzman <{}>".format(settings.EMAIL_HOST_USER)
        to = user.email
        text_content = """To verify your email and activate yout account, please use the following link: <a href="{}activate/{}">click here.</a>""".format(settings.WEB_APP_URL, user.token)
        html_content = """
            <h2>Welcome to My Resume {0}!</h2>
            <p>
                To verify your email and activate yout account, please use the following link: 
                <a href="{1}activate/{2}">click here.</a>
            </p>
            <span>Christopher Guzman from My Resume.</span>
            <br/><br/>
            <img width="140" src="https://api.resume.iguzman.com.mx/media/CommonPicture/30fe7f63279bed0505eb6904fa2961f647c4.jpg" />
            <br/>
        """.format(
            user.first_name,
            settings.WEB_APP_URL,
            user.token
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