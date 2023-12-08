from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from pages.models import Page, PageAddress
from pages.serializers import (
  PageAddressSerializer
)

class PageSerializer(HyperlinkedModelSerializer):
    address=ResourceRelatedField (
        queryset=PageAddress.objects,
        required=False
    )
    branches=ResourceRelatedField (
        queryset=PageAddress.objects,
        required=False,
        many=True
    )
    included_serializers={
        'branches': PageAddressSerializer,
        'address': PageAddressSerializer
    }

    class Meta:
        model=Page
        fields='__all__'
        extra_kwargs={
            'created': {
                'read_only': True
            },
            'modified': {
                'read_only': True
            }
        }
