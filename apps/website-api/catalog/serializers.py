from rest_framework import serializers

from core.models import Brand, System, CURRENCY_CHOICES
from core.serializers import ImageProcessingSerializer
from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service, ServiceImage,
    VariantOption, VariantOptionValue,
    ProductVariant, ProductVariantImage,
    ServiceVariant,
    DIMENSION_UNIT_CHOICES, WEIGHT_UNIT_CHOICES, MODALITY_CHOICES,
)


# ---------------------------------------------------------------------------
# ProductCategory serializers
# ---------------------------------------------------------------------------

class ProductCategorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategory
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'image', 'item_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url

    def get_item_count(self, obj):
        return obj.products.filter(enabled=True).count()


class ProductCategoryWriteSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = ProductCategory
        fields = [
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'enabled', 'image',
        ]

    def validate_slug(self, value):
        qs = ProductCategory.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A product category with this slug already exists.')
        return value

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(data={'base64_image': value}, max_size=(1200, 1200), quality=85)
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        instance = super().create(validated_data)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def update(self, instance, validated_data):
        image_data = validated_data.pop('image', None)
        instance = super().update(instance, validated_data)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, instance, image_data):
        proc = ImageProcessingSerializer(data={'base64_image': image_data}, max_size=(1200, 1200), quality=85)
        proc.is_valid()
        proc.save_to_field(instance.image, f'product_category_{instance.pk}.jpg')
        instance.save(update_fields=['image'])


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
            max_size=(900, 900),
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
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(instance.image, f'product_{product.pk}_img_{instance.pk}.jpg')
        instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# Product serializers
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Variant option serializers
# ---------------------------------------------------------------------------

class VariantOptionValueSerializer(serializers.ModelSerializer):
    option_name = serializers.CharField(source='option.name', read_only=True)

    class Meta:
        model = VariantOptionValue
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'option', 'option_name', 'name', 'en_name', 'slug',
            'sort_order', 'color',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']


class VariantOptionValueWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = VariantOptionValue
        fields = ['option', 'name', 'en_name', 'slug', 'sort_order', 'color', 'enabled']

    def validate(self, attrs):
        slug = attrs.get('slug', getattr(self.instance, 'slug', None))
        option = attrs.get('option', getattr(self.instance, 'option', None))
        qs = VariantOptionValue.objects.filter(option=option, slug=slug)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({'slug': 'A value with this slug already exists for this option.'})
        return attrs


class VariantOptionSerializer(serializers.ModelSerializer):
    values = VariantOptionValueSerializer(many=True, read_only=True)

    class Meta:
        model = VariantOption
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'name', 'en_name', 'slug', 'values',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']


class VariantOptionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = VariantOption
        fields = ['system', 'name', 'en_name', 'slug', 'enabled']

    def validate_slug(self, value):
        qs = VariantOption.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A variant option with this slug already exists.')
        return value


# ---------------------------------------------------------------------------
# ProductVariant serializers
# ---------------------------------------------------------------------------

class ProductVariantImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariantImage
        fields = ['id', 'image', 'name', 'fit', 'background_color', 'sort_order']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url


class ProductVariantSerializer(serializers.ModelSerializer):
    option_values = VariantOptionValueSerializer(many=True, read_only=True)
    images = ProductVariantImageSerializer(many=True, read_only=True)
    effective_name = serializers.CharField(read_only=True)
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_image = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'product', 'is_default', 'sort_order',
            'option_values',
            'name', 'en_name', 'sku', 'barcode',
            'price', 'compare_price', 'cost_price',
            'in_stock', 'stock_count',
            'weight', 'length', 'width', 'height',
            'image', 'images',
            'effective_name', 'effective_price', 'effective_compare_price', 'effective_image',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_effective_image(self, obj):
        request = self.context.get('request')
        img = obj.effective_image
        if not img:
            return None
        return request.build_absolute_uri(img.url) if request else img.url


