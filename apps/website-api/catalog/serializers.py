from rest_framework import serializers

from core.models import Brand, System
from core.serializers import ImageProcessingSerializer
from .models import Category, Product, ProductImage, CURRENCY_CHOICES, DIMENSION_UNIT_CHOICES, WEIGHT_UNIT_CHOICES


# ---------------------------------------------------------------------------
# Category serializers
# ---------------------------------------------------------------------------

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']


class CategoryWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'enabled',
        ]

    def validate_slug(self, value):
        qs = Category.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A category with this slug already exists.')
        return value


# ---------------------------------------------------------------------------
# Product image serializers
# ---------------------------------------------------------------------------

class ProductImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'name', 'fit', 'background_color', 'sort_order']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ProductImageWriteSerializer(serializers.Serializer):
    image = serializers.CharField()
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_image(self, value):
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(512, 512),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, product):
        image_data = self.validated_data['image']
        instance = ProductImage(
            product=product,
            name=self.validated_data.get('name'),
            sort_order=self.validated_data.get('sort_order', 0),
        )
        instance.save()

        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            max_size=(512, 512),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(instance.image, f'product_{product.pk}_img_{instance.pk}.jpg')
        instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# Product serializers
# ---------------------------------------------------------------------------

class ProductSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    images = ProductImageSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)

    class Meta:
        model = Product
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'category', 'category_name',
            'brand', 'brand_name',
            'name', 'en_name', 'description', 'en_description',
            'slug', 'sku', 'barcode',
            'image', 'images',
            'href', 'fit', 'background_color',
            'price', 'compare_price', 'cost_price', 'currency',
            'in_stock', 'stock_count', 'is_featured',
            'length', 'width', 'height', 'weight',
            'dimension_unit', 'weight_unit',
        ]

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ProductWriteSerializer(serializers.Serializer):
    # BasePicture fields
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit = serializers.ChoiceField(
        choices=[c[0] for c in [('cover', ''), ('contain', ''), ('fill', ''), ('scale-down', ''), ('none', '')]],
        required=False, allow_null=True,
    )
    background_color = serializers.CharField(max_length=25, required=False, allow_null=True, allow_blank=True)

    # FK relations (accept PKs)
    system = serializers.PrimaryKeyRelatedField(
        queryset=System.objects.all(), required=False, allow_null=True,
    )
    brand = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.all(), required=False, allow_null=True,
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), required=False, allow_null=True,
    )

    # Product-specific fields
    slug = serializers.SlugField(max_length=255)
    sku = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    barcode = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)

    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    currency = serializers.ChoiceField(choices=[c[0] for c in CURRENCY_CHOICES], required=False, default='USD')

    enabled = serializers.BooleanField(required=False)
    in_stock = serializers.BooleanField(required=False)
    stock_count = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    is_featured = serializers.BooleanField(required=False)

    length = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    width = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    height = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    weight = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    dimension_unit = serializers.ChoiceField(
        choices=[c[0] for c in DIMENSION_UNIT_CHOICES], required=False, allow_null=True,
    )
    weight_unit = serializers.ChoiceField(
        choices=[c[0] for c in WEIGHT_UNIT_CHOICES], required=False, allow_null=True,
    )

    # Image as base64 string
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(1200, 1200),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def validate_slug(self, value):
        qs = Product.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A product with this slug already exists.')
        return value

    def validate_sku(self, value):
        if not value:
            return value
        qs = Product.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A product with this SKU already exists.')
        return value

    _SCALAR_FIELDS = [
        'name', 'en_name', 'description', 'en_description', 'href', 'fit',
        'background_color', 'system', 'brand', 'category',
        'slug', 'sku', 'barcode',
        'price', 'compare_price', 'cost_price', 'currency',
        'enabled', 'in_stock', 'stock_count', 'is_featured',
        'length', 'width', 'height', 'weight', 'dimension_unit', 'weight_unit',
    ]

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        product = Product(**validated_data)
        product.save()
        if image_data:
            self._save_image(product, image_data)
        return product

    def update(self, instance, validated_data):
        image_data = validated_data.pop('image', None)
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        instance.save()
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, product, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            max_size=(1200, 1200),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(product.image, f'product_{product.pk}.jpg')
        product.save(update_fields=['image'])
