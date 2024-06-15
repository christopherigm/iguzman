from rest_framework.viewsets import ModelViewSet, GenericViewSet
from rest_framework import mixins
from common.models import State
from common.serializers import StateSerializer

# Create your views here.

class StateViewSet (
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet
  ):
  queryset = State.objects.all()
  serializer_class = StateSerializer
  ordering = ['id']
  ordering_fields = [ 
    'id', 'name', 'created', 'modified'
  ]
  filterset_fields = {
    'enabled': ('exact',),
    'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
    'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
    'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
    'name': ('exact', 'in'),
    'code': ('exact', 'in')
  }
  search_fields = [ 'name' ]
