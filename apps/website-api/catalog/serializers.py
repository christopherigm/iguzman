from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from core.models import Branch, Brand, ResourcePool, System, CURRENCY_CHOICES
from core.image_sizes import REGULAR, SMALL, STANDARD, image_cfg
from core.serializers import ImageProcessingSerializer
from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service, ServiceImage,
    MenuCategory, MenuItem, MenuItemImage, MenuItemIngredient,
    MenuItemIngredientOption, RecipeStep,
    Ingredient, IngredientProvider,
    DIMENSION_UNIT_CHOICES, WEIGHT_UNIT_CHOICES, MODALITY_CHOICES,
    QUANTITY_UNIT_CHOICES, MENU_ITEM_KIND_CHOICES,
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
            'sort_order',
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
            'sort_order',
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
        sub = ImageProcessingSerializer(data={'base64_image': value}, **image_cfg(REGULAR))
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
        clear_image = 'image' in validated_data and not validated_data.get('image')
        image_data = validated_data.pop('image', None)
        instance = super().update(instance, validated_data)
        if image_data:
            self._save_image(instance, image_data)
        elif clear_image:
            instance.image = None
            instance.save(update_fields=['image'])
        return instance

    def _save_image(self, instance, image_data):
        proc = ImageProcessingSerializer(data={'base64_image': image_data}, **image_cfg(REGULAR))
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
            **image_cfg(STANDARD),
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, product):
        image_data = self.validated_data['image']
        # Atomic so a failed image write (e.g. unwritable MEDIA_ROOT) rolls back
        # the row insert instead of leaving an orphan with an empty image field.
        with transaction.atomic():
            instance = ProductImage(
                product=product,
                name=self.validated_data.get('name'),
                sort_order=self.validated_data.get('sort_order', 0),
            )
            instance.save()

            proc = ImageProcessingSerializer(
                data={'base64_image': image_data},
                **image_cfg(STANDARD),
            )
            proc.is_valid()
            proc.save_to_field(instance.image, f'product_{product.pk}_img_{instance.pk}.jpg')
            instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# Product serializers
# ---------------------------------------------------------------------------

def _buyable_image_url(obj, request):
    """Best image URL for a buyable: its own ``image``, else the first gallery
    image, else None. Shared by the full serializers and the shallow sibling-
    variant ones so a variant thumbnail resolves its image exactly like a card."""
    image = obj.image
    if not image:
        gallery = sorted(obj.images.all(), key=lambda i: i.sort_order)
        first = next((i for i in gallery if i.image), None)
        image = first.image if first else None
    if not image:
        return None
    if request:
        return request.build_absolute_uri(image.url)
    return image.url


class ProductVariantSerializer(serializers.ModelSerializer):
    """A sibling variant reference on a Product - only enough to render a
    linkable thumbnail on the detail page. Deliberately shallow: it does NOT
    nest ``variants``, so the public payload can never recurse through the
    symmetrical relation."""

    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'slug', 'name', 'en_name', 'image', 'price', 'currency', 'in_stock']

    def get_image(self, obj):
        return _buyable_image_url(obj, self.context.get('request'))


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
            'short_description', 'en_short_description',
            'slug', 'sku', 'barcode',
            'image', 'images', 'variants',
            'href', 'video_link', 'fit', 'background_color',
            'price', 'compare_price', 'cost_price', 'currency',
            'in_stock', 'stock_count', 'is_featured',
            'is_ai_generated', 'is_verified',
            'length', 'width', 'height', 'weight',
            'dimension_unit', 'weight_unit',
            'sort_order',
        ]

    def get_image(self, obj):
        # The main image is the product's own `image` field; when it is empty
        # (e.g. products whose images were only added through the CMS gallery),
        # fall back to the first gallery image so the thumbnail still resolves.
        return _buyable_image_url(obj, self.context.get('request'))


