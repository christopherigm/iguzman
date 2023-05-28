from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from common.models import (
    State,
    City
)

# Create your serializers here.

class CitySerializer(HyperlinkedModelSerializer):
    state=ResourceRelatedField (
        queryset=State.objects   
    )
    included_serializers={
        'state': 'common.serializers.StateSerializer'
    }
    class Meta:
        model=City
        fields='__all__'
