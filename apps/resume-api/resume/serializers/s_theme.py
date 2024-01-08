from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from resume.models import Theme

class ThemeSerializer(HyperlinkedModelSerializer):
    
    class Meta:
        model = Theme
        fields = "__all__"
