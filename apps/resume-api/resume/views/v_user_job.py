from resume.models import UserJob
from resume.serializers import UserJobSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class UserJobViewSet(ReadOnlyModelViewSet):
    queryset=UserJob.objects.all()
    serializer_class=UserJobSerializer
    filterset_fields={
        'user': ('exact',),
        "user__username": ("exact",),
        'company': ('exact',),
        'city': ('exact',),
    }
    ordering=["id"]
