from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.serializers import ImageProcessingSerializer


class SignUpSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True, label="Confirm password")

    class Meta:
        model = User
        fields = ("username", "email", "password", "password2", "first_name", "last_name")
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
            "email": {"required": True},
        }

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2")
        user = User.objects.create_user(**validated_data)
        user.is_active = False
        user.save(update_fields=["is_active"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            self._user = User.objects.get(email=value, is_active=True)
        except User.DoesNotExist:
            self._user = None
        return value

    def get_user(self):
        return self._user


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password2 = serializers.CharField(write_only=True, label="Confirm new password")

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password": "Passwords do not match."})
        return attrs


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("__not_found__")
        if user.is_active:
            raise serializers.ValidationError("This account is already verified.")
        self._user = user
        return value

    def get_user(self):
        return self._user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        token["username"] = user.username
        token["email"] = user.email
        return token


class ProfilePictureSerializer(ImageProcessingSerializer):
    """Accepts a base64-encoded image, resizes it to max 512x512 at 90% JPEG quality."""

    def save(self, user):
        profile = user.profile
        self.save_to_field(profile.profile_picture, f"profile_{user.id}.jpg")
        profile.save(update_fields=["profile_picture"])
        return profile


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Writable serializer for updating username, email, first_name, and last_name."""

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name")
        extra_kwargs = {
            "username": {"required": False},
            "email": {"required": False},
        }

    def validate_username(self, value):
        qs = User.objects.exclude(pk=self.instance.pk).filter(username=value)
        if qs.exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        qs = User.objects.exclude(pk=self.instance.pk).filter(email=value)
        if qs.exists():
            raise serializers.ValidationError("This email is already in use.")
        return value


class UserProfileSerializer(serializers.ModelSerializer):
    """Read-only serializer that returns user data plus the profile picture URL."""

    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "profile_picture")

    def get_profile_picture(self, obj):
        request = self.context.get("request")
        try:
            picture = obj.profile.profile_picture
            if picture and request:
                return request.build_absolute_uri(picture.url)
            if picture:
                return picture.url
        except Exception:
            pass
        return None
