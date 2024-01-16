from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from resume.models import Company

class CompanySerializer(HyperlinkedModelSerializer):
    
    class Meta:
        model = Company
        fields = "__all__"
