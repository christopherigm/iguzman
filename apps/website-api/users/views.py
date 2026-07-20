import json
import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import models, transaction
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

from catalog.models import (
    Product, ProductVariant, Service, ServiceVariant, MenuItem, normalize_selection,
)
from core.models import System
from core.permissions import IsSystemAdmin
from core.tenancy import host_system, profile_system, user_system
from orders.claims import claim_guest_orders
from .guest import (
    cart_payload,
    resolve_guest_cart,
    resolve_guest_favorites,
)
from .cache import (
    CART_CACHE_TTL,
    FAVORITES_CACHE_TTL,
    cart_count_key,
    cart_ids_key,
    cart_key,
    favorites_ids_key,
    favorites_key,
    invalidate_cart,
    invalidate_favorites,
)
from .models import CartItem, EmailVerificationToken, Favorite, PasskeyCredential, PasswordResetToken
from .serializers import (
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    CartItemWriteSerializer,
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    FavoriteSerializer,
    FavoriteWriteSerializer,
    GuestStateSerializer,
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
    run_password_validators,
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
        # Verifying the link is what proves this account holds the address, so it
        # is the moment any guest order Stripe recorded against that address may
        # become theirs. See orders/claims.py.
        claim_guest_orders(user, profile_system(user))
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
        # Enforced here rather than on the serializer: the password validators
        # need the user, and the token is what identifies them. A failure raises
        # DRF's ValidationError, which the exception handler renders as a 400.
        run_password_validators(
            serializer.validated_data["new_password"], user, field="new_password"
        )

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        token_obj.delete()
        return Response({"detail": "Password has been reset successfully."}, status=status.HTTP_200_OK)


class LoginView(TokenObtainPairView):
    """Obtain JWT access and refresh tokens by providing username and password."""

    permission_classes = (AllowAny,)
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        # Also swept here, not only at email verification: an account that
        # already existed can check out as a guest (the browser simply had no
        # session at the time), and that purchase should appear in its history at
        # the next sign-in rather than never. One indexed UPDATE, and a no-op
        # when there is nothing unowned on this address.
        if response.status_code == status.HTTP_200_OK:
            user = getattr(getattr(self, "_serializer", None), "user", None)
            if user is not None:
                claim_guest_orders(user, profile_system(user))

        return response

    def get_serializer(self, *args, **kwargs):
        # Held onto so `post` can reach the authenticated user: the response body
        # is only tokens, and re-decoding one to find out who just logged in
        # would be doing the serializer's work twice.
        self._serializer = super().get_serializer(*args, **kwargs)
        return self._serializer


class TokenReissueView(APIView):
    """
    Mint a fresh token pair for the already-authenticated user.

    The frontend renders identity (display name, admin flag) straight from the
    access token's claims. Those claims are copied from the refresh token, so
    they are frozen for the refresh token's whole 7-day life - editing your
    profile, or being granted admin, would otherwise leave stale values in the
    UI until it expired. Calling this rebuilds both tokens from the live user.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        token = CustomTokenObtainPairSerializer.get_token(request.user)
        return Response({
            "access": str(token.access_token),
            "refresh": str(token),
        })


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


class ChangePasswordView(APIView):
    """Change the authenticated user's password after verifying their current one."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"current_password": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run_password_validators(
            serializer.validated_data["new_password"], user, field="new_password"
        )

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)


class AdminUserListView(APIView):
    """GET /api/auth/admin/users/ - list users belonging to the admin's system."""

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
    """PATCH /api/auth/admin/users/<pk>/ - toggle is_admin / is_active for a user in the admin's system."""

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


# ── Favorites ─────────────────────────────────────────────────────────────────

# The tenant lookup moved to core.tenancy when orders started needing the same
# answer; aliased rather than renamed because this module calls it in a dozen
# places and the leading underscore still says "not part of this app's API".
_user_system = user_system


def _favorites_qs(request, system):
    return (
        Favorite.objects
        .filter(user=request.user, system=system)
        .select_related('product', 'service', 'menu_item')
        .prefetch_related(
            'product__images', 'product__variants',
            'service__images', 'service__variants',
            'menu_item__images', 'menu_item__ingredients', 'menu_item__ingredients__options__ingredient',
        )
    )


