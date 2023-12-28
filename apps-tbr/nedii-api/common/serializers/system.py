from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from common.models import System, HomePicture

# Create your serializers here.


class SystemSerializer(HyperlinkedModelSerializer):
    home_pictures=ResourceRelatedField (
        queryset=HomePicture.objects,
        many=True
    )
    included_serializers={
        'home_pictures': 'common.serializers.HomePictureSerializer'
    }
    class Meta:
        model=System
        fields='__all__'
