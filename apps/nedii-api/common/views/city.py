from rest_framework.viewsets import ReadOnlyModelViewSet
from common.models import City
from common.serializers import CitySerializer

# Create your views here.

class CityViewSet (ReadOnlyModelViewSet):
    queryset=City.objects.all()
    serializer_class=CitySerializer
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