class ProductWriteSerializer(serializers.Serializer):
    # BasePicture fields
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    video_link = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit = serializers.ChoiceField(
        choices=[c[0] for c in [('cover', ''), ('contain', ''), ('fill', ''), ('scale-down', ''), ('none', '')]],
        required=False, allow_null=True,
    )
    background_color = serializers.CharField(max_length=25, required=False, allow_null=True, allow_blank=True)
    # Manual display order, written by the admin list's drag-to-reorder mode.
    sort_order = serializers.IntegerField(required=False, min_value=0)

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
    # Sibling variants (symmetrical M2M). Written as a list of Product ids; the
    # relation is set after the product is saved (see create/update).
    variants = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), many=True, required=False,
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
    is_ai_generated = serializers.BooleanField(required=False)
    is_verified = serializers.BooleanField(required=False)

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
            **image_cfg(STANDARD),
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

    def validate_variants(self, value):
        # A product is never its own variant; a symmetrical M2M would otherwise
        # let it list itself as a sibling.
        if self.instance:
            value = [v for v in value if v.pk != self.instance.pk]
        return value

    _SCALAR_FIELDS = [
        'name', 'en_name', 'description', 'en_description',
        'short_description', 'en_short_description', 'href', 'video_link', 'fit',
        'background_color', 'system', 'brand', 'category',
        'slug', 'sku', 'barcode',
        'price', 'compare_price', 'cost_price', 'currency',
        'enabled', 'in_stock', 'stock_count', 'is_featured',
        'is_ai_generated', 'is_verified',
        'length', 'width', 'height', 'weight', 'dimension_unit', 'weight_unit',
    ]

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        variants = validated_data.pop('variants', None)
        product = Product(**validated_data)
        product.save()
        if variants is not None:
            product.variants.set(variants)
        if image_data:
            self._save_image(product, image_data)
        return product

    def update(self, instance, validated_data):
        clear_image = 'image' in validated_data and not validated_data.get('image')
        image_data = validated_data.pop('image', None)
        variants = validated_data.pop('variants', None)
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        if clear_image:
            instance.image = None
        instance.save()
        if variants is not None:
            instance.variants.set(variants)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, product, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            **image_cfg(STANDARD),
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
            **image_cfg(STANDARD),
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, service):
        image_data = self.validated_data['image']
        # Atomic so a failed image write (e.g. unwritable MEDIA_ROOT) rolls back
        # the row insert instead of leaving an orphan with an empty image field.
        with transaction.atomic():
            instance = ServiceImage(
                service=service,
                name=self.validated_data.get('name'),
                sort_order=self.validated_data.get('sort_order', 0),
            )
            instance.save()

            proc = ImageProcessingSerializer(
                data={'base64_image': image_data},
                **image_cfg(STANDARD),
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
            'sort_order',
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
            'sort_order',
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
        sub = ImageProcessingSerializer(data={'base64_image': value}, **image_cfg(REGULAR))
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
        clear_image = 'image' in validated_data and not validated_data.get('image')
        image_data = validated_data.pop('image', None)
        instance = super().update(instance, validated_data)
        if image_data:
            self._save_image(instance, image_data)
        elif clear_image:
            instance.image = None
            instance.save(update_fields=['image'])
        return instance

    def _save_image(self, instance, image_data):
        proc = ImageProcessingSerializer(data={'base64_image': image_data}, **image_cfg(REGULAR))
        proc.is_valid()
        proc.save_to_field(instance.image, f'service_category_{instance.pk}.jpg')
        instance.save(update_fields=['image'])


# ---------------------------------------------------------------------------
# Service serializers
# ---------------------------------------------------------------------------

class ServiceVariantSerializer(serializers.ModelSerializer):
    """A sibling variant reference on a Service - only enough to render a
    linkable thumbnail on the detail page. Deliberately shallow: it does NOT
    nest ``variants``, so the public payload can never recurse through the
    symmetrical relation."""

    image = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = ['id', 'slug', 'name', 'en_name', 'image', 'price', 'currency', 'duration', 'modality']

    def get_image(self, obj):
        return _buyable_image_url(obj, self.context.get('request'))


class ServiceSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    images = ServiceImageSerializer(many=True, read_only=True)
    variants = ServiceVariantSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_slug = serializers.SlugRelatedField(source='category', slug_field='slug', read_only=True)
    # The *resolved* options rather than the raw switches, so the storefront and
    # the checkout cannot disagree about what "no option enabled" means - the
    # model properties own that fallback (see Service.booking_payment_options).
    booking_payment_options = serializers.ListField(
        child=serializers.CharField(), read_only=True,
    )
    booking_fulfillment_options = serializers.ListField(
        child=serializers.CharField(), read_only=True,
    )
    # The ids the CMS picker round-trips. Which branches those *are* is a
    # separate, cached read (`/api/branches/`), so this stays a flat id list and
    # the service payload does not carry a copy of every location.
    booking_branches = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'category', 'category_name', 'category_slug',
            'brand', 'brand_name',
            'name', 'en_name', 'description', 'en_description',
            'short_description', 'en_short_description',
            'slug', 'sku',
            'image', 'images', 'variants',
            'href', 'video_link', 'fit', 'background_color',
            'price', 'compare_price', 'cost_price', 'currency',
            'is_featured', 'is_ai_generated', 'is_verified',
            'duration', 'modality',
            'booking_enabled', 'booking_in_branch', 'booking_on_premises',
            'booking_branches', 'booking_fulfillment_options',
            'booking_pay_full', 'booking_pay_deposit', 'booking_deposit_percent',
            'booking_pay_in_person', 'booking_payment_options',
            # The boolean alone, deliberately. It is all a catalog card needs to
            # print "per person", and it costs no extra query - unlike the party
            # bounds, which live on `ServiceDetailSerializer` below.
            'booking_party_enabled',
            'sort_order',
        ]

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ServiceDetailSerializer(ServiceSerializer):
    """A single service, with the fields a detail page needs and a grid must not.

    Split from `ServiceSerializer` for one reason: `booking_party_limit` walks
    the service's pools and their resources, which is a query or two per service.
    Harmless on one row, an N+1 across a catalog grid - so the list serializer
    stays exactly as cheap as it was and the card makes do with the boolean.
    """

    booking_pools = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    booking_party_limit = serializers.SerializerMethodField()

    class Meta(ServiceSerializer.Meta):
        fields = ServiceSerializer.Meta.fields + [
            'booking_party_min', 'booking_party_max', 'booking_party_limit',
            'booking_pools',
        ]

    def get_booking_party_limit(self, obj):
        """The largest party the counter should offer, as an **upper bound**.

        `min(what the service allows, what the biggest single resource holds)`.
        It is not a guarantee: capacity differs per branch and says nothing about
        who is already booked, so the booking page still does the real filtering
        from the availability payload. Computed here rather than min'd in the
        frontend, following the same "read the resolved options, never the raw
        switches" rule the payment and fulfillment options follow.
        """
        if not obj.booking_party_enabled:
            return 1
        from orders.services.booking import party_capacity_ceiling

        low, high = obj.booking_party_range
        return max(low, min(high, party_capacity_ceiling(obj)))


