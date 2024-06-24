from rest_framework_json_api.serializers import HyperlinkedModelSerializer
from rest_framework_json_api.relations import ResourceRelatedField
from product.models import (
    ProductClassification,
    ProductDeliveryType,
    ProductFeature,
    ProductFeatureOption,
    ProductPicture,
    Product,
)
from stand.models import Stand


class ProductClassificationSerializer(HyperlinkedModelSerializer):
    stand = ResourceRelatedField(queryset=Stand.objects)

    class Meta:
        model = ProductClassification
        fields = "__all__"


class ProductDeliveryTypeSerializer(HyperlinkedModelSerializer):

    class Meta:
        model = ProductDeliveryType
        fields = "__all__"


class ProductFeatureOptionSerializer(HyperlinkedModelSerializer):
    feature = ResourceRelatedField(queryset=ProductFeature.objects)

    included_serializers = {
        "feature": "product.serializers.ProductFeatureSerializer"
    }

    class Meta:
        model = ProductFeatureOption
        fields = "__all__"


class ProductFeatureSerializer(HyperlinkedModelSerializer):
    stand = ResourceRelatedField(queryset=Stand.objects)
    options = ResourceRelatedField(
        queryset=ProductFeatureOption.objects,
        many=True
    )

    included_serializers = {
        "options": "product.serializers.ProductFeatureOptionSerializer"
    }

    class Meta:
        model = ProductFeature
        fields = "__all__"


class ProductPictureSerializer(HyperlinkedModelSerializer):
    stand = ResourceRelatedField(queryset=Stand.objects)
    product = ResourceRelatedField(queryset=Product.objects)

    class Meta:
        model = ProductPicture
        fields = "__all__"


class ProductSerializer(HyperlinkedModelSerializer):
    classification = ResourceRelatedField(
        queryset=ProductClassification.objects)
    stand = ResourceRelatedField(queryset=Stand.objects)
    delivery_type = ResourceRelatedField(
        queryset=ProductDeliveryType.objects,
        many=True
    )
    features = ResourceRelatedField(
        queryset=ProductFeatureOption.objects,
        many=True
    )
    product_pictures = ResourceRelatedField(
        queryset=ProductPicture.objects,
        many=True
    )
    related = ResourceRelatedField(
        queryset=Product.objects,
        many=True
    )

    included_serializers = {
        "stand": "stand.serializers.StandSerializer",
        "classification": "product.serializers.ProductClassificationSerializer",
        "delivery_type": "product.serializers.ProductDeliveryTypeSerializer",
        "features": "product.serializers.ProductFeatureOptionSerializer",
        "product_pictures": "product.serializers.ProductPictureSerializer",
        "related": "product.serializers.ProductSerializer",
    }

    class Meta:
        model = Product
        fields = "__all__"
