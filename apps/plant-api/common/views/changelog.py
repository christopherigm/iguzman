from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework import mixins
from common.models import Sprint, ChangeLog
from common.serializers import (
    SprintSerializer,
    ChangeLogSerializer
)

# Create your views here.

class SprintViewSet (ReadOnlyModelViewSet):
    queryset=Sprint.objects.all()
    serializer_class=SprintSerializer
    ordering=['id']
    ordering_fields='__all__'
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'date_start': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'date_end': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'price_per_hour': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'discount': ('exact', 'lt', 'gt', 'gte', 'lte'),
    }
    search_fields=[ 'name', ]


class ChangeLogViewSet (ReadOnlyModelViewSet):
    queryset=ChangeLog.objects.all()
    serializer_class=ChangeLogSerializer
    ordering=['id']
    ordering_fields='__all__'
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'task_name': ('exact', 'in'),
        'hours': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'user': ('exact',),
        'task_type': ('exact',)
    }
    search_fields=[ 'task_name', 'user', 'description' ]