class FavoriteListView(APIView):
    """
    GET  /api/auth/favorites/  - the authenticated user's saved items.
    POST /api/auth/favorites/  - save one, body {"kind": "product"|"service"|"menu_item", "id": N}.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        system = _user_system(request)
        cache_key = favorites_key(request.user.id, system.id if system else 0)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        favorites = _favorites_qs(request, system)
        data = FavoriteSerializer(favorites, many=True, context={"request": request}).data
        cache.set(cache_key, data, FAVORITES_CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = FavoriteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data["kind"]
        target_id = serializer.validated_data["id"]

        system = _user_system(request)
        model = {"product": Product, "service": Service, "menu_item": MenuItem}[kind]
        # Scoping the lookup to the user's System is what stops a crafted id from
        # attaching another tenant's item to this account.
        target = model.objects.filter(pk=target_id, system=system, enabled=True).first()
        if target is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        favorite, created = Favorite.objects.get_or_create(
            user=request.user,
            system=system,
            **{kind: target},
        )
        invalidate_favorites(request.user.id, system.id if system else 0)

        return Response(
            FavoriteSerializer(favorite, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class FavoriteDetailView(APIView):
    """DELETE /api/auth/favorites/<kind>/<id>/ - unsave an item.

    Keyed by the catalog item's id rather than the Favorite row's, so the button
    on a product page can unsave without first looking the row up.
    """

    permission_classes = (IsAuthenticated,)

    def delete(self, request, kind, pk):
        if kind not in ("product", "service", "menu_item"):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        system = _user_system(request)
        deleted, _ = Favorite.objects.filter(
            user=request.user, system=system, **{f"{kind}_id": pk},
        ).delete()
        if not deleted:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        invalidate_favorites(request.user.id, system.id if system else 0)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FavoriteIdsView(APIView):
    """GET /api/auth/favorites/ids/ - just the saved ids.

    The detail pages only need to know whether *this* item is saved; serving them
    the full favorites payload to answer a boolean would fetch every saved item's
    images and variants on every product view.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        system = _user_system(request)
        cache_key = favorites_ids_key(request.user.id, system.id if system else 0)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        rows = Favorite.objects.filter(user=request.user, system=system).values_list(
            "product_id", "service_id", "menu_item_id",
        )
        data = {
            "products": [p for p, _, _ in rows if p is not None],
            "services": [s for _, s, _ in rows if s is not None],
            "menu_items": [m for _, _, m in rows if m is not None],
        }
        cache.set(cache_key, data, FAVORITES_CACHE_TTL)
        return Response(data)


# ── Cart ──────────────────────────────────────────────────────────────────────

def _cart_qs(request, system):
    return (
        CartItem.objects
        .filter(user=request.user, system=system)
        .select_related(
            'product', 'service', 'menu_item', 'product_variant', 'service_variant',
        )
        .prefetch_related(
            'product__images', 'product__variants',
            'service__images', 'service__variants',
            'menu_item__images', 'menu_item__ingredients', 'menu_item__ingredients__options__ingredient',
            'product_variant__option_values', 'service_variant__option_values',
        )
    )


def _resolve_target(system, kind, target_id, variant_id):
    """The buyable and variant a write refers to, or (None, None, error).

    Every lookup is scoped to the user's System, which is what stops a crafted id
    from putting another tenant's item in this cart; the variant is then looked
    up *through* its parent, so a variant id belonging to a different product
    cannot be attached to this line. That second check is the one the database
    cannot make for us - a CheckConstraint sees only one row's columns.
    """
    model = {"product": Product, "service": Service, "menu_item": MenuItem}[kind]
    target = model.objects.filter(pk=target_id, system=system, enabled=True).first()
    if target is None:
        return None, None, "Not found."

    # Menu items customise through ingredients, not variants - never a variant.
    if kind == "menu_item" or variant_id is None:
        return target, None, None

    variant_model = ProductVariant if kind == "product" else ServiceVariant
    variant = variant_model.objects.filter(
        pk=variant_id, enabled=True, **{kind: target},
    ).first()
    if variant is None:
        return None, None, "Variant not found for this item."

    return target, variant, None