class ProductVariantWriteSerializer(serializers.Serializer):
    option_values = serializers.PrimaryKeyRelatedField(
        queryset=VariantOptionValue.objects.all(), many=True, required=False,
    )
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sku = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    barcode = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    in_stock = serializers.BooleanField(required=False)
    stock_count = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    weight = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    length = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    width = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    height = serializers.DecimalField(max_digits=10, decimal_places=3, required=False, allow_null=True)
    is_default = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, required=False)
    enabled = serializers.BooleanField(required=False)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(900, 900),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def validate_sku(self, value):
        if not value:
            return value
        qs = ProductVariant.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A product variant with this SKU already exists.')
        return value

    def create(self, validated_data, product):
        option_values = validated_data.pop('option_values', [])
        image_data = validated_data.pop('image', None)
        variant = ProductVariant(product=product, **validated_data)
        variant.save()
        variant.option_values.set(option_values)
        if image_data:
            self._save_image(variant, image_data)
        return variant

    def update(self, instance, validated_data):
        option_values = validated_data.pop('option_values', None)
        image_data = validated_data.pop('image', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if option_values is not None:
            instance.option_values.set(option_values)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, variant, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(variant.image, f'product_variant_{variant.pk}.jpg')
        variant.save(update_fields=['image'])


class ProductVariantImageWriteSerializer(serializers.Serializer):
    image = serializers.CharField()
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_image(self, value):
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(900, 900),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, variant):
        instance = ProductVariantImage(
            variant=variant,
            name=self.validated_data.get('name'),
            sort_order=self.validated_data.get('sort_order', 0),
        )
        instance.save()
        proc = ImageProcessingSerializer(
            data={'base64_image': self.validated_data['image']},
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(instance.image, f'product_variant_{variant.pk}_img_{instance.pk}.jpg')
        instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# ServiceVariant serializers
# ---------------------------------------------------------------------------

class ServiceVariantSerializer(serializers.ModelSerializer):
    option_values = VariantOptionValueSerializer(many=True, read_only=True)
    effective_name = serializers.CharField(read_only=True)
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_duration = serializers.IntegerField(read_only=True)
    effective_modality = serializers.CharField(read_only=True)
    effective_image = serializers.SerializerMethodField()

    class Meta:
        model = ServiceVariant
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'service', 'is_default', 'sort_order',
            'option_values',
            'name', 'en_name', 'sku',
            'price', 'compare_price', 'cost_price',
            'duration', 'modality',
            'image',
            'effective_name', 'effective_price', 'effective_compare_price',
            'effective_image', 'effective_duration', 'effective_modality',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_effective_image(self, obj):
        request = self.context.get('request')
        img = obj.effective_image
        if not img:
            return None
        return request.build_absolute_uri(img.url) if request else img.url


class ServiceVariantWriteSerializer(serializers.Serializer):
    option_values = serializers.PrimaryKeyRelatedField(
        queryset=VariantOptionValue.objects.all(), many=True, required=False,
    )
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sku = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    duration = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    modality = serializers.ChoiceField(
        choices=[c[0] for c in MODALITY_CHOICES], required=False, allow_null=True,
    )
    is_default = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, required=False)
    enabled = serializers.BooleanField(required=False)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(900, 900),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def validate_sku(self, value):
        if not value:
            return value
        qs = ServiceVariant.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A service variant with this SKU already exists.')
        return value

    def create(self, validated_data, service):
        option_values = validated_data.pop('option_values', [])
        image_data = validated_data.pop('image', None)
        variant = ServiceVariant(service=service, **validated_data)
        variant.save()
        variant.option_values.set(option_values)
        if image_data:
            self._save_image(variant, image_data)
        return variant

    def update(self, instance, validated_data):
        option_values = validated_data.pop('option_values', None)
        image_data = validated_data.pop('image', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if option_values is not None:
            instance.option_values.set(option_values)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, variant, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(variant.image, f'service_variant_{variant.pk}.jpg')
        variant.save(update_fields=['image'])


# ---------------------------------------------------------------------------
# Product serializers
# ---------------------------------------------------------------------------

class ProductSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_slug = serializers.SlugRelatedField(source='category', slug_field='slug', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'category', 'category_name', 'category_slug',
            'brand', 'brand_name',
            'name', 'en_name', 'description', 'en_description',
            'slug', 'sku', 'barcode',
            'image', 'images', 'variants',
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
        queryset=ProductCategory.objects.all(), required=False, allow_null=True,
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
            max_size=(900, 900),
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
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(product.image, f'product_{product.pk}.jpg')
        product.save(update_fields=['image'])


# ---------------------------------------------------------------------------
# Service image serializers
# ---------------------------------------------------------------------------

class ServiceImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ServiceImage
        fields = ['id', 'image', 'name', 'fit', 'background_color', 'sort_order']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ServiceImageWriteSerializer(serializers.Serializer):
    image = serializers.CharField()
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_image(self, value):
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(900, 900),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, service):
        image_data = self.validated_data['image']
        instance = ServiceImage(
            service=service,
            name=self.validated_data.get('name'),
            sort_order=self.validated_data.get('sort_order', 0),
        )
        instance.save()

        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(instance.image, f'service_{service.pk}_img_{instance.pk}.jpg')
        instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# ServiceCategory serializers
# ---------------------------------------------------------------------------

class ServiceCategorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = ServiceCategory
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'image', 'item_count',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url

    def get_item_count(self, obj):
        return obj.services.filter(enabled=True).count()


class ServiceCategoryWriteSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = ServiceCategory
        fields = [
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'enabled', 'image',
        ]

    def validate_slug(self, value):
        qs = ServiceCategory.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A service category with this slug already exists.')
        return value

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(data={'base64_image': value}, max_size=(1200, 1200), quality=85)
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        instance = super().create(validated_data)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def update(self, instance, validated_data):
        image_data = validated_data.pop('image', None)
        instance = super().update(instance, validated_data)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, instance, image_data):
        proc = ImageProcessingSerializer(data={'base64_image': image_data}, max_size=(1200, 1200), quality=85)
        proc.is_valid()
        proc.save_to_field(instance.image, f'service_category_{instance.pk}.jpg')
        instance.save(update_fields=['image'])


