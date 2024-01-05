from rest_framework.viewsets import GenericViewSet
from rest_framework import mixins
from common.models import NediiPlan
from common.serializers import NediiPlanSerializer

# Create your views here.

class NediiPlanViewSet (
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        GenericViewSet
    ):
    queryset=NediiPlan.objects.all()
    serializer_class=NediiPlanSerializer
    ordering=['id']
    ordering_fields=[ 
        'id', 'name', 'order'
    ]
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
    }
    search_fields=[ 'name' ]
