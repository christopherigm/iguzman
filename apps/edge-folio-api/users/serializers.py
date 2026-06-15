import uuid

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.serializers import ImageProcessingSerializer
from .models import UserProfile


def build_username(email: str) -> str:
    """Derive a stable Django username from an email address."""
    if len(email) <= 150:
        return email
    import hashlib
    return email[:100] + hashlib.md5(email.encode()).hexdigest()[:50]


class SignUpSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True, label='Confirm password')

    def validate_email(self, value):
        username = build_username(value)
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        email = validated_data['email']
        password = validated_data.pop('password')
        username = build_username(email)
        user = User(
            username=username,
            email=email,
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        user.set_password(password)
        user.is_active = False
        user.save()
        UserProfile.objects.get_or_create(user=user)
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop('username', None)
        self.fields['email'] = serializers.EmailField(write_only=True)

    def validate(self, attrs):
        email = attrs.pop('email', '')
        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {'detail': 'No active account found with the given credentials.'}
            )
        attrs['username'] = user.username
        return super().validate(attrs)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        return token


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value, is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError('No active account found with this email.')
        self._user = user
        return value

    def get_user(self):
        return self._user


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True)
    new_password2 = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({'new_password2': 'Passwords do not match.'})
        return data


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value)
            if user.is_active:
                raise serializers.ValidationError('Account is already verified.')
        except User.DoesNotExist:
            raise serializers.ValidationError('No account found with this email.')
        return value


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name')

    def validate_email(self, value):
        user = self.instance
        if User.objects.exclude(pk=user.pk).filter(email=value).exists():
            raise serializers.ValidationError('Email already in use.')
        return value


class UserProfileSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()
    job_title = serializers.SerializerMethodField()
    years_of_experience = serializers.SerializerMethodField()
    preferred_stack = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    github_url = serializers.SerializerMethodField()
    linkedin_url = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()
    tn_profession = serializers.SerializerMethodField()
    citizenship = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'profile_picture',
                  'job_title', 'years_of_experience', 'preferred_stack',
                  'phone', 'location', 'github_url', 'linkedin_url', 'summary',
                  'tn_profession', 'citizenship', 'is_staff')
        read_only_fields = ('is_staff',)

    def get_profile_picture(self, obj):
        try:
            picture = obj.profile.profile_picture
            if not picture:
                return None
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(picture.url)
            return picture.url
        except UserProfile.DoesNotExist:
            return None

    def get_job_title(self, obj):
        try:
            return obj.profile.job_title
        except UserProfile.DoesNotExist:
            return ''

    def get_years_of_experience(self, obj):
        try:
            return obj.profile.years_of_experience
        except UserProfile.DoesNotExist:
            return None

    def get_preferred_stack(self, obj):
        try:
            return [{'id': ts.id, 'name': ts.name} for ts in obj.profile.preferred_stack.all()]
        except UserProfile.DoesNotExist:
            return []

    def get_phone(self, obj):
        try:
            return obj.profile.phone
        except UserProfile.DoesNotExist:
            return ''

    def get_location(self, obj):
        try:
            return obj.profile.location
        except UserProfile.DoesNotExist:
            return ''

    def get_github_url(self, obj):
        try:
            return obj.profile.github_url
        except UserProfile.DoesNotExist:
            return ''

    def get_linkedin_url(self, obj):
        try:
            return obj.profile.linkedin_url
        except UserProfile.DoesNotExist:
            return ''

    def get_summary(self, obj):
        try:
            return obj.profile.summary
        except UserProfile.DoesNotExist:
            return ''

    def get_tn_profession(self, obj):
        try:
            return obj.profile.tn_profession
        except UserProfile.DoesNotExist:
            return ''

    def get_citizenship(self, obj):
        try:
            return obj.profile.citizenship
        except UserProfile.DoesNotExist:
            return ''


class ContactInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('phone', 'location', 'github_url', 'linkedin_url', 'summary', 'tn_profession', 'citizenship')


class JobSearchPrefsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = (
            'job_search_include_title',
            'job_search_extra_text',
            'job_search_bilingual',
            'job_search_include_tn_profession',
            'job_search_include_education',
            'job_search_include_years',
            'job_search_include_stack',
            'job_search_include_location',
        )


class OnboardingSerializer(serializers.ModelSerializer):
    preferred_stack = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        default=list,
    )

    class Meta:
        model = UserProfile
        fields = ('job_title', 'years_of_experience', 'preferred_stack')

    def validate_preferred_stack(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Must be a list of strings.')
        return [str(item).strip() for item in value if str(item).strip()]

    def update(self, instance, validated_data):
        stack_names = validated_data.pop('preferred_stack', None)
        instance = super().update(instance, validated_data)
        if stack_names is not None:
            from career.models import TechStack as TechStackModel
            from matrix.models import Skill
            from django.core.cache import cache
            tech_objs = []
            for name in stack_names:
                obj, _ = TechStackModel.objects.get_or_create(name=name)
                tech_objs.append(obj)
            instance.preferred_stack.set(tech_objs)
            cache.delete('career:tech_stacks')
            cache.delete('career:tech_stacks_popular')
            any_created = False
            for name in stack_names:
                _, created = Skill.objects.get_or_create(
                    user=instance.user,
                    name=name,
                    defaults={'proficiency': 4},
                )
                if created:
                    any_created = True
            if any_created:
                cache.delete(f'matrix:skills:{instance.user_id}')
                cache.delete(f'matrix:bullets:{instance.user_id}')
        return instance


class ProfilePictureSerializer(ImageProcessingSerializer):
    def save(self, user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if profile.profile_picture:
            profile.profile_picture.delete(save=False)
        self.save_to_field(profile.profile_picture, f'{uuid.uuid4().hex}.jpg')
        profile.save(update_fields=['profile_picture'])
        return profile


# ── Passkey serializers ───────────────────────────────────────────────────────

class PasskeyAuthenticationOptionsSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasskeyAuthenticationVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    credential = serializers.JSONField()
    challenge_id = serializers.CharField()


class PasskeyRegistrationVerifySerializer(serializers.Serializer):
    credential = serializers.JSONField()
    challenge_id = serializers.CharField()
    name = serializers.CharField(max_length=64, default='My passkey', required=False)


class ResumeUploadSerializer(serializers.Serializer):
    resume = serializers.FileField()

    def validate_resume(self, value):
        content_type = getattr(value, 'content_type', '')
        name = getattr(value, 'name', '')
        if not (content_type == 'application/pdf' or name.lower().endswith('.pdf')):
            raise serializers.ValidationError('Only PDF files are accepted.')
        if value.size > 10 * 1024 * 1024:
            raise serializers.ValidationError('File size must not exceed 10 MB.')
        return value
