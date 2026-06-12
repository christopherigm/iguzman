from rest_framework import serializers

from matrix.models import Skill
from .models import JobApplication


class _TailoredSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ('id', 'name', 'proficiency')


class JobApplicationSerializer(serializers.ModelSerializer):
    company_image_url = serializers.SerializerMethodField()
    tailored_skills = _TailoredSkillSerializer(many=True, read_only=True)

    class Meta:
        model = JobApplication
        fields = (
            'id', 'company_name', 'job_title', 'job_description',
            'status', 'notes', 'job_url', 'company_image', 'company_image_url',
            'company_description',
            'salary_min', 'salary_max', 'salary_currency',
            'work_type', 'location', 'us_citizen_or_pr_required',
            'professional_summary', 'tailored_bullets', 'tailored_work_experiences',
            'tailored_projects', 'tailored_skills',
            'cover_letter', 'nafta_letter',
            'overall_match', 'overall_match_explanation',
            'technical_match', 'technical_match_explanation',
            'nafta_tn_likelihood', 'nafta_tn_likelihood_explanation',
            'company_intel',
            'company_analysis',
            'created', 'modified',
        )
        read_only_fields = (
            'id', 'created', 'modified', 'company_image_url',
            'professional_summary', 'tailored_bullets', 'tailored_work_experiences',
            'tailored_projects', 'tailored_skills',
            'cover_letter', 'nafta_letter',
            'overall_match', 'overall_match_explanation',
            'technical_match', 'technical_match_explanation',
            'nafta_tn_likelihood', 'nafta_tn_likelihood_explanation',
            'company_intel',
            'company_analysis',
        )
        extra_kwargs = {'company_image': {'write_only': True}}

    def validate(self, attrs):
        job_url = attrs.get('job_url', '')
        if job_url:
            user = self.context['request'].user
            qs = JobApplication.objects.filter(user=user, job_url=job_url)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'job_url': ['duplicate']})
        return attrs

    def get_company_image_url(self, obj):
        if not obj.company_image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.company_image.url)
        return obj.company_image.url
