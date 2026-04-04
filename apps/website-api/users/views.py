import json
import uuid

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from core.models import System
from core.permissions import IsSystemAdmin
from .models import EmailVerificationToken, PasskeyCredential, PasswordResetToken
from .serializers import (
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    CustomTokenObtainPairSerializer,
    PasskeyAuthenticationOptionsSerializer,
    PasskeyAuthenticationVerifySerializer,
    PasskeyRegistrationVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfilePictureSerializer,
    ResendVerificationSerializer,
    SignUpSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    build_username,
)

WEBAUTHN_CHALLENGE_TTL = 300  # 5 minutes


def _get_rp_id_and_origin(system):
    rp_id = system.host
    rp_origin = f"https://{rp_id}"
    return rp_id, rp_origin


def _send_password_reset_email(user, token_obj):
    expiry_hours = getattr(settings, 'PASSWORD_RESET_TOKEN_EXPIRY_HOURS', 1)
    reset_url = f"{settings.FRONTEND_URL}/reset-password/{token_obj.token}"
    body = render_to_string('users/password_reset_email.txt', {
        'first_name': user.first_name or user.username,
        'reset_url': reset_url,
        'expiry_hours': expiry_hours,
    })
    send_mail('Reset your password', body, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)


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
            errors_str = str(serializer.errors)
            if "__not_found__" in errors_str:
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


class PasswordResetRequestView(APIView):
    """Send a password-reset email. Always returns a generic response to avoid user enumeration."""

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        generic_response = Response(
            {"detail": "If an account with that email exists, a password reset link has been sent."},
            status=status.HTTP_200_OK,
        )
        user = serializer.get_user()
        if user is None:
            return generic_response
        PasswordResetToken.objects.filter(user=user).delete()
        token_obj = PasswordResetToken.objects.create(user=user)
        try:
            _send_password_reset_email(user, token_obj)
        except Exception:
            pass
        return generic_response


class PasswordResetConfirmView(APIView):
    """Consume a password-reset token and set the user's new password."""

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token_obj = PasswordResetToken.objects.select_related("user").get(
                token=serializer.validated_data["token"]
            )
        except PasswordResetToken.DoesNotExist:
            return Response({"detail": "Invalid or expired token."}, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.is_expired():
            token_obj.delete()
            return Response({"detail": "Invalid or expired token."}, status=status.HTTP_400_BAD_REQUEST)

        user = token_obj.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        token_obj.delete()
        return Response({"detail": "Password has been reset successfully."}, status=status.HTTP_200_OK)


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


class AdminUserListView(APIView):
    """GET /api/auth/admin/users/ — list users belonging to the admin's system."""

    permission_classes = (IsSystemAdmin,)

    def get(self, request):
        try:
            system_id = request.user.profile.system_id
        except Exception:
            system_id = None
        if system_id is None:
            return Response([], status=status.HTTP_200_OK)
        qs = User.objects.filter(profile__system_id=system_id).select_related("profile").order_by("email")
        serializer = AdminUserSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)


class AdminUserDetailView(APIView):
    """PATCH /api/auth/admin/users/<pk>/ — toggle is_admin / is_active for a user in the admin's system."""

    permission_classes = (IsSystemAdmin,)

    def patch(self, request, pk):
        try:
            admin_system_id = request.user.profile.system_id
        except Exception:
            admin_system_id = None
        try:
            user = User.objects.select_related("profile").get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if admin_system_id and user.profile.system_id != admin_system_id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminUserUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user)
        return Response(AdminUserSerializer(user, context={"request": request}).data)


# ── Passkey (WebAuthn) views ─────────────────────────────────────────────────


