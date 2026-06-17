from rest_framework import serializers

from .models import PROVIDER_CHOICES, JobPosting, JobSearch, UserApiCredential


class JobFeedSerializer(serializers.ModelSerializer):
    """Read serializer for catalog postings.

    ``score``, ``saved_application_id`` and ``is_owner`` are injected by the view
    after ranking / save-state lookup; they are not stored on the model. The
    ``*_match`` LLM metrics are only populated for private (owner-scoped) postings.
    """

    score = serializers.IntegerField(read_only=True, default=0)
    saved_application_id = serializers.IntegerField(read_only=True, allow_null=True, default=None)
    # True when the requesting user owns this (private) posting and may delete it.
    is_owner = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = JobPosting
        fields = (
            'id', 'provider', 'company_name', 'job_title', 'job_description',
            'job_url', 'salary_min', 'salary_max', 'salary_currency',
            'work_type', 'location', 'country', 'category', 'tags',
            'is_private', 'created',
            'score', 'saved_application_id', 'is_owner',
            'search',
            'overall_match', 'overall_match_explanation',
            'technical_match', 'technical_match_explanation',
            'nafta_tn_likelihood', 'nafta_tn_likelihood_explanation',
            'us_citizen_or_pr_required',
        )
        read_only_fields = fields


class JobSearchSerializer(serializers.ModelSerializer):
    # Per-run match-bucket tallies, mirroring the jobs-page buckets: strong (>=85),
    # possible (60-84) and low (citizenship-required, unscored, or <60). Supplied by
    # the view via conditional Count annotations; default to 0 when absent.
    strong = serializers.IntegerField(read_only=True, default=0)
    possible = serializers.IntegerField(read_only=True, default=0)
    low = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = JobSearch
        fields = (
            'id', 'query', 'location', 'status', 'jobs_found', 'metrics_completed',
            'strong', 'possible', 'low', 'created',
        )
        read_only_fields = fields


class SaveJobSerializer(serializers.Serializer):
    """Optional body for POST /api/jobs/<id>/save/."""

    notes = serializers.CharField(required=False, allow_blank=True, default='')


class UserApiCredentialSerializer(serializers.ModelSerializer):
    # Write-only: the plaintext key is encrypted on save and never returned.
    key = serializers.CharField(write_only=True, trim_whitespace=True)
    has_key = serializers.SerializerMethodField()
    # Usage tracking. Adzuna et al. report no quota, so these are counted locally.
    calls_used_today = serializers.IntegerField(read_only=True)
    calls_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = UserApiCredential
        fields = (
            'id', 'provider', 'label', 'is_active', 'key', 'has_key',
            'call_limit', 'calls_used_today', 'calls_remaining', 'usage_date',
            'created', 'modified',
        )
        read_only_fields = (
            'id', 'has_key', 'call_limit', 'calls_used_today', 'calls_remaining',
            'usage_date', 'created', 'modified',
        )

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
