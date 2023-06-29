from rest_framework import viewsets, mixins
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from vehicle.models import (
    VehicleClassification,
    VehicleFeature,
    VehiclePicture,
    VehicleMake,
    VehicleModel,
    Vehicle,
)
from vehicle.serializers import (
    VehicleClassificationSerializer,
    VehicleFeatureSerializer,
    VehiclePictureSerializer,
    VehicleMakeSerializer,
    VehicleModelSerializer,
    VehicleSerializer,
)


class VehicleClassificationViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=VehicleClassification.objects.all()
    serializer_class=VehicleClassificationSerializer
    filter_fields=("enabled","slug",)
    search_fields=("name",)
    ordering=( "id", )


class VehicleFeatureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=VehicleFeature.objects.all()
    serializer_class=VehicleFeatureSerializer
    filter_fields=("enabled",)
    search_fields=("name",)
    ordering=("id",)


class VehiclePictureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=VehiclePicture.objects.all()
    serializer_class=VehiclePictureSerializer
    filter_fields=("enabled", "stand", "vehicle")
    ordering=("id",)


class VehicleMakeViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=VehicleMake.objects.all()
    serializer_class=VehicleMakeSerializer
    filter_fields=("enabled",)
    ordering=("id",)


class VehicleModelViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=VehicleModel.objects.all()
    serializer_class=VehicleModelSerializer
    filter_fields=("enabled", "make",)
    ordering=("id",)


class VehicleViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=Vehicle.objects.all()
    serializer_class=VehicleSerializer
    filterset_fields={
        "enabled": ("exact",),
        "stand": ("exact",),
        "stand__slug": ("exact",),
        "stand__owner": ("exact",),
        "slug": ("exact",),
        "classification": ("exact", "lt", "gt", "gte", "lte", "in"),
        "state": ("exact",),
        "model": ("exact",),
        "year": ("exact", "lt", "gt", "gte", "lte", "in"),
        "doors": ("exact", "lt", "gt", "gte", "lte", "in"),
        "gas": ("exact",),
        "diesel": ("exact",),
        "electric": ("exact",),
        "automatic": ("exact",),
        "four_wd": ("exact",),
        "all_wd": ("exact",),
        "price": ("exact", "lt", "gt", "gte", "lte", "in"),
        "final_price": ("exact", "lt", "gt", "gte", "lte", "in"),
        "features": ("exact",),
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

