from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import EmailVerificationToken
from .serializers import (
    CustomTokenObtainPairSerializer,
    ProfilePictureSerializer,
    ResendVerificationSerializer,
    SignUpSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
)


def _send_verification_email(user, token_obj):
    expiry_hours = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS', 24)
    verification_url = f"{settings.FRONTEND_URL}/verify-email/{token_obj.token}"
    body = render_to_string('users/verification_email.txt', {
        'first_name': user.first_name or user.username,
        'verification_url': verification_url,
        'expiry_hours': expiry_hours,
    })
    send_mail('Verify your email address', body, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)


class SignUpView(generics.CreateAPIView):
    """Register a new user (inactive) and send a verification email."""

    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = SignUpSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            token_obj = EmailVerificationToken.objects.create(user=user)
        email_sent = True
        try:
            _send_verification_email(user, token_obj)
        except Exception:
            email_sent = False
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email_sent": email_sent,
                "detail": "Account created. Please verify your email to activate your account.",
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(APIView):
    """Activate a user account by consuming a verification token."""

    permission_classes = (AllowAny,)

    def get(self, request, token):
        try:
            token_obj = EmailVerificationToken.objects.select_related("user").get(token=token)
        except EmailVerificationToken.DoesNotExist:
            return Response({"detail": "Invalid link."}, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.is_expired():
            token_obj.delete()
            return Response({"detail": "Link expired. Please request a new verification email."}, status=status.HTTP_400_BAD_REQUEST)

        user = token_obj.user
        if user.is_active:
            token_obj.delete()
            return Response({"detail": "Account is already verified."}, status=status.HTTP_200_OK)

        user.is_active = True
        user.save(update_fields=["is_active"])
        token_obj.delete()
        return Response({"detail": "Email verified successfully. You can now log in."}, status=status.HTTP_200_OK)


class ResendVerificationView(APIView):
    """Resend a verification email to an unverified account."""

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        generic_response = Response(
            {"detail": "If an unverified account with that email exists, a new verification email has been sent."},
            status=status.HTTP_200_OK,
        )
        if not serializer.is_valid():
            errors = serializer.errors.get("email", [])
            if any("__not_found__" in str(e) for e in errors):
                return generic_response
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.get_user()
        EmailVerificationToken.objects.filter(user=user).delete()
        token_obj = EmailVerificationToken.objects.create(user=user)
        try:
            _send_verification_email(user, token_obj)
        except Exception:
            pass
        return generic_response


class LoginView(TokenObtainPairView):
    """Obtain JWT access and refresh tokens by providing username and password."""

    permission_classes = (AllowAny,)
    serializer_class = CustomTokenObtainPairSerializer


class ProfileView(APIView):
    """Return the authenticated user's profile data."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = UserProfileSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def put(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            UserProfileSerializer(request.user, context={"request": request}).data
        )

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfilePictureView(APIView):
    """Upload a base64-encoded image to use as the authenticated user's profile picture."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = ProfilePictureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save(user=request.user)
        picture_url = None
        if profile.profile_picture:
            picture_url = request.build_absolute_uri(profile.profile_picture.url)
        return Response({"profile_picture": picture_url}, status=status.HTTP_200_OK)
