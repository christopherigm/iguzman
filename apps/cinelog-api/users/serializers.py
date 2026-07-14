import uuid

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.serializers import ImageProcessingSerializer
from .models import S3Bucket, UserProfile


def build_username(email: str) -> str:
    """Derive a stable Django username from an email address."""
    if len(email) <= 150:
        return email
    import hashlib
    return email[:100] + hashlib.md5(email.encode()).hexdigest()[:50]


def run_password_validators(password, user, field='password'):
    """
    Run AUTH_PASSWORD_VALIDATORS against `password` and re-raise any failure as a
    DRF field error.

    `user` must be supplied: UserAttributeSimilarityValidator short-circuits when
    it is None, which is exactly what happens when `validate_password` is used as
    a DRF field validator (DRF calls validators with the value alone). Passing the
    user here is what makes that validator actually run.
    """
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({field: list(exc.messages)})


class SignUpSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, required=True)
    password2 = serializers.CharField(write_only=True, required=True, label='Confirm password')

    def validate_email(self, value):
        username = build_username(value)
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        # The account does not exist yet, so hand the validators the unsaved user
        # this signup would create - otherwise the password may equal the email.
        prospective_user = User(
            username=build_username(attrs['email']),
            email=attrs['email'],
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        run_password_validators(attrs['password'], prospective_user)
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
        # The password policy is enforced in PasswordResetConfirmView, which is
        # where the token is exchanged for the user the validators need.
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password2 = serializers.CharField(write_only=True, label='Confirm new password')

    def validate(self, data):
        if data['new_password'] != data['new_password2']:
            raise serializers.ValidationError({'new_password2': 'Passwords do not match.'})
        request = self.context.get('request')
        run_password_validators(
            data['new_password'], getattr(request, 'user', None), field='new_password'
        )
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
        # Identity claims let the Next.js server derive the session straight from
        # the cookie it already holds, so a page renders logged-in on first paint
        # instead of flashing logged-out while the browser fetches the profile.
        # SimpleJWT copies these onto the refreshed access token, and the passkey
        # views mint through this same method, so every token carries them.
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name
        return token


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

    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'profile_picture')

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


# ── S3 bucket serializers ─────────────────────────────────────────────────────

class S3BucketSerializer(serializers.ModelSerializer):
    """
    Read + write representation of a user's S3 bucket credentials.

    The secret access key is write-only: accepted on create/update, encrypted
    before storage, and never echoed back. On update it is optional - omit it to
    keep the stored secret (so a user can rename a bucket without re-entering the
    key), send a new value to rotate it.
    """

    secret_access_key = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = S3Bucket
        fields = [
            'id', 'label', 'endpoint_url', 'region', 'bucket_name',
            'access_key_id', 'secret_access_key', 'created',
        ]
        read_only_fields = ['id', 'created']

    def validate(self, attrs):
        # A secret is mandatory when creating; optional when updating.
        if self.instance is None and not (attrs.get('secret_access_key') or '').strip():
            raise serializers.ValidationError(
                {'secret_access_key': 'This field is required.'}
            )
        return attrs

    def create(self, validated_data):
        secret = validated_data.pop('secret_access_key', '')
        bucket = S3Bucket(user=self.context['request'].user, **validated_data)
        bucket.set_secret_access_key(secret)
        bucket.save()
        return bucket

    def update(self, instance, validated_data):
        secret = validated_data.pop('secret_access_key', '')
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if secret.strip():
            instance.set_secret_access_key(secret)
        instance.save()
        return instance
