import uuid
from django.conf import settings
from rest_framework_json_api import serializers
from rest_framework_json_api.serializers import HyperlinkedModelSerializer
# from django.contrib.auth.models import User
from users.models import User
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

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
