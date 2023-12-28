from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from common.models import (
    State,
    Country
)

# Create your serializers here.

class StateSerializer(HyperlinkedModelSerializer):
    country=ResourceRelatedField (
        queryset=Country.objects   
    )
    included_serializers={
        'country': 'common.serializers.CountrySerializer'
    }
    class Meta:
        model=State
        fields='__all__'
