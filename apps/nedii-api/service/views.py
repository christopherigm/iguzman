from rest_framework import viewsets, mixins
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from service.models import (
    ServiceClassification,
    ServiceFeature,
    ServicePicture,
    Service,
)
from service.serializers import (
    ServiceClassificationSerializer,
    ServiceFeatureSerializer,
    ServicePictureSerializer,
    ServiceSerializer,
)


class ServiceClassificationViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ServiceClassification.objects.all()
    serializer_class=ServiceClassificationSerializer
    filter_fields=("enabled","slug", "stand")
    search_fields=("name",)
    ordering=( "id", )


class ServiceFeatureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ServiceFeature.objects.all()
    serializer_class=ServiceFeatureSerializer
    filter_fields=("enabled", "stand")
    search_fields=("name",)
    ordering=("id",)


class ServicePictureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ServicePicture.objects.all()
    serializer_class=ServicePictureSerializer
    filter_fields=("enabled", "stand", "service")
    ordering=("id",)


class ServiceViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=Service.objects.all()
    serializer_class=ServiceSerializer
    filterset_fields={
        "enabled": ("exact",),
        "stand": ("exact",),
        "stand__slug": ("exact",),
        "stand__owner": ("exact",),
        "classification": ("exact", "lt", "gt", "gte", "lte", "in"),
        "price": ("exact", "lt", "gt", "gte", "lte", "in"),
        "final_price": ("exact", "lt", "gt", "gte", "lte", "in"),
        "features": ("exact",),
        "slug": ("exact",),
        "created": ("exact", "lt", "gt", "gte", "lte", "in"),
        "modified": ("exact", "lt", "gt", "gte", "lte", "in"),
        "publish_on_the_wall": ("exact",),
        "discount": ("exact", "lt", "gt", "gte", "lte", "in"),
    }
    search_fields=(
        "name",
        "short_description"
    )
    ordering=( "id", )
