from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from pages.models import Page
from info_grid.models import (
    InfoGrid,
    InfoGridItem
)

class InfoGridItemSerializer(HyperlinkedModelSerializer):
    page = ResourceRelatedField (
        queryset = Page.objects,
        required = True
    )
    info_grid = ResourceRelatedField (
        queryset = InfoGrid.objects,
        required = True
    )

    class Meta:
        model = InfoGridItem
        fields = '__all__'

class InfoGridSerializer(HyperlinkedModelSerializer):
    page = ResourceRelatedField (
        queryset = Page.objects,
        required = True
    )
    items = ResourceRelatedField (
        queryset = InfoGridItem.objects,
        required = True,
        many = True
    )
    included_serializers = {
        'items': InfoGridItemSerializer,
        'page': 'pages.serializers.PageSerializer'
    }

    class Meta:
        model = InfoGrid
        fields = '__all__'
