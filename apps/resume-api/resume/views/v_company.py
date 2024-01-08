from resume.models import Company
from resume.serializers import CompanySerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class CompanyViewSet(ReadOnlyModelViewSet):
    queryset=Company.objects.all()
    serializer_class=CompanySerializer
    ordering=["id"]
