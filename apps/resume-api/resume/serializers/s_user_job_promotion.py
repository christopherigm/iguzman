from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from resume.models import UserJobPromotion, UserJob
# from django.contrib.auth.models import User
from users.models import User

class UserJobPromotionSerializer(HyperlinkedModelSerializer):
    user=ResourceRelatedField(
        queryset=User.objects
    )
    user_job=ResourceRelatedField(
        queryset=UserJob.objects
    )

    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "user_job": "resume.serializers.UserJobSerializer"
    }
    
    class Meta:
        model = UserJobPromotion
        fields = "__all__"
