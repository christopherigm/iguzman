from rest_framework import serializers

from .models import Education, WorkExperience


class WorkExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkExperience
        fields = [
            'id', 'company', 'title', 'employment_type', 'location',
            'start_date', 'end_date', 'is_current', 'description',
            'created', 'modified',
        ]
        read_only_fields = ['id', 'created', 'modified']

    def validate(self, attrs):
        is_current = attrs.get('is_current', self.instance.is_current if self.instance else False)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)
        if not is_current and not end_date:
            raise serializers.ValidationError(
                {'end_date': 'Required when the position is not current.'}
            )
        if is_current:
            attrs['end_date'] = None
        return attrs


class EducationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Education
        fields = [
            'id', 'institution', 'degree', 'field_of_study',
            'start_year', 'end_year', 'is_current', 'gpa', 'honors',
            'description', 'created', 'modified',
        ]
        read_only_fields = ['id', 'created', 'modified']

    def validate(self, attrs):
        is_current = attrs.get('is_current', self.instance.is_current if self.instance else False)
        end_year = attrs.get('end_year', self.instance.end_year if self.instance else None)
        if not is_current and not end_year:
            raise serializers.ValidationError(
                {'end_year': 'Required when the degree is not in progress.'}
            )
        if is_current:
            attrs['end_year'] = None
        return attrs
