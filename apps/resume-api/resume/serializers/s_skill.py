from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from resume.models import Skill, SkillCategory

class SkillSerializer(HyperlinkedModelSerializer):
    category=ResourceRelatedField(
        queryset=SkillCategory.objects
    )

    included_serializers = {
        "category": "resume.serializers.SkillCategorySerializer"
    }
    
    class Meta:
        model = Skill
        fields = "__all__"


class SkillCategorySerializer(HyperlinkedModelSerializer):
    
    class Meta:
        model = SkillCategory
        fields = "__all__"
