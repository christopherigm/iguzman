from rest_framework import serializers

from .models import JobApplication


class JobApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobApplication
        fields = (
            'id', 'company_name', 'job_title', 'job_description',
            'status', 'notes', 'created', 'modified',
        )
        read_only_fields = ('id', 'created', 'modified')
