from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    AdminUserDetailView,
    AdminUserListView,
    ChangePasswordView,
    FavoriteDetailView,
    FavoriteIdsView,
    FavoriteListView,
    LoginView,
    TokenReissueView,
    PasskeyAuthenticationOptionsView,
    PasskeyAuthenticationVerifyView,
    PasskeyCredentialDetailView,
    PasskeyCredentialListView,
    PasskeyRegistrationOptionsView,
    PasskeyRegistrationVerifyView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfilePictureView,
    ProfileView,
    ResendVerificationView,
    SignUpView,
    VerifyEmailView,
)

urlpatterns = [
    path("signup/", SignUpView.as_view(), name="auth-signup"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("token/reissue/", TokenReissueView.as_view(), name="auth-token-reissue"),
    path("token/verify/", TokenVerifyView.as_view(), name="auth-token-verify"),
    path("profile/", ProfileView.as_view(), name="auth-profile"),
    path("profile/picture/", ProfilePictureView.as_view(), name="auth-profile-picture"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("verify-email/<uuid:token>/", VerifyEmailView.as_view(), name="auth-verify-email"),
    path("resend-verification/", ResendVerificationView.as_view(), name="auth-resend-verification"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    # Favorites
    path("favorites/", FavoriteListView.as_view(), name="favorite-list"),
    path("favorites/ids/", FavoriteIdsView.as_view(), name="favorite-ids"),
    path("favorites/<str:kind>/<int:pk>/", FavoriteDetailView.as_view(), name="favorite-detail"),
    path("admin/users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("admin/users/<int:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    # Passkey (WebAuthn)
    path("passkey/register/options/", PasskeyRegistrationOptionsView.as_view(), name="passkey-register-options"),
    path("passkey/register/verify/", PasskeyRegistrationVerifyView.as_view(), name="passkey-register-verify"),
    path("passkey/authenticate/options/", PasskeyAuthenticationOptionsView.as_view(), name="passkey-auth-options"),
    path("passkey/authenticate/verify/", PasskeyAuthenticationVerifyView.as_view(), name="passkey-auth-verify"),
    path("passkey/credentials/", PasskeyCredentialListView.as_view(), name="passkey-credentials"),
    path("passkey/credentials/<int:pk>/", PasskeyCredentialDetailView.as_view(), name="passkey-credential-detail"),
]