# ---------------------------------------------------------------------------
# Service serializers
# ---------------------------------------------------------------------------

class ServiceSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    images = ServiceImageSerializer(many=True, read_only=True)
    variants = ServiceVariantSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_slug = serializers.SlugRelatedField(source='category', slug_field='slug', read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'category', 'category_name', 'category_slug',
            'brand', 'brand_name',
            'name', 'en_name', 'description', 'en_description',
            'slug', 'sku',
            'image', 'images', 'variants',
            'href', 'fit', 'background_color',
            'price', 'compare_price', 'cost_price', 'currency',
            'is_featured', 'duration', 'modality',
        ]

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ServiceWriteSerializer(serializers.Serializer):
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

    # FK relations
    system = serializers.PrimaryKeyRelatedField(
        queryset=System.objects.all(), required=False, allow_null=True,
    )
    brand = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.all(), required=False, allow_null=True,
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=ServiceCategory.objects.all(), required=False, allow_null=True,
    )

    # Service-specific fields
    slug = serializers.SlugField(max_length=255)
    sku = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)

    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    currency = serializers.ChoiceField(choices=[c[0] for c in CURRENCY_CHOICES], required=False, default='USD')

    enabled = serializers.BooleanField(required=False)
    is_featured = serializers.BooleanField(required=False)
    duration = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    modality = serializers.ChoiceField(
        choices=[c[0] for c in MODALITY_CHOICES], required=False, allow_null=True,
    )

    # Image as base64 string
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            max_size=(900, 900),
            quality=85,
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def validate_slug(self, value):
        qs = Service.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A service with this slug already exists.')
        return value

    def validate_sku(self, value):
        if not value:
            return value
        qs = Service.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A service with this SKU already exists.')
        return value

    _SCALAR_FIELDS = [
        'name', 'en_name', 'description', 'en_description', 'href', 'fit',
        'background_color', 'system', 'brand', 'category',
        'slug', 'sku',
        'price', 'compare_price', 'cost_price', 'currency',
        'enabled', 'is_featured', 'duration', 'modality',
    ]

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        service = Service(**validated_data)
        service.save()
        if image_data:
            self._save_image(service, image_data)
        return service

    def update(self, instance, validated_data):
        image_data = validated_data.pop('image', None)
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        instance.save()
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, service, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            max_size=(900, 900),
            quality=85,
        )
        proc.is_valid()
        proc.save_to_field(service.image, f'service_{service.pk}.jpg')
        service.save(update_fields=['image'])
