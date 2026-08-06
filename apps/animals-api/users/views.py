from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from django.conf import settings

from core.email import send_branded_email

from .models import EmailVerificationToken, PasswordResetToken
from .serializers import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ResendVerificationSerializer,
    run_password_validators,
)
import json
import logging
import uuid

from django.core.cache import cache
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

from .models import PasskeyCredential
from .serializers import (
    CustomTokenObtainPairSerializer,
    PasskeyAuthenticationOptionsSerializer,
    PasskeyAuthenticationVerifySerializer,
    PasskeyRegistrationVerifySerializer,
)

logger = logging.getLogger(__name__)

WEBAUTHN_CHALLENGE_TTL = 300  # 5 minutes


def _get_rp_id_and_origin():
    return settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_RP_ORIGIN

from core.permissions import IsSiteAdmin

from .serializers import (
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    ProfilePictureSerializer,
    SignUpSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
)

def _send_account_email(user, subject, template, path, expiry_hours):
    """Send one branded account email, reporting success rather than raising.

    The branding, both body parts and the sender come from `core.email`; this
    only supplies what is specific to the recipient. `path` is appended to the
    site's own frontend URL to form the action link.

    Swallowing the failure is deliberate: sign-up and password-reset both
    answer success whether or not the mail went out (sign-up surfaces
    `email_sent`), so an SMTP outage must not lose the account that was just
    created, nor leak by its error whether an address is registered.
    """
    try:
        send_branded_email(
            subject,
            f'users/{template}',
            [user.email],
            {
                'first_name': user.first_name or user.username,
                'action_url': f"{settings.FRONTEND_URL.rstrip('/')}{path}",
                'expiry_hours': expiry_hours,
            },
        )
        return True
    except Exception:
        logger.exception('Failed to send %s to user %s', template, user.pk)
        return False


def _session_tokens(user):
    """The token pair that signs `user` in, returned alongside a verification.

    Redeeming the emailed link proves the recipient controls that address, which
    is at least as strong as the password login it used to send them off to - so
    verifying activates the account *and* opens the session, instead of dropping
    a user who has just proved who they are onto a sign-in form.

    The frontend route handler is the only consumer: it moves these into the
    HTTP-only cookies and strips them from the body, so the browser never sees a
    token (see `verifyEmailRoute` in @repo/auth). Nothing here is reachable
    without a valid, unexpired verification token.
    """
    token = CustomTokenObtainPairSerializer.get_token(user)
    return {'access': str(token.access_token), 'refresh': str(token)}


def _send_verification_email(user, token):
    return _send_account_email(
        user,
        'Verifica tu correo / Verify your email address',
        'verification_email',
        f'/verify-email/{token.token}',
        settings.EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
    )


def _send_password_reset_email(user, token):
    return _send_account_email(
        user,
        'Restablecer contraseña / Reset your password',
        'password_reset_email',
        f'/reset-password/{token.token}',
        settings.PASSWORD_RESET_TOKEN_EXPIRY_HOURS,
    )

