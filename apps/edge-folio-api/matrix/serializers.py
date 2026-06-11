from rest_framework import serializers

from career.models import WorkExperience

from .models import BulletPoint, Skill


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ('id', 'name', 'proficiency', 'created', 'modified')
        read_only_fields = ('id', 'created', 'modified')

    def validate_name(self, value):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            qs = Skill.objects.filter(user=request.user, name__iexact=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('A skill with this name already exists.')
        return value

    def validate_proficiency(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError('Proficiency must be between 1 and 5.')
        return value


class BulletPointReadSerializer(serializers.ModelSerializer):
    skills = SkillSerializer(many=True, read_only=True)

    class Meta:
        model = BulletPoint
        fields = (
            'id', 'text', 'category', 'source', 'is_approved',
            'order', 'skills', 'work_experience_id', 'created', 'modified',
        )
        read_only_fields = ('id', 'created', 'modified')


class BulletPointWriteSerializer(serializers.ModelSerializer):
    skill_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Skill.objects.none(),
        required=False,
        write_only=True,
    )
    work_experience = serializers.PrimaryKeyRelatedField(
        queryset=WorkExperience.objects.none(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = BulletPoint
        fields = ('text', 'category', 'source', 'is_approved', 'order', 'skill_ids', 'work_experience')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            self.fields['skill_ids'].child_relation.queryset = Skill.objects.filter(
                user=request.user
            )
            self.fields['work_experience'].queryset = WorkExperience.objects.filter(
                user=request.user
            )

    def create(self, validated_data):
        skill_ids = validated_data.pop('skill_ids', [])
        bullet = BulletPoint.objects.create(**validated_data)
        if skill_ids:
            bullet.skills.set(skill_ids)
        return bullet

    def update(self, instance, validated_data):
        skill_ids = validated_data.pop('skill_ids', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if skill_ids is not None:
            instance.skills.set(skill_ids)
        return instance
