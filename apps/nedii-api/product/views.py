from rest_framework import viewsets, mixins
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from product.models import (
    ProductClassification,
    ProductDeliveryType,
    ProductFeature,
    ProductFeatureOption,
    ProductPicture,
    Product,
)
from product.serializers import (
    ProductClassificationSerializer,
    ProductDeliveryTypeSerializer,
    ProductFeatureSerializer,
    ProductFeatureOptionSerializer,
    ProductPictureSerializer,
    ProductSerializer,
)


class ProductClassificationViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ProductClassification.objects.all()
    serializer_class=ProductClassificationSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'stand': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'slug': ('exact',),
    }
    search_fields=("name",)
    ordering=( "id", )


class ProductDeliveryTypeViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ProductDeliveryType.objects.all()
    serializer_class=ProductDeliveryTypeSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
    }
    search_fields=("name",)
    ordering=( "id", )


class ProductFeatureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ProductFeature.objects.all()
    serializer_class=ProductFeatureSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'stand': ('exact', 'lt', 'gt', 'gte', 'lte'),
    }
    search_fields=("name",)
    ordering=("id",)

class ProductFeatureOptionViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ProductFeatureOption.objects.all()
    serializer_class=ProductFeatureOptionSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'feature__stand': ('exact',),
    }
    search_fields=("name",)
    ordering=("id",)


class ProductPictureViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=ProductPicture.objects.all()
    serializer_class=ProductPictureSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'stand': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'product': ('exact', 'lt', 'gt', 'gte', 'lte'),
    }
    ordering=( "id", )


class ProductViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=Product.objects.all()
    serializer_class=ProductSerializer
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
        "state": ("exact",),
        "brand": ("exact",),
        "unlimited_stock": ("exact",),
        "delivery_type": ("exact",),
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
