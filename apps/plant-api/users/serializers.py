import uuid
from django.conf import settings
from rest_framework_json_api import serializers
from rest_framework_json_api.serializers import (
    HyperlinkedModelSerializer,
    ResourceRelatedField,
)
from users.models import User
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import Group
from rest_framework.validators import UniqueValidator
from django.core.mail import EmailMultiAlternatives


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
