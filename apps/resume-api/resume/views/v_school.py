from resume.models import School
from resume.serializers import SchoolSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class SchoolViewSet(ReadOnlyModelViewSet):
    queryset=School.objects.all()
    serializer_class=SchoolSerializer
    ordering=["id"]
