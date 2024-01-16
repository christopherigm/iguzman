from resume.models import UserSchool
from resume.serializers import UserSchoolSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class UserSchoolViewSet(ReadOnlyModelViewSet):
    queryset=UserSchool.objects.all()
    serializer_class=UserSchoolSerializer
    filterset_fields={
        'user': ('exact',),
        "user__username": ("exact",),
        'school': ('exact',),
        'city': ('exact',),
    }
    ordering=["id"]