class SignUpView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = EmailVerificationToken.objects.create(user=user)
        email_sent = _send_verification_email(user, token)
        return Response(
            {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email_sent': email_sent,
                'detail': 'Account created. Please verify your email to activate your account.',
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserProfileSerializer(request.user, context={'request': request}).data)

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfilePictureView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ProfilePictureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save(user=request.user)
        picture_url = None
        if profile.profile_picture:
            picture_url = request.build_absolute_uri(profile.profile_picture.url)
        return Response({'profile_picture': picture_url})


class ChangePasswordView(APIView):
    """Change the authenticated user's password after verifying their current one."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        # The request is passed so the password validators can compare the new
        # password against the user's own attributes.
        serializer = ChangePasswordSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['current_password']):
            return Response(
                {'current_password': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        return Response({'detail': 'Password changed successfully.'})


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            verification = EmailVerificationToken.objects.get(token=token)
        except EmailVerificationToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

        if verification.is_expired():
            verification.delete()
            return Response({'detail': 'Token has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user = verification.user
        already_verified = user.is_active
        if not already_verified:
            user.is_active = True
            user.save(update_fields=['is_active'])
        verification.delete()
        # The already-verified case gets a session too: the token was still valid
        # and unexpired (checked above), so it proves exactly what the activating
        # click proves. Only the wording differs.
        return Response({
            'detail': (
                'Account already verified. You are now signed in.'
                if already_verified
                else 'Email verified successfully. You are now signed in.'
            ),
            **_session_tokens(user),
        })


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        generic_response = Response(
            {'detail': 'If the email exists and is unverified, a new link has been sent.'}
        )
        if not serializer.is_valid():
            return generic_response

        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email, is_active=False)
            EmailVerificationToken.objects.filter(user=user).delete()
            token = EmailVerificationToken.objects.create(user=user)
            _send_verification_email(user, token)
        except User.DoesNotExist:
            pass
        return generic_response


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        generic_response = Response(
            {'detail': 'If the account exists, a reset link has been sent.'}
        )
        if not serializer.is_valid():
            return generic_response

        user = serializer.get_user()
        PasswordResetToken.objects.filter(user=user).delete()
        token = PasswordResetToken.objects.create(user=user)
        _send_password_reset_email(user, token)
        return generic_response


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token_obj = PasswordResetToken.objects.select_related('user').get(
                token=serializer.validated_data['token']
            )
        except PasswordResetToken.DoesNotExist:
            return Response({'detail': 'Invalid or expired token.'}, status=status.HTTP_400_BAD_REQUEST)

        if token_obj.is_expired():
            token_obj.delete()
            return Response({'detail': 'Token has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        user = token_obj.user
        # Enforced here rather than on the serializer: the password validators
        # need the user, and the token is what identifies them. A failure raises
        # DRF's ValidationError, which the exception handler renders as a 400.
        run_password_validators(
            serializer.validated_data['new_password'], user, field='new_password'
        )

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        token_obj.delete()
        return Response({'detail': 'Password reset successful.'})


# ── Passkey (WebAuthn) views ─────────────────────────────────────────────────


class PasskeyRegistrationOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        rp_id, rp_origin = _get_rp_id_and_origin()

        existing_credentials = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in PasskeyCredential.objects.filter(user=request.user)
        ]

        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=settings.WEBAUTHN_RP_NAME,
            user_name=request.user.email,
            user_id=str(request.user.id).encode(),
            user_display_name=request.user.get_full_name() or request.user.email,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=existing_credentials,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(f'webauthn:reg:{challenge_id}', options.challenge, WEBAUTHN_CHALLENGE_TTL)

        return Response({
            'options': json.loads(options_to_json(options)),
            'challenge_id': challenge_id,
        })


class PasskeyRegistrationVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasskeyRegistrationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        challenge_id = serializer.validated_data['challenge_id']
        challenge = cache.get(f'webauthn:reg:{challenge_id}')
        if challenge is None:
            return Response(
                {'detail': 'Challenge expired or invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f'webauthn:reg:{challenge_id}')

        rp_id, rp_origin = _get_rp_id_and_origin()

        try:
            verification = verify_registration_response(
                credential=serializer.validated_data['credential'],
                expected_challenge=challenge,
                expected_rp_id=rp_id,
                expected_origin=rp_origin,
            )
        except Exception as e:
            return Response(
                {'detail': f'Registration verification failed: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credential = PasskeyCredential.objects.create(
            user=request.user,
            credential_id=bytes_to_base64url(verification.credential_id),
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
            name=serializer.validated_data.get('name', 'My passkey'),
        )

        return Response(
            {'id': credential.id, 'name': credential.name},
            status=status.HTTP_201_CREATED,
        )


class PasskeyAuthenticationOptionsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasskeyAuthenticationOptionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        rp_id, rp_origin = _get_rp_id_and_origin()

        allow_credentials = []
        try:
            from .serializers import build_username
            user = User.objects.get(username=build_username(email), is_active=True)
            allow_credentials = [
                PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
                for c in PasskeyCredential.objects.filter(user=user)
            ]
        except User.DoesNotExist:
            pass

        options = generate_authentication_options(
            rp_id=rp_id,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        challenge_id = uuid.uuid4().hex
        cache.set(f'webauthn:auth:{challenge_id}', options.challenge, WEBAUTHN_CHALLENGE_TTL)

        return Response({
            'options': json.loads(options_to_json(options)),
            'challenge_id': challenge_id,
        })


class PasskeyAuthenticationVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasskeyAuthenticationVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        challenge_id = serializer.validated_data['challenge_id']

        challenge = cache.get(f'webauthn:auth:{challenge_id}')
        if challenge is None:
            return Response(
                {'detail': 'Challenge expired or invalid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f'webauthn:auth:{challenge_id}')

        rp_id, rp_origin = _get_rp_id_and_origin()

        from .serializers import build_username
        try:
            user = User.objects.get(username=build_username(email), is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        credential_data = serializer.validated_data['credential']
        credential_id_b64 = credential_data.get('id', '')

        try:
            stored = PasskeyCredential.objects.get(credential_id=credential_id_b64, user=user)
        except PasskeyCredential.DoesNotExist:
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

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
            return Response({'detail': 'Authentication failed.'}, status=status.HTTP_401_UNAUTHORIZED)

        stored.sign_count = verification.new_sign_count
        stored.save(update_fields=['sign_count'])

        token = CustomTokenObtainPairSerializer.get_token(user)
        return Response({
            'access': str(token.access_token),
            'refresh': str(token),
        })


class PasskeyCredentialListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        creds = PasskeyCredential.objects.filter(user=request.user).order_by('-created_at')
        return Response({
            'count': creds.count(),
            'credentials': [
                {'id': c.id, 'name': c.name, 'created_at': c.created_at}
                for c in creds
            ],
        })


class PasskeyCredentialDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            cred = PasskeyCredential.objects.get(pk=pk, user=request.user)
        except PasskeyCredential.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        cred.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TokenReissueView(APIView):
    """Mint a fresh token pair for the already-authenticated user.

    The frontend renders identity - the display name, and whether the Admin link
    appears - straight from the access token's claims, and SimpleJWT copies those
    from the **refresh** token, so they are frozen for its whole 7-day life.
    Without this, an account granted `is_admin` would not see the CMS until it
    expired, and a renamed user would keep the old name in the navbar.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = CustomTokenObtainPairSerializer.get_token(request.user)
        return Response({'access': str(token.access_token), 'refresh': str(token)})


# ── CMS user management ───────────────────────────────────────────────────────

class AdminUserListView(APIView):
    """GET /api/auth/admin/users/ - every account on this site.

    Single-tenant, so there is no system to scope by: an administrator sees the
    whole user table. See `AdminUserSerializer` for how narrow that view is.
    """

    permission_classes = [IsSiteAdmin]

    def get(self, request):
        qs = User.objects.select_related('profile').order_by('email')
        return Response(AdminUserSerializer(qs, many=True, context={'request': request}).data)


class AdminUserDetailView(APIView):
    """GET/PATCH one account: read it, or toggle its `is_admin` / `is_active`."""

    permission_classes = [IsSiteAdmin]

    def _get(self, pk):
        return User.objects.select_related('profile').filter(pk=pk).first()

    def get(self, request, pk):
        user = self._get(pk)
        if user is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminUserSerializer(user, context={'request': request}).data)

    def patch(self, request, pk):
        user = self._get(pk)
        if user is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Locking yourself out is one click away otherwise, and there is no
        # second administrator to undo it from the CMS - only Django.
        if user.pk == request.user.pk and request.data.get('is_admin') is False:
            return Response(
                {'detail': 'You cannot remove your own administrator access.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AdminUserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        user.refresh_from_db()
        return Response(AdminUserSerializer(user, context={'request': request}).data)
