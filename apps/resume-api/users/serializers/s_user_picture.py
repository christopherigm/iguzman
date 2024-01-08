from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from users.models import UserPicture
# from django.contrib.auth.models import User
from users.models import User

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
