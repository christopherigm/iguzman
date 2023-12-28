from rest_framework.viewsets import ReadOnlyModelViewSet
from common.models import State
from common.serializers import StateSerializer

# Create your views here.

class StateViewSet (ReadOnlyModelViewSet):
    queryset=State.objects.all()
    serializer_class=StateSerializer
    ordering=['id']
    ordering_fields=[ 
        'id', 'name', 'created', 'modified'
    ]
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'name': ('exact', 'in')
    }
    search_fields=[ 'name' ]
