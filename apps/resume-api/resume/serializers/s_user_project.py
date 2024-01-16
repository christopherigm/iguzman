from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from resume.models import UserProject, Company, Skill
# from django.contrib.auth.models import User
from users.models import User

class UserProjectSerializer(HyperlinkedModelSerializer):
    user=ResourceRelatedField(
        queryset=User.objects
    )
    company=ResourceRelatedField(
        queryset=Company.objects
    )
    project_skills=ResourceRelatedField(
        queryset=Skill.objects,
        many=True
    )

    included_serializers = {
        "user": "users.serializers.UserSerializer",
        "company": "resume.serializers.CompanySerializer",
        "project_skills": "resume.serializers.SkillSerializer"
    }
    
    class Meta:
        model = UserProject
        fields = "__all__"