class ServiceWriteSerializer(serializers.Serializer):
    # BasePicture fields
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    video_link = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit = serializers.ChoiceField(
        choices=[c[0] for c in [('cover', ''), ('contain', ''), ('fill', ''), ('scale-down', ''), ('none', '')]],
        required=False, allow_null=True,
    )
    background_color = serializers.CharField(max_length=25, required=False, allow_null=True, allow_blank=True)
    # Manual display order, written by the admin list's drag-to-reorder mode.
    sort_order = serializers.IntegerField(required=False, min_value=0)

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
    # Sibling variants (symmetrical M2M). Written as a list of Service ids; the
    # relation is set after the service is saved (see create/update).
    variants = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(), many=True, required=False,
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
    is_ai_generated = serializers.BooleanField(required=False)
    is_verified = serializers.BooleanField(required=False)
    duration = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    modality = serializers.ChoiceField(
        choices=[c[0] for c in MODALITY_CHOICES], required=False, allow_null=True,
    )

    # Booking configuration. Every one is optional, so a CMS save that predates
    # this feature (or an integration that never sends them) leaves the service
    # exactly as it was rather than silently turning booking off.
    booking_enabled = serializers.BooleanField(required=False)
    booking_in_branch = serializers.BooleanField(required=False)
    booking_on_premises = serializers.BooleanField(required=False)
    # Scoped to the caller's own tenant in `validate_booking_branches`, not here:
    # a PrimaryKeyRelatedField queryset cannot see the request's System, and an
    # unscoped one would let a crafted id attach another tenant's location.
    booking_branches = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.all(), many=True, required=False,
    )
    booking_pay_full = serializers.BooleanField(required=False)
    booking_pay_deposit = serializers.BooleanField(required=False)
    booking_deposit_percent = serializers.IntegerField(min_value=1, max_value=100, required=False)
    booking_pay_in_person = serializers.BooleanField(required=False)

    booking_party_enabled = serializers.BooleanField(required=False)
    booking_party_min = serializers.IntegerField(min_value=1, max_value=1000, required=False)
    booking_party_max = serializers.IntegerField(min_value=1, max_value=1000, required=False)
    # Scoped to the caller's own tenant in `validate_booking_pools`, for the same
    # reason `booking_branches` is: an unscoped queryset would let a crafted id
    # attach another tenant's boats to this service.
    booking_pools = serializers.PrimaryKeyRelatedField(
        queryset=ResourcePool.objects.all(), many=True, required=False,
    )

    # Image as base64 string
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            **image_cfg(STANDARD),
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

    def validate_variants(self, value):
        # A service is never its own variant; a symmetrical M2M would otherwise
        # let it list itself as a sibling.
        if self.instance:
            value = [v for v in value if v.pk != self.instance.pk]
        return value

    def validate_booking_branches(self, value):
        """Keep only branches belonging to the service's own System.

        The tenant is taken from the payload's `system` when one is being set and
        from the existing row otherwise, which covers both create and PATCH. A
        branch from another tenant is **dropped rather than rejected**: the CMS
        can only ever offer the caller's own locations, so an id from elsewhere
        is a crafted request, and answering it with a validation error would
        confirm that the id exists.
        """
        system_id = None
        if self.initial_data.get('system') is not None:
            system_id = self.initial_data.get('system')
        elif self.instance is not None:
            system_id = self.instance.system_id
        if system_id is None:
            return value
        return [b for b in value if str(b.system_id) == str(system_id)]

    def validate_booking_pools(self, value):
        """Keep only pools belonging to the service's own System.

        Same rule and same silent-drop as `validate_booking_branches`; the tenant
        is reached through the pool's branch, which is the only path a pool has to
        a System.
        """
        system_id = None
        if self.initial_data.get('system') is not None:
            system_id = self.initial_data.get('system')
        elif self.instance is not None:
            system_id = self.instance.system_id
        if system_id is None:
            return value
        return [p for p in value if str(p.branch.system_id) == str(system_id)]

    def validate(self, attrs):
        """A party range has to be a range.

        Checked across both fields rather than per-field because either one may be
        absent from a PATCH: the missing half is read off the instance, so a save
        that only moves the maximum still cannot put it under the minimum.
        """
        low = attrs.get('booking_party_min')
        high = attrs.get('booking_party_max')
        if low is None and self.instance is not None:
            low = self.instance.booking_party_min
        if high is None and self.instance is not None:
            high = self.instance.booking_party_max
        if low is not None and high is not None and low > high:
            raise serializers.ValidationError(
                {'booking_party_max': 'The largest party cannot be smaller than the smallest.'}
            )
        return attrs

    _SCALAR_FIELDS = [
        'name', 'en_name', 'description', 'en_description',
        'short_description', 'en_short_description', 'href', 'video_link', 'fit',
        'background_color', 'system', 'brand', 'category',
        'slug', 'sku',
        'price', 'compare_price', 'cost_price', 'currency',
        'enabled', 'is_featured', 'is_ai_generated', 'is_verified',
        'duration', 'modality',
        'booking_enabled', 'booking_in_branch', 'booking_on_premises',
        'booking_pay_full', 'booking_pay_deposit', 'booking_deposit_percent',
        'booking_pay_in_person',
        'booking_party_enabled', 'booking_party_min', 'booking_party_max',
    ]

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        variants = validated_data.pop('variants', None)
        booking_branches = validated_data.pop('booking_branches', None)
        booking_pools = validated_data.pop('booking_pools', None)
        service = Service(**validated_data)
        service.save()
        if variants is not None:
            service.variants.set(variants)
        # After save: an M2M cannot be assigned before the row has a pk.
        if booking_branches is not None:
            service.booking_branches.set(booking_branches)
        if booking_pools is not None:
            service.booking_pools.set(booking_pools)
        if image_data:
            self._save_image(service, image_data)
        return service

    def update(self, instance, validated_data):
        clear_image = 'image' in validated_data and not validated_data.get('image')
        image_data = validated_data.pop('image', None)
        variants = validated_data.pop('variants', None)
        booking_branches = validated_data.pop('booking_branches', None)
        booking_pools = validated_data.pop('booking_pools', None)
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        if clear_image:
            instance.image = None
        instance.save()
        if variants is not None:
            instance.variants.set(variants)
        # `None` means the key was absent (PATCH: leave alone); an empty list
        # means "every branch" and must actually clear the relation.
        if booking_branches is not None:
            instance.booking_branches.set(booking_branches)
        if booking_pools is not None:
            instance.booking_pools.set(booking_pools)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, service, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            **image_cfg(STANDARD),
        )
        proc.is_valid()
        proc.save_to_field(service.image, f'service_{service.pk}.jpg')
        service.save(update_fields=['image'])


