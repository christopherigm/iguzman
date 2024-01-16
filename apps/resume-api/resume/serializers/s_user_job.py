from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from resume.models import UserJob, Company
from common.models import City
# from django.contrib.auth.models import User
from users.models import User

class UserJobSerializer(HyperlinkedModelSerializer):
    user=ResourceRelatedField(
        queryset=User.objects
    )
    company=ResourceRelatedField(
        queryset=Company.objects
    )
    city=ResourceRelatedField(
        queryset=City.objects
    )
    job_promotions=ResourceRelatedField(
        queryset=City.objects,
        many=True
    )

    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "company": "resume.serializers.CompanySerializer",
        "city": "common.serializers.CitySerializer",
        "job_promotions": "resume.serializers.UserJobPromotionSerializer"
    }
    
    class Meta:
        model = UserJob
        fields = "__all__"
