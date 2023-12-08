from rest_framework.viewsets import ModelViewSet, GenericViewSet
import json, jwt
from django.conf import settings
from rest_framework import mixins, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth import authenticate
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.http import Http404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework_simplejwt.views import TokenObtainPairView

from rest_framework.decorators import api_view
from common.permissions import (
    IsAdminOrIsItSelf,
    IsSuperUser,
    IsAdminOrBelongsToItSelf
)
from django.contrib.auth.models import User, Group
from users.models import UserAddress, UserProfile
from users.serializers import (
    GroupSerializer,
    UserSerializer,
    UserAddressSerializer,
    UserLoginSerializer
)
from common.mixins import (
    CustomCreate,
    CustomUpdate
)

# Create your views here.

class GroupViewSet (
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        GenericViewSet
    ):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    ordering = ['id']
    permission_classes = [ IsAuthenticated ]
    authentication_classes = [
        JWTAuthentication,
        SessionAuthentication
    ]
    ordering_fields = [ 'id', 'name' ]
    filterset_fields = {
        'id': ('exact',),
        'name': ('exact', 'in')
    }
    search_fields = [
        'name'
    ]

class UserViewSet(ModelViewSet):
    '''
    User instance
    '''
    queryset = User.objects.all()
    serializer_class = UserSerializer
    ordering = ['id']
    permission_classes = [ IsAuthenticated ]
    authentication_classes = [
        JWTAuthentication,
        SessionAuthentication
    ]
    ordering_fields = [
        'id', 'first_name', 'last_name', 'last_login'
    ]
    filterset_fields = {
        'id': ('exact',),
        'is_superuser': ('exact',),
        'username': ('exact', 'in'),
        'email': ('exact', 'in'),
        'last_login': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'date_joined': ('exact', 'lt', 'gt', 'gte', 'lte', 'in')
    }
    search_fields = [
        'first_name', 'last_name', 'email', 'username'
    ]

    def get_permissions(self):
        permission_classes = [IsAdminOrIsItSelf]
        if self.action in ('list', 'destroy'):
            permission_classes = [IsSuperUser]
        if self.action == 'create':
            permission_classes = []
        return [permission() for permission in permission_classes]


class UserAddressViewSet (
        CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        GenericViewSet
    ):
    '''
    User Address Instance
    '''
    queryset = UserAddress.objects.all()
    serializer_class = UserAddressSerializer
    ordering = ['id']
    permission_classes = [
        IsAdminOrBelongsToItSelf
    ]
    authentication_classes = [
        JWTAuthentication,
        SessionAuthentication
    ]
    ordering_fields = [
        'id', 'alias'
    ]
    filterset_fields = {
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'zip_code': ('exact',)
    }
    search_fields = [
        'alias', 'receptor_name', 'phone',
        'zip_code', 'street'
    ]

    def get_queryset(self):
        user = self.request.user
        token = None
        if 'Authorization' in self.request.headers:
            token = self.request.headers['Authorization'].split(' ')[1]
        if token:
            decoded = jwt.decode(token, settings.SECRET_KEY, do_time_check=True)
            user = User.objects.get(id=decoded['user_id'])
        if user.is_anonymous:
            raise Http404('No MyModel matches the given query.')
        if user.is_superuser:
            return UserAddress.objects.all()
        return UserAddress.objects.filter(user=user)

@method_decorator(csrf_exempt, name='dispatch')
class Login(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        body_unicode = request.body.decode('utf-8')
        body = json.loads(body_unicode)
        if 'email' in body['data'] and 'password' in body['data']:
            user = get_object_or_404(
                User,
                is_active=True,
                email=body['data']['email']
            )
        if 'username' in body['data'] and 'password' in body['data']:
            user = get_object_or_404(
                User,
                is_active=True,
                username=body['data']['username']
            )
        if user:
            is_valid = authenticate(username=user.username, password=body['data']['password'])
        if not is_valid:
            return Response( data = [{
                'detail': 'Wrong credentials',
                'status': 400
            }], status = status.HTTP_400_BAD_REQUEST )
        else:
            user.user_agent = self.request.META.get('HTTP_USER_AGENT')
            user.remote_addr = self.request.META.get('REMOTE_ADDR')
            user = UserLoginSerializer(user, many=False, context={'request': request})
            return Response(user.data)

@method_decorator(csrf_exempt, name='dispatch')
class ActivateUser(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        body_unicode=request.body.decode('utf-8')
        body = json.loads(body_unicode)
        profile = None
        user = None
        if 'token' in body['data']['attributes']:
            profile = get_object_or_404(
                UserProfile,
                token = body['data']['attributes']['token']
            )
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
                'success': True
            }, status = 200 )
        return Response( data = [{
            'detail': 'Wrong credentials',
            'status': 400
        }], status = status.HTTP_400_BAD_REQUEST )
