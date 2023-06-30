from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth.models import Group
from users.serializers import GroupSerializer
from rest_framework import status
from django.contrib.auth import authenticate
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from common.permissions import IsAdminOrIsItSelf
import json
from users.models import User
from users.serializers import (
    UserSerializer,
    UserLoginSerializer,
)


class GroupViewSet (ReadOnlyModelViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    ordering = ["id"]
    permission_classes = [ IsAuthenticated ]
    authentication_classes = [
        JWTAuthentication,
        SessionAuthentication
    ]
    ordering_fields = [ "id", "name" ]
    filterset_fields = {
        "id": ("exact",),
        "name": ("exact", "in")
    }
    search_fields = [
        "name"
    ]


class UserViewSet(ModelViewSet):
    queryset = User.objects.filter(
        is_active=True,
    )
    serializer_class = UserSerializer
    ordering = ["id"]
    ordering_fields = [
        "id", "first_name", "last_name", "last_login"
    ]
    filterset_fields = {
        "id": ("exact",),
        "is_superuser": ("exact",),
        "username": ("exact", "in"),
        "email": ("exact", "in"),
        "last_login": ("exact", "lt", "gt", "gte", "lte", "in"),
        "date_joined": ("exact", "lt", "gt", "gte", "lte", "in")
    }
    search_fields = [
        "first_name", "last_name", "email", "username"
    ]

    def list(self, request):
        username = request.GET.get("filter[user.username]")
        is_authenticated = request.user.is_authenticated
        if username is not None:
            queryset = self.filter_queryset(User.objects.filter(
                is_active=True,
                public=True,
                published=True
            ))
        else:
            queryset = self.filter_queryset(self.get_queryset())
        if is_authenticated and request.user.is_staff:
            queryset = self.filter_queryset(User.objects.all())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        self.queryset = User.objects.all()
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        if request.user.is_authenticated and request.user.id == instance.id or request.user.is_staff:
            return Response(serializer.data)
        elif instance.public is False or instance.published is False or instance.listed is False:
            raise Http404
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, '_prefetched_objects_cache', None):
            # If 'prefetch_related' has been applied to a queryset, we need to
            # forcibly invalidate the prefetch cache on the instance.
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def perform_update(self, serializer):
        serializer.save()

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def get_permissions(self):
        permission_classes = [IsAuthenticatedOrReadOnly]
        if self.action in ("update", "destroy"):
            permission_classes = [IsAdminOrIsItSelf]
        if self.action in ("list", "create"):
            permission_classes = []
        return [permission() for permission in permission_classes]


@method_decorator(csrf_exempt, name="dispatch")
class Login(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        is_valid = False  
        body_unicode = request.body.decode("utf-8")
        body = json.loads(body_unicode)
        if "email" in body["data"] and "password" in body["data"]:
            user = get_object_or_404(
                User,
                is_active = True,
                email = body["data"]["email"]
            )
        if "username" in body["data"] and "password" in body["data"]:
            user = get_object_or_404(
                User,
                is_active = True,
                username = body["data"]["username"]
            )
        if user:
            is_valid = authenticate(username=user.username, password=body["data"]["password"])
        if not is_valid:
            return Response( data = [{
                "detail": "Wrong credentials",
                "status": 400
            }], status = status.HTTP_400_BAD_REQUEST )
        else:
            user.user_agent = self.request.META.get("HTTP_USER_AGENT")
            user.remote_addr = self.request.META.get("REMOTE_ADDR")
            user = UserLoginSerializer(user, many=False, context={"request": request})
            return Response(user.data)


@method_decorator(csrf_exempt, name="dispatch")
class ActivateUser(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        body_unicode=request.body.decode("utf-8")
        body = json.loads(body_unicode)
        profile = None
        user = None
        if "token" in body["data"]["attributes"]:
            user = get_object_or_404(
                User,
                id = profile.user.id
            )
        if profile:
            user.is_active = True
            user.save()
            profile.token = None
            profile.save()
            return Response( data = {
                "success": True
            }, status = 200 )
        return Response( data = [{
            "detail": "Wrong credentials",
            "status": 400
        }], status = status.HTTP_400_BAD_REQUEST )
