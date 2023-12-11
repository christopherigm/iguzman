from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from common.models import Country

# Create your serializers here.

class CountrySerializer(HyperlinkedModelSerializer):
    class Meta:
        model = Country
        fields = '__all__'
