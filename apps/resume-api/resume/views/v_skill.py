from resume.models import Skill, SkillCategory
from resume.serializers import SkillSerializer, SkillCategorySerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class SkillViewSet(ReadOnlyModelViewSet):
    queryset=Skill.objects.all()
    serializer_class=SkillSerializer
    ordering=["id"]

class SkillCategoryViewSet(ReadOnlyModelViewSet):
    queryset=SkillCategory.objects.all()
    serializer_class=SkillCategorySerializer
    ordering=["id"]
