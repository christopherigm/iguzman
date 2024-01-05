from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from common.models import System, HomePicture

class HomePictureSerializer(HyperlinkedModelSerializer):

    system=ResourceRelatedField( queryset=System.objects )

    class Meta:
        model=HomePicture
        fields="__all__"
