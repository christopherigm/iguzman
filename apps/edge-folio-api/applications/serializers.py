from rest_framework import serializers

from .models import JobApplication


class JobApplicationSerializer(serializers.ModelSerializer):
    company_image_url = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = (
            'id', 'company_name', 'job_title', 'job_description',
            'status', 'notes', 'job_url', 'company_image', 'company_image_url',
            'tailored_bullets', 'cover_letter',
            'created', 'modified',
        )
        read_only_fields = ('id', 'created', 'modified', 'company_image_url', 'tailored_bullets', 'cover_letter')
        extra_kwargs = {'company_image': {'write_only': True}}

    def get_company_image_url(self, obj):
        if not obj.company_image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.company_image.url)
        return obj.company_image.url
