from rest_framework import serializers

from .models import PROVIDER_CHOICES, JobPosting, UserApiCredential


class JobFeedSerializer(serializers.ModelSerializer):
    """Read serializer for catalog postings.

    ``score`` and ``saved_application_id`` are injected by the view after
    ranking / save-state lookup; they are not stored on the model.
    """

    score = serializers.IntegerField(read_only=True, default=0)
    saved_application_id = serializers.IntegerField(read_only=True, allow_null=True, default=None)

    class Meta:
        model = JobPosting
        fields = (
            'id', 'provider', 'company_name', 'job_title', 'job_description',
            'job_url', 'salary_min', 'salary_max', 'salary_currency',
            'work_type', 'location', 'country', 'category', 'tags',
            'is_private', 'created',
            'score', 'saved_application_id',
        )
        read_only_fields = fields


class SaveJobSerializer(serializers.Serializer):
    """Optional body for POST /api/jobs/<id>/save/."""

    notes = serializers.CharField(required=False, allow_blank=True, default='')


class UserApiCredentialSerializer(serializers.ModelSerializer):
    # Write-only: the plaintext key is encrypted on save and never returned.
    key = serializers.CharField(write_only=True, trim_whitespace=True)
    has_key = serializers.SerializerMethodField()

    class Meta:
        model = UserApiCredential
        fields = ('id', 'provider', 'label', 'is_active', 'key', 'has_key', 'created', 'modified')
        read_only_fields = ('id', 'has_key', 'created', 'modified')

    def get_has_key(self, obj) -> bool:
        return bool(obj.encrypted_key)

    def validate_provider(self, value):
        valid = {choice[0] for choice in PROVIDER_CHOICES}
        if value not in valid:
            raise serializers.ValidationError('Unsupported provider.')
        return value

    def create(self, validated_data):
        key = validated_data.pop('key')
        credential = UserApiCredential(**validated_data)
        credential.user = self.context['request'].user
        credential.set_key(key)
        credential.save()
        return credential

    def update(self, instance, validated_data):
        key = validated_data.pop('key', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if key:
            instance.set_key(key)
        instance.save()
        return instance
