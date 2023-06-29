from rest_framework import viewsets, mixins
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from real_estate.models import (
    RealEstateClassification,
    RealEstateFeature,
    RealEstatePicture,
    RealEstate,
)
from real_estate.serializers import (
    RealEstateClassificationSerializer,
    RealEstateFeatureSerializer,
    RealEstatePictureSerializer,
    RealEstateSerializer,
)

class RealEstateClassificationViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=RealEstateClassification.objects.all()
    serializer_class=RealEstateClassificationSerializer
    filter_fields=("enabled","slug",)
    search_fields=("name",)
    ordering=( "id", )


class RealEstateFeatureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=RealEstateFeature.objects.all()
    serializer_class=RealEstateFeatureSerializer
    filter_fields=("enabled",)
    search_fields=("name",)
    ordering=("id",)


class RealEstatePictureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=RealEstatePicture.objects.all()
    serializer_class=RealEstatePictureSerializer
    filter_fields=("enabled", "stand", "real_estate")
    ordering=("id",)


class RealEstateViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=RealEstate.objects.all()
    serializer_class=RealEstateSerializer
    filterset_fields={
        "enabled": ("exact",),
        "stand": ("exact",),
        "stand__slug": ("exact",),
        "stand__owner": ("exact",),
        "slug": ("exact",),
        "classification": ("exact", "lt", "gt", "gte", "lte", "in"),
        "year": ("exact", "lt", "gt", "gte", "lte", "in"),
        "area": ("exact", "lt", "gt", "gte", "lte", "in"),
        "num_of_bedrooms": ("exact", "lt", "gt", "gte", "lte", "in"),
        "num_of_bathrooms": ("exact", "lt", "gt", "gte", "lte", "in"),
        "num_of_parking_spots": ("exact", "lt", "gt", "gte", "lte", "in"),
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
