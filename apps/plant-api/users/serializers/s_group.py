from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from django.contrib.auth.models import Group

class GroupSerializer(HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ["url", "name"]
