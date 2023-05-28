from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
# from django.contrib.auth.models import User
from users.models import User
from common.models import Sprint, ChangeLog

# Create your serializers here.

class SprintSerializer(HyperlinkedModelSerializer):
    tasks = ResourceRelatedField(
        queryset=ChangeLog.objects,
        many=True
    )
    included_serializers={
        "tasks": "common.serializers.ChangeLogSerializer",
    }
    class Meta:
        model=Sprint
        fields="__all__"


class ChangeLogSerializer(HyperlinkedModelSerializer):
    user = ResourceRelatedField(
        queryset=User.objects
    )
    included_serializers={
        "user": "users.serializers.UserSerializer",
    }
    class Meta:
        model=ChangeLog
        fields="__all__"