# ---------------------------------------------------------------------------
# MenuCategory serializers
# ---------------------------------------------------------------------------

class MenuCategorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = MenuCategory
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'image', 'item_count',
            'sort_order',
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
        return obj.menu_items.filter(enabled=True).count()


class MenuCategoryWriteSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = MenuCategory
        fields = [
            'system', 'parent', 'name', 'en_name', 'slug',
            'description', 'en_description', 'enabled', 'image',
            'sort_order',
        ]

    def validate_slug(self, value):
        qs = MenuCategory.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A menu category with this slug already exists.')
        return value

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(data={'base64_image': value}, **image_cfg(REGULAR))
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
        clear_image = 'image' in validated_data and not validated_data.get('image')
        image_data = validated_data.pop('image', None)
        instance = super().update(instance, validated_data)
        if image_data:
            self._save_image(instance, image_data)
        elif clear_image:
            instance.image = None
            instance.save(update_fields=['image'])
        return instance

    def _save_image(self, instance, image_data):
        proc = ImageProcessingSerializer(data={'base64_image': image_data}, **image_cfg(REGULAR))
        proc.is_valid()
        proc.save_to_field(instance.image, f'menu_category_{instance.pk}.jpg')
        instance.save(update_fields=['image'])


# ---------------------------------------------------------------------------
# Ingredient serializers (reusable, System-scoped catalog)
# ---------------------------------------------------------------------------

# Aligned to the SmallPicture (256px) mixin backing Ingredient.image (and the
# MenuItemIngredient serializers below, which read the same image).
_INGREDIENT_IMAGE_CFG = image_cfg(SMALL)

# The identity + measurement fields shared by the read and write serializers,
# followed by the FDA nutrition panel (pulled straight off the model so the two
# never drift).
_INGREDIENT_CORE_FIELDS = [
    'system', 'name', 'en_name', 'slug', 'description', 'en_description',
    'unit', 'nutrition_basis_quantity', 'price', 'currency', 'sort_order',
]


class IngredientProviderSerializer(serializers.ModelSerializer):
    """A purchasing source row read back on an ingredient (store/link/price)."""

    class Meta:
        model = IngredientProvider
        fields = ['id', 'name', 'url', 'price', 'currency', 'sort_order']
        read_only_fields = ['id']


