from resume.models import UserProject
from resume.serializers import UserProjectSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class UserProjectViewSet(ReadOnlyModelViewSet):
    queryset=UserProject.objects.all()
    serializer_class=UserProjectSerializer
    filterset_fields={
        'user': ('exact',),
        "user__username": ("exact",),
        'company': ('exact',)
    }
    ordering=["id"]
