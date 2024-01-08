from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from resume.models import School

class SchoolSerializer(HyperlinkedModelSerializer):
    
    class Meta:
        model = School
        fields = "__all__"
