from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import LoginView, ProfilePictureView, ProfileView, SignUpView

urlpatterns = [
    path("signup/", SignUpView.as_view(), name="auth-signup"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="auth-token-verify"),
    path("profile/", ProfileView.as_view(), name="auth-profile"),
    path("profile/picture/", ProfilePictureView.as_view(), name="auth-profile-picture"),
]
