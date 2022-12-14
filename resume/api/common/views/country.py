from rest_framework.viewsets import ReadOnlyModelViewSet
from common.models import Country
from common.serializers import CountrySerializer

# Create your views here.

class CountryViewSet (ReadOnlyModelViewSet):
    queryset=Country.objects.all()
    serializer_class=CountrySerializer
    ordering=['id']
    ordering_fields='__all__'
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'code': ('exact', 'in'),
        'name': ('exact', 'in')
    }
    search_fields=[ 'name', 'code' ]
