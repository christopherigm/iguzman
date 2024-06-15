from rest_framework.viewsets import ModelViewSet
from info_grid.models import (
    InfoGrid,
    InfoGridItem
)
from info_grid.serializers import (
    InfoGridSerializer,
    InfoGridItemSerializer
)
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from rest_framework.viewsets import GenericViewSet
from rest_framework import mixins

# Create your views here.

class InfoGridViewSet ( ModelViewSet ):
    queryset = InfoGrid.objects.all()
    serializer_class = InfoGridSerializer
    ordering = ['id']
    filterset_fields = {
        'name': ('exact',),
        'page': ('exact',),
        'id': ('exact',)
    }

class InfoGridItemViewSet ( 
        CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        GenericViewSet
    ):
    queryset = InfoGridItem.objects.all()
    serializer_class = InfoGridItemSerializer
    ordering = ['id']
