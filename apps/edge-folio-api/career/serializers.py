from rest_framework import serializers

from .models import Education, Language, Project, TechStack, WorkExperience


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


class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Language
        fields = ['id', 'name', 'proficiency', 'order', 'created', 'modified']
        read_only_fields = ['id', 'created', 'modified']


class TechStackSerializer(serializers.ModelSerializer):
    class Meta:
        model = TechStack
        fields = ['id', 'name']


class ProjectSerializer(serializers.ModelSerializer):
    tech_stack = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=TechStack.objects.all(),
        required=False,
    )

    class Meta:
        model = Project
        fields = ['id', 'name', 'url', 'description', 'order', 'tech_stack', 'created', 'modified']
        read_only_fields = ['id', 'created', 'modified']

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        rep['tech_stack'] = TechStackSerializer(instance.tech_stack.all(), many=True).data
        return rep

    def create(self, validated_data):
        tech_stack = validated_data.pop('tech_stack', [])
        project = super().create(validated_data)
        project.tech_stack.set(tech_stack)
        return project

    def update(self, instance, validated_data):
        tech_stack = validated_data.pop('tech_stack', None)
        project = super().update(instance, validated_data)
        if tech_stack is not None:
            project.tech_stack.set(tech_stack)
        return project