class IngredientProviderWriteSerializer(serializers.Serializer):
    """One provider row in the ingredient write payload (full-replace list)."""

    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    url = serializers.URLField(max_length=500)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    currency = serializers.ChoiceField(
        choices=[c[0] for c in CURRENCY_CHOICES], required=False, default='USD',
    )
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)


# Sentinel telling "providers omitted from a partial update" (leave them) apart
# from "providers: []" (clear them).
_PROVIDERS_UNSET = object()


class IngredientSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    providers = IngredientProviderSerializer(many=True, read_only=True)

    class Meta:
        model = Ingredient
        fields = [
            'id', 'enabled', 'created', 'modified', 'version', 'image',
            *_INGREDIENT_CORE_FIELDS,
            *Ingredient.NUTRIENT_FIELDS,
            'providers',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url


class IngredientWriteSerializer(serializers.ModelSerializer):
    # base64 string on the way in: unchanged when omitted, cleared when null/blank.
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    # Purchasing sources (store/link/price). Full-replace on write: whatever list
    # arrives becomes the ingredient's provider set (empty clears it); omitted on a
    # partial update leaves the existing rows untouched.
    providers = IngredientProviderWriteSerializer(many=True, required=False)

    class Meta:
        model = Ingredient
        fields = [
            'enabled', 'image',
            *_INGREDIENT_CORE_FIELDS,
            *Ingredient.NUTRIENT_FIELDS,
            'providers',
        ]

    def validate_unit(self, value):
        valid = {c[0] for c in QUANTITY_UNIT_CHOICES}
        if value not in valid:
            raise serializers.ValidationError('Invalid unit.')
        return value

    def validate_slug(self, value):
        qs = Ingredient.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('An ingredient with this slug already exists.')
        return value

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(data={'base64_image': value}, **_INGREDIENT_IMAGE_CFG)
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def _apply_image(self, instance, image_data):
        if image_data:
            proc = ImageProcessingSerializer(data={'base64_image': image_data}, **_INGREDIENT_IMAGE_CFG)
            proc.is_valid()
            proc.save_to_field(instance.image, f'ingredient_{instance.pk}.jpg')
        else:
            instance.image = None
        instance.save(update_fields=['image'])

    def _sync_providers(self, instance, providers):
        """Replace the ingredient's provider rows with ``providers`` (a list of
        validated dicts). Full-replace keeps the write path simple - the form owns
        the whole list - and an empty list clears every provider."""
        instance.providers.all().delete()
        for idx, prov in enumerate(providers):
            IngredientProvider.objects.create(
                ingredient=instance,
                name=prov.get('name') or None,
                url=prov['url'],
                price=prov.get('price'),
                currency=prov.get('currency') or 'USD',
                sort_order=prov.get('sort_order', idx),
            )

    def create(self, validated_data):
        has_image = 'image' in validated_data
        image_data = validated_data.pop('image', None)
        providers = validated_data.pop('providers', None)
        instance = super().create(validated_data)
        if has_image:
            self._apply_image(instance, image_data)
        if providers is not None:
            self._sync_providers(instance, providers)
        return instance

    def update(self, instance, validated_data):
        has_image = 'image' in validated_data
        image_data = validated_data.pop('image', None)
        providers = validated_data.pop('providers', _PROVIDERS_UNSET)
        instance = super().update(instance, validated_data)
        if has_image:
            self._apply_image(instance, image_data)
        if providers is not _PROVIDERS_UNSET:
            self._sync_providers(instance, providers)
        return instance


# ---------------------------------------------------------------------------
# MenuItem ingredient serializers
# ---------------------------------------------------------------------------


class MenuItemIngredientSerializer(serializers.ModelSerializer):
    included_units = serializers.IntegerField(read_only=True)
    # The effective pre-selected quantity (1 for a locked non-removable row,
    # `default_quantity` for a removable add-on); the customiser initialises the
    # stepper from it.
    default_units = serializers.IntegerField(read_only=True)
    # Identity and nutrition now live on the shared Ingredient. These read-only
    # fields flatten it back onto the row so the public shape is unchanged:
    # `name`/`en_name`/`image` come from the ingredient, `calories` is the
    # ingredient's per-basis value scaled to this portion.
    name = serializers.CharField(source='effective_name', read_only=True)
    en_name = serializers.CharField(source='effective_en_name', read_only=True)
    calories = serializers.IntegerField(read_only=True)
    image = serializers.SerializerMethodField()
    ingredient_detail = IngredientSerializer(source='ingredient', read_only=True)
    # The alternative ingredients of a single-select choice group, each flattened
    # the same way as the default (name/image from its ingredient, calories scaled
    # to *this group's* shared portion). Empty for a plain single-ingredient row.
    options = serializers.SerializerMethodField()

    class Meta:
        model = MenuItemIngredient
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'menu_item', 'ingredient', 'ingredient_detail',
            'name', 'en_name', 'image',
            'group_name', 'group_en_name',
            'quantity', 'unit', 'calories', 'price',
            'is_removable', 'is_internal', 'max_quantity',
            'number_of_free_portions', 'default_quantity',
            'included_units', 'default_units', 'sort_order', 'options',
        ]
        read_only_fields = ['id', 'created', 'modified', 'version', 'menu_item']

    def get_image(self, obj):
        request = self.context.get('request')
        image = obj.effective_image
        if not image:
            return None
        return request.build_absolute_uri(image.url) if request else image.url

    def _abs_url(self, image):
        if not image:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(image.url) if request else image.url

    def get_options(self, obj):
        # Scale each option's nutrition against the GROUP's shared portion
        # (obj.quantity/obj.unit), so the client can render "follow selection"
        # calories/nutrition without re-deriving the portion.
        result = []
        for opt in obj.options.all():
            ing = opt.ingredient
            cal = ing.nutrient_for_portion('calories', obj.quantity, obj.unit)
            result.append({
                'id': opt.id,
                'ingredient': opt.ingredient_id,
                'ingredient_detail': IngredientSerializer(ing, context=self.context).data,
                'name': ing.name,
                'en_name': ing.en_name,
                'image': self._abs_url(ing.image),
                'price': str(opt.price),
                'calories': None if cal is None else int(round(cal)),
                'sort_order': opt.sort_order,
            })
        return result


