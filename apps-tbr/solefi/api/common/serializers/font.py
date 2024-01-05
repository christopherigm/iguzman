from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from common.models import Font

# Create your serializers here.

class FontSerializer(HyperlinkedModelSerializer):
    class Meta:
        model = Font
        fields = '__all__'
