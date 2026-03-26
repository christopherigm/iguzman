from django.core.cache import cache

from rest_framework import status
from rest_framework.permissions import AllowAny
from core.permissions import IsSystemAdmin
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import System

CACHE_TTL = 300  # 5 minutes


def _list_key(prefix, params):
    """Stable cache key for a list endpoint from its query params."""
    flat = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"{prefix}:{flat}" if flat else prefix


def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern.

    django-redis exposes delete_pattern(); the local-memory cache used in
    development does not, so we silently skip invalidation there and let
    the TTL handle expiry instead.
    """
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass


def _resolve_system(request):
    """Return the System matching the request host (via X-Website-Host or Host header)."""
    host = (
        request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
    ).split(":")[0]
    return System.objects.filter(host=host, enabled=True).first()

from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service, ServiceImage,
    VariantOption, VariantOptionValue,
    ProductVariant, ProductVariantImage,
    ServiceVariant,
)
from .serializers import (
    ProductCategorySerializer,
    ProductCategoryWriteSerializer,
    ProductSerializer,
    ProductWriteSerializer,
    ProductImageSerializer,
    ProductImageWriteSerializer,
    ServiceCategorySerializer,
    ServiceCategoryWriteSerializer,
    ServiceSerializer,
    ServiceWriteSerializer,
    ServiceImageSerializer,
    ServiceImageWriteSerializer,
    VariantOptionSerializer,
    VariantOptionWriteSerializer,
    VariantOptionValueSerializer,
    VariantOptionValueWriteSerializer,
    ProductVariantSerializer,
    ProductVariantWriteSerializer,
    ProductVariantImageSerializer,
    ProductVariantImageWriteSerializer,
    ServiceVariantSerializer,
    ServiceVariantWriteSerializer,
)


class ProductCategoryListCreateView(APIView):
    """
    GET  /api/catalog/product-categories/   — list product categories (public).
    POST /api/catalog/product-categories/   — create a product category (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = _list_key('catalog:product_categories', request.query_params)
        else:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id
            params = dict(request.query_params)
            params['system'] = system_id
            cache_key = _list_key('catalog:product_categories', params)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = ProductCategory.objects.filter(enabled=True, system_id=system_id)

        parent_id = request.query_params.get('parent')
        if parent_id == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent_id:
            qs = qs.filter(parent_id=parent_id)

        data = ProductCategorySerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = ProductCategoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(ProductCategorySerializer(category, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductCategoryDetailView(APIView):
    """
    GET    /api/catalog/product-categories/<pk>/  — retrieve (public).
    PATCH  /api/catalog/product-categories/<pk>/  — partial update (admin only).
    DELETE /api/catalog/product-categories/<pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return ProductCategory.objects.get(pk=pk)
        except ProductCategory.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:product_category:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = ProductCategorySerializer(category, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductCategoryWriteSerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        cache.delete(f'catalog:product_category:{pk}')
        _invalidate_pattern('catalog:product_categories:*')
        return Response(ProductCategorySerializer(category, context={'request': request}).data)

    def delete(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        category.delete()
        cache.delete(f'catalog:product_category:{pk}')
        _invalidate_pattern('catalog:product_categories:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductListCreateView(APIView):
    """
    GET  /api/catalog/products/   — list products (public).
    POST /api/catalog/products/   — create a product (admin only).

    Query params (GET):
      system    — filter by system pk
      category  — filter by category pk
      brand     — filter by brand pk
      featured  — 'true' to show only featured products
      in_stock  — 'true' to show only in-stock products
      search    — text search on name
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = _list_key('catalog:products', request.query_params)
        else:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id
            params = dict(request.query_params)
            params['system'] = system_id
            cache_key = _list_key('catalog:products', params)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = Product.objects.filter(enabled=True, system_id=system_id).select_related('brand', 'category', 'system').prefetch_related('images', 'variants__option_values__option', 'variants__images')

        category_id = request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)

        brand_id = request.query_params.get('brand')
        if brand_id:
            qs = qs.filter(brand_id=brand_id)

        if request.query_params.get('featured') == 'true':
            qs = qs.filter(is_featured=True)

        if request.query_params.get('in_stock') == 'true':
            qs = qs.filter(in_stock=True)

        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        data = ProductSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = ProductWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.create(serializer.validated_data)
        return Response(ProductSerializer(product, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductDetailView(APIView):
    """
    GET    /api/catalog/products/<pk>/  — retrieve (public).
    PATCH  /api/catalog/products/<pk>/  — partial update (admin only).
    DELETE /api/catalog/products/<pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Product.objects.select_related('brand', 'category', 'system').prefetch_related('images', 'variants__option_values__option', 'variants__images').get(pk=pk)
        except Product.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:product:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = ProductSerializer(product, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductWriteSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        product = serializer.update(product, serializer.validated_data)
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductSerializer(product, context={'request': request}).data)

    def delete(self, request, pk):
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        product.delete()
        cache.delete(f'catalog:product:{pk}')
        cache.delete(f'catalog:product_variants:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageListCreateView(APIView):
    """
    GET  /api/catalog/products/<pk>/images/  — list product images (public).
    POST /api/catalog/products/<pk>/images/  — add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_product(self, pk):
        try:
            return Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return None

    def get(self, request, pk):
        product = self._get_product(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductImageSerializer(product.images.all(), many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request, pk):
        product = self._get_product(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(product)
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductImageSerializer(image, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductImageDetailView(APIView):
    """
    DELETE /api/catalog/products/<pk>/images/<img_pk>/  — remove an image (admin only).
    PATCH  /api/catalog/products/<pk>/images/<img_pk>/  — update sort_order / name (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_image(self, pk, img_pk):
        try:
            return ProductImage.objects.get(pk=img_pk, product_id=pk)
        except ProductImage.DoesNotExist:
            return None

    def patch(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        name = request.data.get('name')
        sort_order = request.data.get('sort_order')
        if name is not None:
            image.name = name
        if sort_order is not None:
            image.sort_order = sort_order
        image.save(update_fields=[f for f in ['name', 'sort_order'] if f in request.data])
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductImageSerializer(image, context={'request': request}).data)

    def delete(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceCategoryListCreateView(APIView):
    """
    GET  /api/catalog/service-categories/   — list service categories (public).
    POST /api/catalog/service-categories/   — create a service category (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = _list_key('catalog:service_categories', request.query_params)
        else:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id
            params = dict(request.query_params)
            params['system'] = system_id
            cache_key = _list_key('catalog:service_categories', params)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = ServiceCategory.objects.filter(enabled=True, system_id=system_id)

        parent_id = request.query_params.get('parent')
        if parent_id == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent_id:
            qs = qs.filter(parent_id=parent_id)

        data = ServiceCategorySerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = ServiceCategoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(ServiceCategorySerializer(category, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ServiceCategoryDetailView(APIView):
    """
    GET    /api/catalog/service-categories/<pk>/  — retrieve (public).
    PATCH  /api/catalog/service-categories/<pk>/  — partial update (admin only).
    DELETE /api/catalog/service-categories/<pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return ServiceCategory.objects.get(pk=pk)
        except ServiceCategory.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:service_category:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = ServiceCategorySerializer(category, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceCategoryWriteSerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        cache.delete(f'catalog:service_category:{pk}')
        _invalidate_pattern('catalog:service_categories:*')
        return Response(ServiceCategorySerializer(category, context={'request': request}).data)

    def delete(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        category.delete()
        cache.delete(f'catalog:service_category:{pk}')
        _invalidate_pattern('catalog:service_categories:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceListCreateView(APIView):
    """
    GET  /api/catalog/services/   — list services (public).
    POST /api/catalog/services/   — create a service (admin only).

    Query params (GET):
      system    — filter by system pk
      category  — filter by service category pk
      brand     — filter by brand pk
      featured  — 'true' to show only featured services
      modality  — filter by modality (online/in_person/hybrid)
      search    — text search on name
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = _list_key('catalog:services', request.query_params)
        else:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id
            params = dict(request.query_params)
            params['system'] = system_id
            cache_key = _list_key('catalog:services', params)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = Service.objects.filter(enabled=True, system_id=system_id).select_related('brand', 'category', 'system').prefetch_related('variants__option_values__option')

        category_id = request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)

        brand_id = request.query_params.get('brand')
        if brand_id:
            qs = qs.filter(brand_id=brand_id)

        if request.query_params.get('featured') == 'true':
            qs = qs.filter(is_featured=True)

        modality = request.query_params.get('modality')
        if modality:
            qs = qs.filter(modality=modality)

        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        data = ServiceSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = ServiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.create(serializer.validated_data)
        return Response(ServiceSerializer(service, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ServiceDetailView(APIView):
    """
    GET    /api/catalog/services/<pk>/  — retrieve (public).
    PATCH  /api/catalog/services/<pk>/  — partial update (admin only).
    DELETE /api/catalog/services/<pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Service.objects.select_related('brand', 'category', 'system').prefetch_related('variants__option_values__option').get(pk=pk)
        except Service.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:service:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        service = self._get_object(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = ServiceSerializer(service, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        service = self._get_object(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceWriteSerializer(service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        service = serializer.update(service, serializer.validated_data)
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(ServiceSerializer(service, context={'request': request}).data)

    def delete(self, request, pk):
        service = self._get_object(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        service.delete()
        cache.delete(f'catalog:service:{pk}')
        cache.delete(f'catalog:service_variants:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Variant option views
# ---------------------------------------------------------------------------

class VariantOptionListCreateView(APIView):
    """
    GET  /api/catalog/variant-options/   — list variant options (public).
    POST /api/catalog/variant-options/   — create a variant option (admin only).

    Query params (GET):
      system — filter by system pk
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = _list_key('catalog:variant_options', request.query_params)
        else:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id
            params = dict(request.query_params)
            params['system'] = system_id
            cache_key = _list_key('catalog:variant_options', params)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = VariantOption.objects.filter(enabled=True, system_id=system_id).prefetch_related('values')
        data = VariantOptionSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = VariantOptionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        option = serializer.save()
        return Response(VariantOptionSerializer(option, context={'request': request}).data, status=status.HTTP_201_CREATED)


class VariantOptionDetailView(APIView):
    """
    GET    /api/catalog/variant-options/<pk>/  — retrieve (public).
    PATCH  /api/catalog/variant-options/<pk>/  — partial update (admin only).
    DELETE /api/catalog/variant-options/<pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return VariantOption.objects.prefetch_related('values').get(pk=pk)
        except VariantOption.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:variant_option:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        option = self._get_object(pk)
        if option is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = VariantOptionSerializer(option, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        option = self._get_object(pk)
        if option is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = VariantOptionWriteSerializer(option, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        option = serializer.save()
        cache.delete(f'catalog:variant_option:{pk}')
        _invalidate_pattern('catalog:variant_options:*')
        return Response(VariantOptionSerializer(option, context={'request': request}).data)

    def delete(self, request, pk):
        option = self._get_object(pk)
        if option is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        option.delete()
        cache.delete(f'catalog:variant_option:{pk}')
        cache.delete(f'catalog:variant_option_values:{pk}')
        _invalidate_pattern('catalog:variant_options:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class VariantOptionValueListCreateView(APIView):
    """
    GET  /api/catalog/variant-options/<pk>/values/   — list values (public).
    POST /api/catalog/variant-options/<pk>/values/   — create a value (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_option(self, pk):
        try:
            return VariantOption.objects.get(pk=pk)
        except VariantOption.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:variant_option_values:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        option = self._get_option(pk)
        if option is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = option.values.filter(enabled=True)
        data = VariantOptionValueSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        option = self._get_option(pk)
        if option is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = {**request.data, 'option': option.pk}
        serializer = VariantOptionValueWriteSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        value = serializer.save()
        # Values are embedded in the parent option serializer, so invalidate it too
        cache.delete(f'catalog:variant_option:{pk}')
        _invalidate_pattern('catalog:variant_options:*')
        return Response(VariantOptionValueSerializer(value, context={'request': request}).data, status=status.HTTP_201_CREATED)


class VariantOptionValueDetailView(APIView):
    """
    GET    /api/catalog/variant-options/<pk>/values/<val_pk>/  — retrieve (public).
    PATCH  /api/catalog/variant-options/<pk>/values/<val_pk>/  — partial update (admin only).
    DELETE /api/catalog/variant-options/<pk>/values/<val_pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk, val_pk):
        try:
            return VariantOptionValue.objects.select_related('option').get(pk=val_pk, option_id=pk)
        except VariantOptionValue.DoesNotExist:
            return None

    def get(self, request, pk, val_pk):
        value = self._get_object(pk, val_pk)
        if value is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(VariantOptionValueSerializer(value, context={'request': request}).data)

    def patch(self, request, pk, val_pk):
        value = self._get_object(pk, val_pk)
        if value is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = VariantOptionValueWriteSerializer(value, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        value = serializer.save()
        cache.delete(f'catalog:variant_option_values:{pk}')
        cache.delete(f'catalog:variant_option:{pk}')
        _invalidate_pattern('catalog:variant_options:*')
        return Response(VariantOptionValueSerializer(value, context={'request': request}).data)

    def delete(self, request, pk, val_pk):
        value = self._get_object(pk, val_pk)
        if value is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        value.delete()
        cache.delete(f'catalog:variant_option_values:{pk}')
        cache.delete(f'catalog:variant_option:{pk}')
        _invalidate_pattern('catalog:variant_options:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Product variant views
# ---------------------------------------------------------------------------

class ProductVariantListCreateView(APIView):
    """
    GET  /api/catalog/products/<pk>/variants/  — list product variants (public).
    POST /api/catalog/products/<pk>/variants/  — create a variant (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_product(self, pk):
        try:
            return Product.objects.get(pk=pk)
        except Product.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:product_variants:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        product = self._get_product(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = product.variants.filter(enabled=True).prefetch_related('option_values__option', 'images')
        data = ProductVariantSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        product = self._get_product(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductVariantWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = serializer.create(serializer.validated_data, product=product)
        # Variants are embedded in the product detail, so invalidate it too
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductVariantSerializer(variant, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductVariantDetailView(APIView):
    """
    GET    /api/catalog/products/<pk>/variants/<var_pk>/  — retrieve (public).
    PATCH  /api/catalog/products/<pk>/variants/<var_pk>/  — partial update (admin only).
    DELETE /api/catalog/products/<pk>/variants/<var_pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk, var_pk):
        try:
            return ProductVariant.objects.select_related('product').prefetch_related('option_values__option', 'images').get(pk=var_pk, product_id=pk)
        except ProductVariant.DoesNotExist:
            return None

    def get(self, request, pk, var_pk):
        variant = self._get_object(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProductVariantSerializer(variant, context={'request': request}).data)

    def patch(self, request, pk, var_pk):
        variant = self._get_object(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductVariantWriteSerializer(variant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        variant = serializer.update(variant, serializer.validated_data)
        cache.delete(f'catalog:product_variants:{pk}')
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductVariantSerializer(variant, context={'request': request}).data)

    def delete(self, request, pk, var_pk):
        variant = self._get_object(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        variant.delete()
        cache.delete(f'catalog:product_variants:{pk}')
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductVariantImageListCreateView(APIView):
    """
    GET  /api/catalog/products/<pk>/variants/<var_pk>/images/  — list variant images (public).
    POST /api/catalog/products/<pk>/variants/<var_pk>/images/  — add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_variant(self, pk, var_pk):
        try:
            return ProductVariant.objects.get(pk=var_pk, product_id=pk)
        except ProductVariant.DoesNotExist:
            return None

    def get(self, request, pk, var_pk):
        variant = self._get_variant(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProductVariantImageSerializer(variant.images.all(), many=True, context={'request': request}).data)

    def post(self, request, pk, var_pk):
        variant = self._get_variant(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductVariantImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(variant)
        cache.delete(f'catalog:product_variants:{pk}')
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductVariantImageSerializer(image, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductVariantImageDetailView(APIView):
    """
    PATCH  /api/catalog/products/<pk>/variants/<var_pk>/images/<img_pk>/  — update (admin only).
    DELETE /api/catalog/products/<pk>/variants/<var_pk>/images/<img_pk>/  — delete (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_image(self, pk, var_pk, img_pk):
        try:
            return ProductVariantImage.objects.get(pk=img_pk, variant_id=var_pk, variant__product_id=pk)
        except ProductVariantImage.DoesNotExist:
            return None

    def patch(self, request, pk, var_pk, img_pk):
        image = self._get_image(pk, var_pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'name' in request.data:
            image.name = request.data['name']
        if 'sort_order' in request.data:
            image.sort_order = request.data['sort_order']
        image.save(update_fields=[f for f in ['name', 'sort_order'] if f in request.data])
        cache.delete(f'catalog:product_variants:{pk}')
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductVariantImageSerializer(image, context={'request': request}).data)

    def delete(self, request, pk, var_pk, img_pk):
        image = self._get_image(pk, var_pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        cache.delete(f'catalog:product_variants:{pk}')
        cache.delete(f'catalog:product:{pk}')
        _invalidate_pattern('catalog:products:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Service variant views
# ---------------------------------------------------------------------------

class ServiceVariantListCreateView(APIView):
    """
    GET  /api/catalog/services/<pk>/variants/  — list service variants (public).
    POST /api/catalog/services/<pk>/variants/  — create a variant (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_service(self, pk):
        try:
            return Service.objects.get(pk=pk)
        except Service.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:service_variants:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        service = self._get_service(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = service.variants.filter(enabled=True).prefetch_related('option_values__option')
        data = ServiceVariantSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        service = self._get_service(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceVariantWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = serializer.create(serializer.validated_data, service=service)
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(ServiceVariantSerializer(variant, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ServiceVariantDetailView(APIView):
    """
    GET    /api/catalog/services/<pk>/variants/<var_pk>/  — retrieve (public).
    PATCH  /api/catalog/services/<pk>/variants/<var_pk>/  — partial update (admin only).
    DELETE /api/catalog/services/<pk>/variants/<var_pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk, var_pk):
        try:
            return ServiceVariant.objects.select_related('service').prefetch_related('option_values__option').get(pk=var_pk, service_id=pk)
        except ServiceVariant.DoesNotExist:
            return None

    def get(self, request, pk, var_pk):
        variant = self._get_object(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ServiceVariantSerializer(variant, context={'request': request}).data)

    def patch(self, request, pk, var_pk):
        variant = self._get_object(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceVariantWriteSerializer(variant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        variant = serializer.update(variant, serializer.validated_data)
        cache.delete(f'catalog:service_variants:{pk}')
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(ServiceVariantSerializer(variant, context={'request': request}).data)

    def delete(self, request, pk, var_pk):
        variant = self._get_object(pk, var_pk)
        if variant is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        variant.delete()
        cache.delete(f'catalog:service_variants:{pk}')
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceImageListCreateView(APIView):
    """
    GET  /api/catalog/services/<pk>/images/  — list service images (public).
    POST /api/catalog/services/<pk>/images/  — add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_service(self, pk):
        try:
            return Service.objects.get(pk=pk)
        except Service.DoesNotExist:
            return None

    def get(self, request, pk):
        service = self._get_service(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceImageSerializer(service.images.all(), many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request, pk):
        service = self._get_service(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(service)
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(ServiceImageSerializer(image, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ServiceImageDetailView(APIView):
    """
    DELETE /api/catalog/services/<pk>/images/<img_pk>/  — remove an image (admin only).
    PATCH  /api/catalog/services/<pk>/images/<img_pk>/  — update sort_order / name (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_image(self, pk, img_pk):
        try:
            return ServiceImage.objects.get(pk=img_pk, service_id=pk)
        except ServiceImage.DoesNotExist:
            return None

    def patch(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        name = request.data.get('name')
        sort_order = request.data.get('sort_order')
        if name is not None:
            image.name = name
        if sort_order is not None:
            image.sort_order = sort_order
        image.save(update_fields=[f for f in ['name', 'sort_order'] if f in request.data])
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(ServiceImageSerializer(image, context={'request': request}).data)

    def delete(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        cache.delete(f'catalog:service:{pk}')
        _invalidate_pattern('catalog:services:*')
        return Response(status=status.HTTP_204_NO_CONTENT)