class PasskeyRegistrationOptionsView(APIView):
    """Generate WebAuthn registration options for the authenticated user."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        try:
            system = user.profile.system
        except Exception:
            return Response(
                {"detail": "User has no system assigned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rp_id, rp_origin = _get_rp_id_and_origin(system)

        existing_credentials = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in PasskeyCredential.objects.filter(user=user, system=system)
        ]

        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=system.site_name,
            user_name=user.email,
            user_id=str(user.id).encode(),
            user_display_name=user.get_full_name() or user.email,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=existing_credentials,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(
            f"webauthn:reg:{challenge_id}",
            options.challenge,
            WEBAUTHN_CHALLENGE_TTL,
        )

        return Response({
            "options": json.loads(options_to_json(options)),
            "challenge_id": challenge_id,
        })


class PasskeyRegistrationVerifyView(APIView):
    """Verify a WebAuthn registration response and store the credential."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = PasskeyRegistrationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        try:
            system = user.profile.system
        except Exception:
            return Response(
                {"detail": "User has no system assigned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge_id = serializer.validated_data["challenge_id"]
        challenge = cache.get(f"webauthn:reg:{challenge_id}")
        if challenge is None:
            return Response(
                {"detail": "Challenge expired or invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f"webauthn:reg:{challenge_id}")

        rp_id, rp_origin = _get_rp_id_and_origin(system)

        try:
            verification = verify_registration_response(
                credential=serializer.validated_data["credential"],
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
            )
        except Exception as e:
            return Response(
                {"detail": f"Registration verification failed: {e}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credential = PasskeyCredential.objects.create(
            user=user,
            system=system,
            credential_id=bytes_to_base64url(verification.credential_id),
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
            name=serializer.validated_data["name"],
        )

        return Response(
            {"id": credential.id, "name": credential.name},
            status=status.HTTP_201_CREATED,
        )


class PasskeyAuthenticationOptionsView(APIView):
    """Generate WebAuthn authentication options (public, no auth required)."""

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = PasskeyAuthenticationOptionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        system_id = serializer.validated_data["system_id"]
        email = serializer.validated_data["email"]

        try:
            system = System.objects.get(pk=system_id, enabled=True)
        except System.DoesNotExist:
            return Response(
                {"detail": "Invalid system."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rp_id, rp_origin = _get_rp_id_and_origin(system)

        username = build_username(system_id, email)
        allow_credentials = []
        try:
            user = User.objects.get(username=username, is_active=True)
            allow_credentials = [
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
                for c in PasskeyCredential.objects.filter(user=user, system=system)
            ]
        except User.DoesNotExist:
            pass

        options = generate_authentication_options(
            rp_id=rp_id,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(
            f"webauthn:auth:{challenge_id}",
            options.challenge,
            WEBAUTHN_CHALLENGE_TTL,
        )

        return Response({
            "options": json.loads(options_to_json(options)),
            "challenge_id": challenge_id,
        })


class PasskeyAuthenticationVerifyView(APIView):
    """Verify a WebAuthn authentication response and return JWT tokens."""

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = PasskeyAuthenticationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        system_id = serializer.validated_data["system_id"]
        email = serializer.validated_data["email"]

        try:
            system = System.objects.get(pk=system_id, enabled=True)
        except System.DoesNotExist:
            return Response(
                {"detail": "Invalid system."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge_id = serializer.validated_data["challenge_id"]
        challenge = cache.get(f"webauthn:auth:{challenge_id}")
        if challenge is None:
            return Response(
                {"detail": "Challenge expired or invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f"webauthn:auth:{challenge_id}")

        rp_id, rp_origin = _get_rp_id_and_origin(system)

        username = build_username(system_id, email)
        try:
            user = User.objects.get(username=username, is_active=True)
        except User.DoesNotExist:
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        credential_data = serializer.validated_data["credential"]
        credential_id_b64 = credential_data.get("id", "")

        try:
            stored = PasskeyCredential.objects.get(
                credential_id=credential_id_b64, system=system, user=user,
            )
        except PasskeyCredential.DoesNotExist:
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            verification = verify_authentication_response(
                credential=credential_data,
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
                credential_public_key=bytes(stored.public_key),
                credential_current_sign_count=stored.sign_count,
            )
        except Exception:
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        stored.sign_count = verification.new_sign_count
        stored.save(update_fields=["sign_count"])

        token = CustomTokenObtainPairSerializer.get_token(user)
        return Response({
            "access": str(token.access_token),
            "refresh": str(token),
        })


class PasskeyCredentialListView(APIView):
    """List the authenticated user's passkey credentials."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            system = request.user.profile.system
        except Exception:
            return Response({"count": 0, "credentials": []})

        creds = PasskeyCredential.objects.filter(
            user=request.user, system=system,
        ).order_by("-created_at")

        return Response({
            "count": creds.count(),
            "credentials": [
                {"id": c.id, "name": c.name, "created_at": c.created_at}
                for c in creds
            ],
        })


class PasskeyCredentialDetailView(APIView):
    """DELETE a single passkey credential belonging to the authenticated user."""

    permission_classes = (IsAuthenticated,)

    def delete(self, request, pk):
        try:
            system = request.user.profile.system
        except Exception:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            cred = PasskeyCredential.objects.get(pk=pk, user=request.user, system=system)
        except PasskeyCredential.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        cred.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
