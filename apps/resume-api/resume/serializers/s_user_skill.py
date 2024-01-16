from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from resume.models import UserSkill, Skill
# from django.contrib.auth.models import User
from users.models import User

class UserSkillSerializer(HyperlinkedModelSerializer):
    user=ResourceRelatedField(
        queryset=User.objects
    )
    skill=ResourceRelatedField(
        queryset=Skill.objects
    )

    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "skill": "resume.serializers.SkillSerializer"
    }
    
    class Meta:
        model = UserSkill
        fields = "__all__"
