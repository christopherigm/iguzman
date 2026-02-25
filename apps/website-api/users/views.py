from django.contrib.auth.models import User
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    CustomTokenObtainPairSerializer,
    ProfilePictureSerializer,
    SignUpSerializer,
    UserProfileSerializer,
)


class SignUpView(generics.CreateAPIView):
    """Register a new user and return the created user data."""

    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = SignUpSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            },
            status=status.HTTP_201_CREATED,
        )


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