class MenuItemIngredientOptionWriteSerializer(serializers.Serializer):
    """One alternative ingredient in a choice group (write side)."""
    ingredient = serializers.PrimaryKeyRelatedField(queryset=Ingredient.objects.all())
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=Decimal('0.00'),
    )
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)


# Sentinel distinguishing "options omitted from a partial update" (leave them) from
# "options: []" (clear them).
_OPTIONS_UNSET = object()


class MenuItemIngredientWriteSerializer(serializers.ModelSerializer):
    # Identity/image/nutrition come from the referenced Ingredient now; this row
    # only carries the recipe portion and pricing.
    ingredient = serializers.PrimaryKeyRelatedField(queryset=Ingredient.objects.all())
    # The alternative ingredients of a single-select choice group. Full-replace on
    # write: whatever list arrives becomes the group's option set (empty clears it).
    options = MenuItemIngredientOptionWriteSerializer(many=True, required=False)

    class Meta:
        model = MenuItemIngredient
        fields = [
            'ingredient', 'group_name', 'group_en_name',
            'quantity', 'unit', 'price',
            'is_removable', 'is_internal', 'max_quantity',
            'number_of_free_portions', 'default_quantity',
            'sort_order', 'enabled', 'options',
        ]

    def validate_unit(self, value):
        if value in (None, ''):
            return value
        valid = {c[0] for c in QUANTITY_UNIT_CHOICES}
        if value not in valid:
            raise serializers.ValidationError('Invalid unit.')
        return value

    def validate_max_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError('max_quantity must be at least 1.')
        return value

    def validate(self, attrs):
        # Cross-field caps: free portions and the pre-selected default must both
        # fit within max_quantity. On a partial update, fall back to the stored
        # value for whichever field the payload omits.
        instance = getattr(self, 'instance', None)

        def resolved(field, default):
            if field in attrs:
                return attrs[field]
            if instance is not None:
                return getattr(instance, field)
            return default

        max_quantity = resolved('max_quantity', 1)
        free = resolved('number_of_free_portions', 0)
        default_quantity = resolved('default_quantity', 0)
        if free > max_quantity:
            raise serializers.ValidationError(
                {'number_of_free_portions': 'Number of free portions cannot exceed max quantity.'}
            )
        if default_quantity > max_quantity:
            raise serializers.ValidationError(
                {'default_quantity': 'Default quantity cannot exceed max quantity.'}
            )
        return attrs

    def _sync_options(self, instance, options):
        """Replace the group's option set with ``options`` (a list of validated
        dicts). Full-replace keeps the write path simple - the client owns the
        whole list - and an empty list clears the group back to single-ingredient.
        """
        instance.options.all().delete()
        for idx, opt in enumerate(options):
            MenuItemIngredientOption.objects.create(
                menu_item_ingredient=instance,
                ingredient=opt['ingredient'],
                price=opt.get('price', Decimal('0.00')),
                sort_order=opt.get('sort_order', idx),
            )

    def create(self, validated_data, menu_item):
        options = validated_data.pop('options', None)
        instance = MenuItemIngredient.objects.create(menu_item=menu_item, **validated_data)
        if options:
            self._sync_options(instance, options)
        return instance

    def update(self, instance, validated_data):
        options = validated_data.pop('options', _OPTIONS_UNSET)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if options is not _OPTIONS_UNSET:
            self._sync_options(instance, options)
        return instance


# ---------------------------------------------------------------------------
# MenuItem image serializers
# ---------------------------------------------------------------------------

class MenuItemImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = MenuItemImage
        fields = ['id', 'image', 'name', 'fit', 'background_color', 'sort_order']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class MenuItemImageWriteSerializer(serializers.Serializer):
    image = serializers.CharField()
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate_image(self, value):
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            **image_cfg(STANDARD),
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def save(self, menu_item):
        # Atomic so a failed image write (e.g. unwritable MEDIA_ROOT) rolls back
        # the row insert instead of leaving an orphan with an empty image field.
        with transaction.atomic():
            instance = MenuItemImage(
                menu_item=menu_item,
                name=self.validated_data.get('name'),
                sort_order=self.validated_data.get('sort_order', 0),
            )
            instance.save()
            proc = ImageProcessingSerializer(
                data={'base64_image': self.validated_data['image']},
                **image_cfg(STANDARD),
            )
            proc.is_valid()
            proc.save_to_field(instance.image, f'menu_item_{menu_item.pk}_img_{instance.pk}.jpg')
            instance.save(update_fields=['image'])
        return instance


# ---------------------------------------------------------------------------
# Recipe step serializers (INTERNAL - admin only)
# ---------------------------------------------------------------------------

class RecipeStepSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = RecipeStep
        fields = [
            'id', 'step_number', 'instruction', 'en_instruction',
            'image', 'sort_order',
        ]

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return None
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url


class RecipeStepWriteSerializer(serializers.Serializer):
    """One step within the recipe PUT payload. ``image`` is an optional base64
    string (unchanged when omitted, cleared when explicitly null/blank)."""

    step_number = serializers.IntegerField(min_value=1, required=False, default=1)
    instruction = serializers.CharField()
    en_instruction = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(data={'base64_image': value}, **image_cfg(STANDARD))
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value


class MenuItemRecipeSerializer(serializers.Serializer):
    """The whole internal recipe for a menu item: notes plus ordered steps.

    Read returns the current recipe; write (PUT) replaces the step list wholesale
    - the CMS edits the recipe as one panel, so a full replace is simpler and
    less error-prone than diffing individual step rows.
    """

    recipe_notes = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    prep_time_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    cook_time_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    servings = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    steps = RecipeStepWriteSerializer(many=True, required=False)

    def to_representation(self, instance):
        request = self.context.get('request')
        return {
            'recipe_notes': instance.recipe_notes,
            'prep_time_minutes': instance.prep_time_minutes,
            'cook_time_minutes': instance.cook_time_minutes,
            'servings': instance.servings,
            'steps': RecipeStepSerializer(
                instance.recipe_steps.all(), many=True, context={'request': request}
            ).data,
        }

    def save(self, menu_item):
        data = self.validated_data
        for field in ('recipe_notes', 'prep_time_minutes', 'cook_time_minutes', 'servings'):
            if field in data:
                setattr(menu_item, field, data[field])
        menu_item.save(update_fields=[
            f for f in ('recipe_notes', 'prep_time_minutes', 'cook_time_minutes', 'servings')
            if f in data
        ] or None)

        if 'steps' in data:
            menu_item.recipe_steps.all().delete()
            for idx, step in enumerate(data['steps']):
                image_data = step.get('image')
                obj = RecipeStep(
                    menu_item=menu_item,
                    step_number=step.get('step_number', idx + 1),
                    instruction=step['instruction'],
                    en_instruction=step.get('en_instruction'),
                    sort_order=step.get('sort_order', idx),
                )
                obj.save()
                if image_data:
                    proc = ImageProcessingSerializer(
                        data={'base64_image': image_data}, **image_cfg(STANDARD)
                    )
                    proc.is_valid()
                    proc.save_to_field(obj.image, f'recipe_step_{menu_item.pk}_{obj.pk}.jpg')
                    obj.save(update_fields=['image'])
        return menu_item


# ---------------------------------------------------------------------------
# MenuItem serializers
# ---------------------------------------------------------------------------

class MenuItemVariantSerializer(serializers.ModelSerializer):
    """A sibling variant reference on a MenuItem - only enough to render a
    linkable thumbnail on the detail page. Deliberately shallow: it does NOT
    nest ``variants``/``ingredients``, so the public payload can never recurse
    through the symmetrical relation.

    ``kind`` is here for the link, not for display: a menu item's detail route
    follows its kind (``/drink/<slug>``, not ``/food/<slug>``), and nothing stops
    the CMS from linking a variant of a different kind, so a thumbnail cannot
    assume its sibling shares the current page's route."""

    image = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = ['id', 'slug', 'name', 'en_name', 'kind', 'image']

    def get_image(self, obj):
        return _buyable_image_url(obj, self.context.get('request'))


