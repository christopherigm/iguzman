import base64
from io import BytesIO

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.files.base import ContentFile
from PIL import Image
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


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
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        token["username"] = user.username
        token["email"] = user.email
        return token


class ProfilePictureSerializer(serializers.Serializer):
    """Accepts a base64-encoded image, resizes it to max 512x512 at 90% JPEG quality."""

    base64_image = serializers.CharField(write_only=True)

    def validate_base64_image(self, value):
        # Strip optional data URI header, e.g. "data:image/png;base64,..."
        if "," in value:
            value = value.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(value)
        except Exception:
            raise serializers.ValidationError("Invalid base64 encoding.")
        try:
            img = Image.open(BytesIO(image_bytes))
            img.verify()  # Checks the file is a valid image
        except Exception:
            raise serializers.ValidationError("The provided file is not a valid image.")
        return value

    def save(self, user):
        raw = self.validated_data["base64_image"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        image_bytes = base64.b64decode(raw)

        img = Image.open(BytesIO(image_bytes))
        # Convert palette/transparency modes to RGB for JPEG output
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Resize while preserving aspect ratio — will not enlarge the image
        img.thumbnail((512, 512), Image.Resampling.LANCZOS)

        output = BytesIO()
        img.save(output, format="JPEG", quality=90, optimize=True)
        output.seek(0)

        profile = user.profile
        profile.profile_picture.save(
            f"profile_{user.id}.jpg",
            ContentFile(output.read()),
            save=True,
        )
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
