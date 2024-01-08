from resume.models import UserSkill
from resume.serializers import UserSkillSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet


class UserSkillViewSet(ReadOnlyModelViewSet):
    queryset=UserSkill.objects.all()
    serializer_class=UserSkillSerializer
    filterset_fields={
        'user': ('exact',),
        "user__username": ("exact",),
        'skill': ('exact',)
    }
    ordering=["id"]