def _menu_selection(menu_item, customization):
    """A menu line's chosen ingredients, canonicalised for storage & comparison."""
    ingredients = list(
        menu_item.ingredients.filter(enabled=True).prefetch_related('options')
    )
    return normalize_selection(customization or [], ingredients)


def _add_cart_line(user, system, kind, target, variant, quantity):
    """Add a product/service line, or raise the quantity of the one already there.

    Adding what is already in the cart raises the quantity instead of creating a
    second identical line - the uniqueness constraints would reject that row
    anyway. Locked, because two rapid clicks would otherwise both read the old
    quantity and one increment would be lost.

    Shared by the add endpoint and the sign-in merge so a merged guest line
    lands exactly where a clicked one would; the caller invalidates the cache.
    """
    with transaction.atomic():
        item, created = CartItem.objects.select_for_update().get_or_create(
            user=user,
            system=system,
            **{kind: target, f"{kind}_variant": variant},
            defaults={"quantity": quantity},
        )
        if not created:
            item.quantity = min(item.quantity + quantity, 99)
            item.save(update_fields=["quantity", "updated_at"])
    return item, created


def _add_menu_line(user, system, menu_item, selection, quantity):
    """Add a menu line, or raise the quantity of the one with the same selection.

    A database unique constraint cannot express "same selection" over a JSON
    column, so the merge is done here: look for an existing line of this dish
    whose stored selection matches and bump its quantity, otherwise create a new
    line. Locked against the same double-click race `_add_cart_line` guards.
    """
    with transaction.atomic():
        existing = (
            CartItem.objects
            .select_for_update()
            .filter(user=user, system=system, menu_item=menu_item)
        )
        match = next((row for row in existing if row.customization == selection), None)
        if match is not None:
            match.quantity = min(match.quantity + quantity, 99)
            match.save(update_fields=["quantity", "updated_at"])
            return match, False

        return CartItem.objects.create(
            user=user,
            system=system,
            menu_item=menu_item,
            customization=selection,
            quantity=quantity,
        ), True


def _cart_payload(request, system):
    """The whole cart: lines, total quantity, and a subtotal per currency.

    Totals are grouped by currency because `Buyable.currency` is per item, so a
    System can hold a USD product and an MXN one; summing them into a single
    number would be arithmetic on incomparable units. The summary card renders
    one row per group.
    """
    items = list(_cart_qs(request, system))
    data = CartItemSerializer(items, many=True, context={"request": request}).data

    totals = {}
    for item in items:
        currency = item.target.currency
        totals[currency] = totals.get(currency, Decimal("0")) + item.line_total

    return {
        "items": data,
        "count": sum(item.quantity for item in items),
        "totals": [
            {"currency": currency, "subtotal": str(subtotal)}
            for currency, subtotal in sorted(totals.items())
        ],
    }


