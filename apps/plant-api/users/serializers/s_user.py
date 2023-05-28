from pickle import FALSE
import uuid
from django.conf import settings
from rest_framework_json_api import serializers
from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework.validators import UniqueValidator
from rest_framework_json_api.relations import ResourceRelatedField
from django.contrib.auth.models import Group
from users.models import User
from django.core.mail import EmailMultiAlternatives

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

