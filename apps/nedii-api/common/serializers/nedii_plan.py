from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from common.models import NediiPlan

# Create your serializers here.

class NediiPlanSerializer(HyperlinkedModelSerializer):

    class Meta:
        model=NediiPlan
        fields='__all__'
