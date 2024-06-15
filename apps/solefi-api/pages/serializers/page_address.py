from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from pages.models import Page, PageAddress
from common.models import City
from common.serializers import CitySerializer

class PageAddressSerializer(HyperlinkedModelSerializer):
    page=ResourceRelatedField (
        queryset=Page.objects,
        required=True
    )
    city=ResourceRelatedField (
        queryset=City.objects,
        required=True
    )
    included_serializers={
        'city': CitySerializer
    }

    class Meta:
        model=PageAddress
        fields='__all__'
        extra_kwargs={
            'created': {
                'read_only': True
            },
            'modified': {
                'read_only': True
            }
        }
