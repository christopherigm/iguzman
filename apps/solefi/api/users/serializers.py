import uuid
from django.conf import settings
from rest_framework_json_api import serializers
from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework.validators import UniqueValidator
from rest_framework_json_api.relations import ResourceRelatedField
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.core.mail import EmailMultiAlternatives
from users.models import UserAddress, UserProfile
from common.models import City

# Create your serializers here.

class GroupSerializer(HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ['url', 'name']

class UserSerializer(HyperlinkedModelSerializer):
    groups = ResourceRelatedField (
        queryset = Group.objects,
        many = True,
        required = False
    )
    email = serializers.EmailField (
        required = True,
        validators = [
            UniqueValidator(queryset=User.objects.all())
        ]
    )
    included_serializers = {
        'groups': GroupSerializer
    }

    class Meta:
        model = User
        fields = [
            'url','username', 'email', 'last_login',
            'first_name', 'last_name', 'password',
            'is_superuser', 'groups', 'date_joined',
            'is_active', 'is_staff'
        ]
        extra_kwargs = {
            'password': {
                'write_only': True,
                'required': True
            },
            'is_superuser': {
                'read_only': True
            },
            'is_staff': {
                'read_only': True
            },
            'is_active': {
                'read_only': True
            },
            'last_login': {
                'read_only': True
            },
            'date_joined': {
                'read_only': True
            }
        }

    def create(self, validated_data):
        user = User()
        for i in validated_data:
            setattr(user, i, validated_data[i])
        user.set_password(validated_data['password'])
        user.is_active = False
        token = uuid.uuid4()
        if settings.ENVIRONMENT != 'localhost':
            subject = 'Activa tu cuenta de Solefi'
            from_email = settings.EMAIL_HOST_USER
            to = user.email
            text_content = 'Para continuar, por favor activa tu cuenta de Solefi en el siguiente <a href=activate/>link.</a>'
            html_content = '''
                <h2>Bienvenido a Solefi {0}!</h2>
                <p>
                    Para continuar, por favor activa tu cuenta de Solefi con el siguiente
                    <a href="{1}activate/{2}">link.</a>
                </p>
                <span>El equipo de Solefi.</span>
                <br/>
            '''.format(
                user.first_name,
                settings.WEB_APP_URL,
                token
            )
            msg = EmailMultiAlternatives(subject, text_content, from_email, [to])
            msg.attach_alternative(html_content, "text/html")
            msg.send()
        user.save()
        profile = UserProfile()
        profile.user = user
        profile.token = token
        profile.save()
        return user

    def update(self, instance, validated_data):
        for i in validated_data:
            setattr(instance, i, validated_data[i])
        if 'password' in validated_data:
            instance.set_password(validated_data['password'])
        instance.save()
        return instance


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
        'city': 'common.serializers.CitySerializer',
        'user': UserSerializer
    }

    class Meta:
        model = UserAddress
        fields = '__all__'
        extra_kwargs = {
            'user': {
                'read_only': True
            },
            'created': {
                'read_only': True
            },
            'modified': {
                'read_only': True
            }
        }

class UserLoginSerializer(
        HyperlinkedModelSerializer,
        TokenObtainPairSerializer
    ):
    access = serializers.SerializerMethodField()
    refresh = serializers.SerializerMethodField()

    def get_access(self, user):
        token = super().get_token(user).access_token
        token['admin'] = user.is_superuser
        token['user_agent'] = user.user_agent
        token['ip'] = user.remote_addr
        return str(token)

    def get_refresh(self, user):
        token = super().get_token(user)
        return str(token)

    class Meta:
        model = User
        exclude = (
            'is_staff',
            'password'
        )
        meta_fields = (
            'access',
            'refresh'
        )
