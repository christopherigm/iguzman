from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    LoginView,
    OnboardingView,
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
    ResumeUploadView,
    SignUpView,
    VerifyEmailView,
)

urlpatterns = [
    path('signup/', SignUpView.as_view(), name='auth-signup'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('token/verify/', TokenVerifyView.as_view(), name='auth-token-verify'),
    path('profile/', ProfileView.as_view(), name='auth-profile'),
    path('onboarding/', OnboardingView.as_view(), name='auth-onboarding'),
    path('resume/', ResumeUploadView.as_view(), name='auth-resume'),
    path('profile/picture/', ProfilePictureView.as_view(), name='auth-profile-picture'),
    path('verify-email/<uuid:token>/', VerifyEmailView.as_view(), name='auth-verify-email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='auth-resend-verification'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='auth-password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
    # Passkey
    path('passkey/register/options/', PasskeyRegistrationOptionsView.as_view(), name='passkey-register-options'),
    path('passkey/register/verify/', PasskeyRegistrationVerifyView.as_view(), name='passkey-register-verify'),
    path('passkey/authenticate/options/', PasskeyAuthenticationOptionsView.as_view(), name='passkey-auth-options'),
    path('passkey/authenticate/verify/', PasskeyAuthenticationVerifyView.as_view(), name='passkey-auth-verify'),
    path('passkey/credentials/', PasskeyCredentialListView.as_view(), name='passkey-credentials'),
    path('passkey/credentials/<int:pk>/', PasskeyCredentialDetailView.as_view(), name='passkey-credential-detail'),
]
