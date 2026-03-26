from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.models import System
from core.serializers import ImageProcessingSerializer


def _get_system(system_id):
    try:
        return System.objects.get(pk=system_id, enabled=True)
    except System.DoesNotExist:
        return None


def build_username(system_id, email):
    # NOTE: Django's username field is max_length=150. Combined length of
    # system_id + '_' + email must not exceed 150 characters.
    return f"{system_id}_{email}"


class SignUpSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True, label="Confirm password")
    system_id = serializers.IntegerField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ("system_id", "email", "password", "password2", "first_name", "last_name")
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
            "email": {"required": True},
        }

    def validate_system_id(self, value):
        system = _get_system(value)
        if system is None:
            raise serializers.ValidationError("Invalid or disabled system.")
        self._system = system
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        system_id = attrs.get("system_id")
        email = attrs.get("email")
        if system_id and email:
            username = build_username(system_id, email)
            if len(username) > 150:
                raise serializers.ValidationError(
                    {"email": "Email address is too long for this system."}
                )
            if User.objects.filter(username=username).exists():
                raise serializers.ValidationError(
                    {"email": "A user with this email already exists for this system."}
                )
            attrs["username"] = username
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2")
        validated_data.pop("system_id")
        system = self._system
        user = User.objects.create_user(**validated_data)
        user.is_active = False
        user.save(update_fields=["is_active"])
        user.profile.system = system
        user.profile.save(update_fields=["system"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    system_id = serializers.IntegerField()

    def validate_system_id(self, value):
        if not System.objects.filter(pk=value, enabled=True).exists():
            raise serializers.ValidationError("Invalid or disabled system.")
        return value

    def validate(self, attrs):
        system_id = attrs.get("system_id")
        email = attrs.get("email")
        self._user = None
        if system_id and email:
            username = build_username(system_id, email)
            try:
                self._user = User.objects.get(username=username, is_active=True)
            except User.DoesNotExist:
                self._user = None
        return attrs

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
    system_id = serializers.IntegerField()

    def validate_system_id(self, value):
        if not System.objects.filter(pk=value, enabled=True).exists():
            raise serializers.ValidationError("Invalid or disabled system.")
        return value

    def validate(self, attrs):
        system_id = attrs.get("system_id")
        email = attrs.get("email")
        if system_id and email:
            username = build_username(system_id, email)
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                raise serializers.ValidationError({"email": "__not_found__"})
            if user.is_active:
                raise serializers.ValidationError({"email": "This account is already verified."})
            self._user = user
        return attrs

    def get_user(self):
        return self._user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop("username", None)
        self.fields["email"] = serializers.EmailField(required=True)
        self.fields["system_id"] = serializers.IntegerField(required=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["username"] = user.username
        token["email"] = user.email
        try:
            token["is_admin"] = user.profile.is_admin
        except Exception:
            token["is_admin"] = False
        try:
            token["system_id"] = user.profile.system_id
        except Exception:
            token["system_id"] = None
        return token

    def validate(self, attrs):
        system_id = attrs.pop("system_id")
        email = attrs.pop("email")
        attrs["username"] = build_username(system_id, email)
        return super().validate(attrs)


class ProfilePictureSerializer(ImageProcessingSerializer):
    """Accepts a base64-encoded image, resizes it to max 512x512 at 90% JPEG quality."""

    def save(self, user):
        profile = user.profile
        self.save_to_field(profile.profile_picture, f"profile_{user.id}.jpg")
        profile.save(update_fields=["profile_picture"])
        return profile


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Writable serializer for updating email, first_name, and last_name.
    Username is system-managed ({system_id}_{email}) and updated automatically on email change.
    """

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name")
        extra_kwargs = {
            "email": {"required": False},
        }

    def validate_email(self, value):
        user = self.instance
        try:
            system = user.profile.system
        except Exception:
            system = None

        if system is not None:
            new_username = build_username(system.id, value)
        else:
            new_username = value

        if len(new_username) > 150:
            raise serializers.ValidationError("Email address is too long for this system.")
        if User.objects.exclude(pk=user.pk).filter(username=new_username).exists():
            raise serializers.ValidationError("This email is already in use for this system.")
        self._new_username = new_username
        return value

    def update(self, instance, validated_data):
        if "email" in validated_data:
            instance.username = self._new_username
        return super().update(instance, validated_data)


class AdminUserSerializer(serializers.ModelSerializer):
    """Read-only serializer for admin user management."""

    profile_picture = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    system_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "is_active", "date_joined", "profile_picture", "is_admin", "system_id")

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

    def get_is_admin(self, obj):
        try:
            return obj.profile.is_admin
        except Exception:
            return False

    def get_system_id(self, obj):
        try:
            return obj.profile.system_id
        except Exception:
            return None


class AdminUserUpdateSerializer(serializers.Serializer):
    """Writable serializer for toggling is_admin and is_active."""

    is_admin = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def save(self, user):
        if "is_active" in self.validated_data:
            user.is_active = self.validated_data["is_active"]
            user.save(update_fields=["is_active"])
        if "is_admin" in self.validated_data:
            try:
                user.profile.is_admin = self.validated_data["is_admin"]
                user.profile.save(update_fields=["is_admin"])
            except Exception:
                pass
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Read-only serializer that returns user data plus the profile picture URL."""

    profile_picture = serializers.SerializerMethodField()
    system_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "profile_picture", "system_id")

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

    def get_system_id(self, obj):
        try:
            return obj.profile.system_id
        except Exception:
            return None
