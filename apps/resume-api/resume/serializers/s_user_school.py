from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from resume.models import UserSchool, School
from common.models import City
# from django.contrib.auth.models import User
from users.models import User

class UserSchoolSerializer(HyperlinkedModelSerializer):
    user=ResourceRelatedField(
        queryset=User.objects
    )
    city=ResourceRelatedField(
        queryset=City.objects
    )
    school=ResourceRelatedField(
        queryset=School.objects
    )

    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "school": "resume.serializers.SchoolSerializer",
        "city": "common.serializers.CitySerializer"
    }
    
    class Meta:
        model = UserSchool
        fields = "__all__"