class MenuItemSerializer(serializers.ModelSerializer):
    """Public menu-item read. Deliberately omits the internal recipe
    (``recipe_notes`` and the RecipeStep list) - that is kitchen IP served only
    through the admin-gated recipe endpoint."""

    image = serializers.SerializerMethodField()
    images = MenuItemImageSerializer(many=True, read_only=True)
    ingredients = MenuItemIngredientSerializer(many=True, read_only=True)
    variants = MenuItemVariantSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True, default=None)
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_slug = serializers.SlugRelatedField(source='category', slug_field='slug', read_only=True)

    class Meta:
        model = MenuItem
        fields = [
            'id', 'enabled', 'created', 'modified', 'version',
            'system', 'category', 'category_name', 'category_slug',
            'brand', 'brand_name',
            'name', 'en_name', 'description', 'en_description',
            'short_description', 'en_short_description',
            'slug', 'sku', 'kind',
            'image', 'images', 'ingredients', 'variants',
            'href', 'video_link', 'fit', 'background_color',
            'price', 'compare_price', 'cost_price', 'currency',
            'is_available', 'is_featured', 'is_ai_generated', 'is_verified',
            'show_nutrition_label',
            'spice_level', 'servings', 'portions',
            'prep_time_minutes', 'cook_time_minutes',
            'is_organic', 'is_vegetarian', 'is_vegan', 'is_gluten_free', 'allergens',
            'sort_order',
        ]

    def get_image(self, obj):
        return _buyable_image_url(obj, self.context.get('request'))


class MenuItemWriteSerializer(serializers.Serializer):
    # BasePicture fields
    name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    en_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    en_short_description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    href = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    video_link = serializers.URLField(max_length=255, required=False, allow_null=True, allow_blank=True)
    fit = serializers.ChoiceField(
        choices=[c[0] for c in [('cover', ''), ('contain', ''), ('fill', ''), ('scale-down', ''), ('none', '')]],
        required=False, allow_null=True,
    )
    background_color = serializers.CharField(max_length=25, required=False, allow_null=True, allow_blank=True)
    # Manual display order, written by the admin list's drag-to-reorder mode.
    sort_order = serializers.IntegerField(required=False, min_value=0)

    # FK relations
    system = serializers.PrimaryKeyRelatedField(
        queryset=System.objects.all(), required=False, allow_null=True,
    )
    brand = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.all(), required=False, allow_null=True,
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=MenuCategory.objects.all(), required=False, allow_null=True,
    )
    # Sibling variants (symmetrical M2M). Written as a list of MenuItem ids; the
    # relation is set after the item is saved (see create/update).
    variants = serializers.PrimaryKeyRelatedField(
        queryset=MenuItem.objects.all(), many=True, required=False,
    )

    # Menu-item-specific fields
    slug = serializers.SlugField(max_length=255)
    sku = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    kind = serializers.ChoiceField(
        choices=[c[0] for c in MENU_ITEM_KIND_CHOICES], required=False, default='food',
    )

    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    compare_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    currency = serializers.ChoiceField(choices=[c[0] for c in CURRENCY_CHOICES], required=False, default='USD')

    enabled = serializers.BooleanField(required=False)
    is_available = serializers.BooleanField(required=False)
    is_featured = serializers.BooleanField(required=False)
    is_ai_generated = serializers.BooleanField(required=False)
    is_verified = serializers.BooleanField(required=False)
    show_nutrition_label = serializers.BooleanField(required=False)

    spice_level = serializers.IntegerField(min_value=0, max_value=5, required=False, allow_null=True)
    servings = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    portions = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    prep_time_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    cook_time_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    is_organic = serializers.BooleanField(required=False)
    is_vegetarian = serializers.BooleanField(required=False)
    is_vegan = serializers.BooleanField(required=False)
    is_gluten_free = serializers.BooleanField(required=False)
    allergens = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    recipe_notes = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    # Image as base64 string
    image = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate_image(self, value):
        if not value:
            return value
        sub = ImageProcessingSerializer(
            data={'base64_image': value},
            **image_cfg(STANDARD),
        )
        if not sub.is_valid():
            raise serializers.ValidationError(sub.errors['base64_image'])
        return value

    def validate_slug(self, value):
        qs = MenuItem.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A menu item with this slug already exists.')
        return value

    def validate_sku(self, value):
        if not value:
            return value
        qs = MenuItem.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A menu item with this SKU already exists.')
        return value

    def validate_variants(self, value):
        # An item is never its own variant; a symmetrical M2M would otherwise
        # let it list itself as a sibling.
        if self.instance:
            value = [v for v in value if v.pk != self.instance.pk]
        return value

    def create(self, validated_data):
        image_data = validated_data.pop('image', None)
        variants = validated_data.pop('variants', None)
        menu_item = MenuItem(**validated_data)
        menu_item.save()
        if variants is not None:
            menu_item.variants.set(variants)
        if image_data:
            self._save_image(menu_item, image_data)
        return menu_item

    def update(self, instance, validated_data):
        clear_image = 'image' in validated_data and not validated_data.get('image')
        image_data = validated_data.pop('image', None)
        variants = validated_data.pop('variants', None)
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        if clear_image:
            instance.image = None
        instance.save()
        if variants is not None:
            instance.variants.set(variants)
        if image_data:
            self._save_image(instance, image_data)
        return instance

    def _save_image(self, menu_item, image_data):
        proc = ImageProcessingSerializer(
            data={'base64_image': image_data},
            **image_cfg(STANDARD),
        )
        proc.is_valid()
        proc.save_to_field(menu_item.image, f'menu_item_{menu_item.pk}.jpg')
        menu_item.save(update_fields=['image'])
