from rest_framework.viewsets import GenericViewSet
from rest_framework import mixins
from pages.models import PageAddress
from pages.serializers import PageAddressSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from common.mixins import (
  CustomCreate,
  CustomUpdate,
  CountRetrieve
)
from common.permissions import IsAdminOrBelongsToItSelf

class PageAddressViewSet (
    CustomCreate,
    CustomUpdate,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    GenericViewSet
  ):
  """
  Page Address Instance
  """
  queryset = PageAddress.objects.all()
  serializer_class = PageAddressSerializer
  ordering = ['id']
  permission_classes = [ 
    IsAuthenticated,
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
    'neighborhood', 'zip_code', 'street'
  ]

  def get_queryset(self):
    user = self.request.user
    if not user.is_anonymous and not user.is_superuser:
      return PageAddress.objects.filter(user=user)
    return PageAddress.objects.all()