class CartListView(APIView):
    """
    GET    /api/auth/cart/ - the authenticated user's cart, with totals.
    POST   /api/auth/cart/ - add a line, body
                             {"kind", "id", "variant_id"?, "quantity"?}.
    DELETE /api/auth/cart/ - empty the cart.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        system = _user_system(request)
        cache_key = cart_key(request.user.id, system.id if system else 0)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        data = _cart_payload(request, system)
        cache.set(cache_key, data, CART_CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = CartItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data["kind"]
        target_id = serializer.validated_data["id"]
        variant_id = serializer.validated_data.get("variant_id")
        quantity = serializer.validated_data["quantity"]

        system = _user_system(request)
        target, variant, error = _resolve_target(system, kind, target_id, variant_id)
        if error:
            return Response({"detail": error}, status=status.HTTP_404_NOT_FOUND)

        if kind == "menu_item":
            return self._add_menu_item(request, system, target, serializer.validated_data, quantity)

        item, created = _add_cart_line(request.user, system, kind, target, variant, quantity)
        invalidate_cart(request.user.id, system.id if system else 0)

        return Response(
            CartItemSerializer(item, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def _add_menu_item(self, request, system, menu_item, data, quantity):
        """Add (or increment) a menu line, where the ingredient selection is part
        of the line's identity."""
        selection = _menu_selection(menu_item, data.get("customization", []))
        item, created = _add_menu_line(request.user, system, menu_item, selection, quantity)

        invalidate_cart(request.user.id, system.id if system else 0)
        return Response(
            CartItemSerializer(item, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        system = _user_system(request)
        CartItem.objects.filter(user=request.user, system=system).delete()
        invalidate_cart(request.user.id, system.id if system else 0)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartItemDetailView(APIView):
    """
    PATCH  /api/auth/cart/<id>/ - set a line's quantity, body {"quantity": N}.
    DELETE /api/auth/cart/<id>/ - drop the line.

    Keyed by the CartItem row's id, unlike the favorites detail view: a line is
    identified by item *and* variant, so the catalog id alone cannot name it.
    """

    permission_classes = (IsAuthenticated,)

    def _get_item(self, request, pk):
        # Filtering by user is the authorization check: another user's line id
        # simply does not exist as far as this request is concerned.
        return CartItem.objects.filter(
            pk=pk, user=request.user, system=_user_system(request),
        ).select_related(
            'product', 'service', 'menu_item', 'product_variant', 'service_variant',
        ).prefetch_related(
            'menu_item__ingredients', 'menu_item__ingredients__options__ingredient'
        ).first()

    def patch(self, request, pk):
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item = self._get_item(request, pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        item.quantity = serializer.validated_data["quantity"]
        item.save(update_fields=["quantity", "updated_at"])
        invalidate_cart(request.user.id, item.system_id or 0)

        return Response(CartItemSerializer(item, context={"request": request}).data)

    def delete(self, request, pk):
        item = self._get_item(request, pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        system_id = item.system_id or 0
        item.delete()
        invalidate_cart(request.user.id, system_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartCountView(APIView):
    """GET /api/auth/cart/count/ - total quantity in the cart.

    The navbar renders this on every page. Serving it the full cart payload to
    print one number would fetch every line's images and variants on every
    navigation, which is the same reasoning as FavoriteIdsView.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        system = _user_system(request)
        cache_key = cart_count_key(request.user.id, system.id if system else 0)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        total = CartItem.objects.filter(user=request.user, system=system).aggregate(
            total=models.Sum("quantity"),
        )["total"]
        data = {"count": total or 0}
        cache.set(cache_key, data, CART_CACHE_TTL)
        return Response(data)


class CartIdsView(APIView):
    """GET /api/auth/cart/ids/ - what is in the cart, as bare identifiers.

    The counterpart of FavoriteIdsView for the catalog cards, which only need to
    know whether *this* item is already in the cart; serving them the full cart
    payload to answer that would fetch every line's images and variants on every
    grid render.

    It cannot be a list of catalog ids the way favorites is, for the two reasons
    the cart differs: a line is identified by item *and* variant, so the catalog
    id alone does not name one; and removing a line needs the CartItem row's own
    id. Each entry therefore carries the triple the card matches on plus the
    `line_id` it would delete.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        system = _user_system(request)
        cache_key = cart_ids_key(request.user.id, system.id if system else 0)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        rows = CartItem.objects.filter(user=request.user, system=system).values_list(
            "id", "product_id", "service_id", "menu_item_id",
            "product_variant_id", "service_variant_id", "customization",
        )

        def _kind(product_id, service_id):
            if product_id:
                return "product"
            if service_id:
                return "service"
            return "menu_item"

        data = {
            "lines": [
                {
                    "line_id": line_id,
                    "kind": _kind(product_id, service_id),
                    "id": product_id or service_id or menu_item_id,
                    "variant_id": product_variant_id or service_variant_id,
                    # A menu line's ingredient selection is part of its identity,
                    # but the catalog card only ever adds/removes the base line;
                    # this flag lets it match that one and ignore customised
                    # siblings. Always false for product/service.
                    "customized": bool(customization),
                }
                for line_id, product_id, service_id, menu_item_id,
                product_variant_id, service_variant_id, customization in rows
            ],
        }
        cache.set(cache_key, data, CART_CACHE_TTL)
        return Response(data)


# ── Guest (anonymous) cart & favorites ────────────────────────────────────────


class GuestResolveView(APIView):
    """POST /api/guest/resolve/ - price an anonymous visitor's local cart.

    An anonymous visitor has no rows: their cart and favorites live in the
    browser's localStorage as bare references, and this turns those references
    into the exact payloads the cart and favorites pages already render for a
    signed-in customer. Body: `{"cart": [...refs], "favorites": [...refs]}`.

    **Nothing about money comes from the client.** The reference names what was
    chosen; every price, label, image and stock flag is read back out of the
    catalog here (see `users/guest.py`), which is why a guest cart is as
    trustworthy as a stored one and why checkout can charge from the same refs.

    Unauthenticated by design, and therefore scoped by host rather than by
    profile - the same resolution every public catalog endpoint uses. That only
    picks which tenant's *published* catalog to read, so a crafted host reveals
    nothing that `GET /api/products/` would not.

    Uncached: the response is a function of the request body, so a cache keyed by
    anything less than the whole body would serve one visitor another's cart.
    """

    authentication_classes = []
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = GuestStateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        system = host_system(request)
        context = {"request": request}

        items = resolve_guest_cart(system, serializer.validated_data["cart"])
        favorites = resolve_guest_favorites(system, serializer.validated_data["favorites"])

        return Response({
            "cart": cart_payload(items, context),
            # Shaped like FavoriteSerializer's output so the favorites grid
            # renders a guest's saved items with the same component. There is no
            # row, so there is no row id or created_at: the id is the reference's
            # position, which is all the client needs to key and unsave it.
            "favorites": [
                {
                    "id": index,
                    "kind": kind,
                    "created_at": None,
                    "item": _favorite_item_payload(kind, target, context),
                }
                for index, (kind, target) in enumerate(favorites)
            ],
        })


def _favorite_item_payload(kind, target, context):
    # Imported here for the same reason FavoriteSerializer does it: a
    # module-level import would make users ↔ catalog a cycle at app-load.
    from catalog.serializers import MenuItemSerializer, ProductSerializer, ServiceSerializer

    serializer = {
        'product': ProductSerializer,
        'service': ServiceSerializer,
        'menu_item': MenuItemSerializer,
    }[kind]
    return serializer(target, context=context).data


class GuestMergeView(APIView):
    """POST /api/auth/guest/merge/ - fold a guest's local cart and favorites into
    the account that just signed in.

    Called once, by the browser, the moment a session appears with local guest
    state still present. **Union, quantities summed**: a saved item the account
    already had stays saved, and a line it already had comes back with the two
    quantities added (capped at 99, as a repeated add is). That is what makes the
    call idempotent-enough to be safe on a retry only *once* - which is why the
    client clears localStorage on success and this returns the merged cart so it
    can render the result without a second round-trip.

    Every line goes through the same `_add_cart_line` / `_add_menu_line` the add
    endpoint uses, so a merged line is indistinguishable from a clicked one. Refs
    that no longer resolve are dropped rather than failing the merge: a cart that
    sat in a browser for weeks must still sign the customer in.
    """

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = GuestStateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # A signed-in caller is scoped by their profile, never by the host: the
        # account's tenant is the one thing here the browser must not choose.
        system = _user_system(request)
        user = request.user

        for kind, target in resolve_guest_favorites(system, serializer.validated_data["favorites"]):
            Favorite.objects.get_or_create(user=user, system=system, **{kind: target})

        for line in resolve_guest_cart(system, serializer.validated_data["cart"]):
            if line.menu_item_id:
                _add_menu_line(user, system, line.menu_item, line.customization, line.quantity)
            else:
                _add_cart_line(
                    user, system, line.kind, line.target, line.variant, line.quantity,
                )

        system_id = system.id if system else 0
        invalidate_favorites(user.id, system_id)
        invalidate_cart(user.id, system_id)

        return Response(_cart_payload(request, system))
