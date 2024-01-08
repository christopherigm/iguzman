from pickle import FALSE
import uuid
from django.conf import settings
from rest_framework_json_api import serializers
from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework.validators import UniqueValidator
from rest_framework_json_api.relations import ResourceRelatedField
from django.contrib.auth.models import Group
from users.models import User
from common.models import City
from resume.models import SkillCategory, UserJob
from django.core.mail import EmailMultiAlternatives

from datetime import date, datetime, timedelta
import zoneinfo
from django.utils import timezone

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
    categories=ResourceRelatedField (
        required = False,
        queryset = SkillCategory.objects,
        many = True
    )
    city=ResourceRelatedField(
        required = False,
        queryset = City.objects
    )

    included_serializers = {
        "categories": "resume.serializers.SkillCategorySerializer",
        "city": "common.serializers.CitySerializer",
        "groups": "users.serializers.GroupSerializer"
    }

    email = serializers.SerializerMethodField()
    years_of_experience = serializers.SerializerMethodField()

    def get_email(self, user):
        if not user.display_email:
            return None
        return "{}".format(user.email)
    
    def get_years_of_experience(self, user):
        jobs = UserJob.objects.filter(user=user.id)
        days=0
        if len(jobs) > 0:
            for x in jobs:
                if x.start_date is not None and x.end_date is not None:
                    diff=x.end_date - x.start_date
                    days += diff.days
                    print(days)
                elif x.start_date is not None and x.end_date is None:
                    diff=date.today() - x.start_date
                    days += diff.days
                    print(days)
        years = round(days / 365, 1)
        return years

    # profile = serializers.SerializerMethodField()
    
    # def get_profile(self, user):
    #     uri = str(self.context.get("request").build_absolute_uri())
    #     path = str(self.context.get("request").get_full_path())
    #     dns = uri.replace(path,"")
    #     profile = UserProfile.objects.filter(user=user.id)
    #     if len(profile) > 0:
    #         profile=profile[0]
    #         img=None
    #         if profile.img_picture is not None:
    #             img="{}/media/{}".format(
    #                 dns,
    #                 str(profile.img_picture)
    #             )
    #         return {
    #             "img_picture": img,
    #             "open_to_work": profile.open_to_work,
    #             "headline": profile.headline,
    #             "biography": profile.biography,
    #             "legal_name": profile.legal_name,
    #             "birthday": profile.birthday,
    #             "linkedin": profile.linkedin,
    #             "github": profile.github
    #         }
    #     return None

    class Meta:
        model = User
        exclude = (
            "user_permissions", "token", "is_superuser",
            "is_staff", "is_active", "date_joined",
            "last_login", "public", "listed", "published",
            "display_email"
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

