from rest_framework.viewsets import GenericViewSet
from rest_framework import mixins
from pages.models import Page
from pages.serializers import PageSerializer
from common.mixins import (
  CustomCreate,
  CustomUpdate,
  CountRetrieve
)
from common.permissions import IsAdminOrBelongsToItSelf

class PageViewSet (
    CustomCreate,
    CustomUpdate,
    mixins.ListModelMixin,
    CountRetrieve,
    mixins.DestroyModelMixin,
    GenericViewSet
  ):
  """
  Page Instance
  """
  queryset = Page.objects.all()
  serializer_class = PageSerializer
  ordering = ['id']
  ordering_fields = [
    'id', 'dns', 'name'
  ]
  filterset_fields = {
    'enabled': ('exact',),
    'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
    'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
    'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in')
  }
  search_fields = [
    'name', 'dns', 'name', 'slogan'
  ]

  def get_queryset(self):
    user = self.request.user
    if not user.is_anonymous and not user.is_superuser:
      return Page.objects.filter(user=user)
    return Page.objects.all()

  def get_permissions(self):
    permission_classes = []
    if self.action in ('update','destroy','partial_update'):
      permission_classes = [IsAdminOrBelongsToItSelf]
    return [permission() for permission in permission_classes]
