import logging

from django.core.cache import cache
from django.db.models import ProtectedError

from rest_framework import status
from rest_framework.permissions import AllowAny
from core.cache import invalidate_pattern as _invalidate_pattern
from core.permissions import IsSystemAdmin, show_disabled
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import System
from core.services.llm import LlmNotConfigured
from .services.clone import clone_menu_item, clone_product, clone_service
from .services.nutrition_lookup import lookup_nutrition
from .services.price_lookup import lookup_price

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes


def _list_key(prefix, params):
    """Stable cache key for a list endpoint from its query params."""
    flat = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"{prefix}:{flat}" if flat else prefix


def _scoped_list_key(prefix, request, system_id, disabled_visible):
    """Cache key for a list endpoint, scoped to the resolved system and to the
    *effective* disabled-visibility.

    Keying off the resolved flag rather than the raw include_disabled param is what
    keeps an admin's response (which contains disabled records) from being served
    to an anonymous caller who passes the same param.
    """
    params = {k: v for k, v in request.query_params.items() if k != 'include_disabled'}
    params['system'] = system_id
    if disabled_visible:
        params['include_disabled'] = '1'
    return _list_key(prefix, params)


def _resolve_system(request):
    """Return the System matching the request host (via X-Website-Host or Host header)."""
    host = (
        request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
    ).split(":")[0]
    return System.objects.filter(host=host, enabled=True).first()

from .models import (
    ProductCategory, Product, ProductImage,
    ServiceCategory, Service, ServiceImage,
    MenuCategory, MenuItem, MenuItemImage, MenuItemIngredient, RecipeStep,
    Ingredient,
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
    ServiceDetailSerializer,
    ServiceSerializer,
    ServiceWriteSerializer,
    ServiceImageSerializer,
    ServiceImageWriteSerializer,
    MenuCategorySerializer,
    MenuCategoryWriteSerializer,
    MenuItemSerializer,
    MenuItemWriteSerializer,
    MenuItemImageSerializer,
    MenuItemImageWriteSerializer,
    MenuItemIngredientSerializer,
    MenuItemIngredientWriteSerializer,
    MenuItemRecipeSerializer,
    IngredientSerializer,
    IngredientWriteSerializer,
)


class ProductCategoryListCreateView(APIView):
    """
    GET  /api/catalog/product-categories/   - list product categories (public).
    POST /api/catalog/product-categories/   - create a product category (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:product_categories', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = ProductCategory.objects.filter(system_id=system_id)
        if not disabled_visible:
            qs = qs.filter(enabled=True)

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
        _invalidate_pattern('catalog:product_categories:*')
        return Response(ProductCategorySerializer(category, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductCategoryDetailView(APIView):
    """
    GET    /api/catalog/product-categories/<pk>/  - retrieve (public).
    PATCH  /api/catalog/product-categories/<pk>/  - partial update (admin only).
    DELETE /api/catalog/product-categories/<pk>/  - delete (admin only).
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
    GET  /api/catalog/products/   - list products (public).
    POST /api/catalog/products/   - create a product (admin only).

    Query params (GET):
      system    - filter by system pk
      category  - filter by category pk
      brand     - filter by brand pk
      featured  - 'true' to show only featured products
      in_stock  - 'true' to show only in-stock products
      search    - text search on name
      include_disabled - 'true' to also return disabled products (system admins
                  only; ignored for everyone else)
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:products', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = Product.objects.filter(system_id=system_id).select_related('brand', 'category', 'system').prefetch_related('images', 'variants', 'variants__images')
        if not disabled_visible:
            qs = qs.filter(enabled=True)

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
        _invalidate_pattern('catalog:products:*')
        return Response(ProductSerializer(product, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductDetailView(APIView):
    """
    GET    /api/catalog/products/<pk>/  - retrieve (public).
    PATCH  /api/catalog/products/<pk>/  - partial update (admin only).
    DELETE /api/catalog/products/<pk>/  - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Product.objects.select_related('brand', 'category', 'system').prefetch_related('images', 'variants', 'variants__images').get(pk=pk)
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
        # Variants are symmetrical, so editing this product's variant list also
        # changes what its siblings serialize - clear every product detail key,
        # not just this one's.
        _invalidate_pattern('catalog:product:*')
        _invalidate_pattern('catalog:products:*')
        return Response(ProductSerializer(product, context={'request': request}).data)

    def delete(self, request, pk):
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        product.delete()
        cache.delete(f'catalog:product:{pk}')
        # Deleting a product also drops it from its siblings' variant lists.
        _invalidate_pattern('catalog:product:*')
        _invalidate_pattern('catalog:products:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageListCreateView(APIView):
    """
    GET  /api/catalog/products/<pk>/images/  - list product images (public).
    POST /api/catalog/products/<pk>/images/  - add an image (admin only, base64).
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
    DELETE /api/catalog/products/<pk>/images/<img_pk>/  - remove an image (admin only).
    PATCH  /api/catalog/products/<pk>/images/<img_pk>/  - update sort_order / name (admin only).
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
    GET  /api/catalog/service-categories/   - list service categories (public).
    POST /api/catalog/service-categories/   - create a service category (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:service_categories', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = ServiceCategory.objects.filter(system_id=system_id)
        if not disabled_visible:
            qs = qs.filter(enabled=True)

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
        _invalidate_pattern('catalog:service_categories:*')
        return Response(ServiceCategorySerializer(category, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ServiceCategoryDetailView(APIView):
    """
    GET    /api/catalog/service-categories/<pk>/  - retrieve (public).
    PATCH  /api/catalog/service-categories/<pk>/  - partial update (admin only).
    DELETE /api/catalog/service-categories/<pk>/  - delete (admin only).
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
    GET  /api/catalog/services/   - list services (public).
    POST /api/catalog/services/   - create a service (admin only).

    Query params (GET):
      system    - filter by system pk
      category  - filter by service category pk
      brand     - filter by brand pk
      featured  - 'true' to show only featured services
      modality  - filter by modality (online/in_person/hybrid)
      search    - text search on name
      include_disabled - 'true' to also return disabled services (system admins
                  only; ignored for everyone else)
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:services', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = Service.objects.filter(system_id=system_id).select_related('brand', 'category', 'system').prefetch_related('images', 'variants', 'variants__images')
        if not disabled_visible:
            qs = qs.filter(enabled=True)

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

        # ⚠ A `slug` filter is the storefront's *detail* read, not a list: it is
        # what `getService(slug)` in the website's `lib/catalog.ts` calls, and it
        # matches at most one row. So it gets the detail serializer - the party
        # bounds and `booking_party_limit` live only there, and served with the
        # list serializer the booking page's counter reads `undefined` bounds,
        # never renders, and prices a party of `NaN`. The N+1 the split exists to
        # avoid needs a grid; one row can afford the walk over pools and
        # resources, which is why the prefetch rides along with it.
        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug).prefetch_related('booking_pools__resources')

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        serializer_class = ServiceDetailSerializer if slug else ServiceSerializer
        data = serializer_class(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = ServiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.create(serializer.validated_data)
        _invalidate_pattern('catalog:services:*')
        return Response(ServiceSerializer(service, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ServiceDetailView(APIView):
    """
    GET    /api/catalog/services/<pk>/  - retrieve (public).
    PATCH  /api/catalog/services/<pk>/  - partial update (admin only).
    DELETE /api/catalog/services/<pk>/  - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Service.objects.select_related('brand', 'category', 'system').prefetch_related(
                'images', 'variants', 'variants__images', 'booking_pools__resources',
            ).get(pk=pk)
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
        # The detail serializer, not the list one: this is the single-row screen
        # that can afford `booking_party_limit`'s walk over pools and resources.
        data = ServiceDetailSerializer(service, context={'request': request}).data
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
        # Variants are symmetrical, so editing this service's variant list also
        # changes what its siblings serialize - clear every service detail key,
        # not just this one's.
        _invalidate_pattern('catalog:service:*')
        _invalidate_pattern('catalog:services:*')
        # The CMS editor reloads from this response, so it has to carry the same
        # booking fields the GET does - the party bounds and the pool ids.
        return Response(ServiceDetailSerializer(service, context={'request': request}).data)

    def delete(self, request, pk):
        service = self._get_object(pk)
        if service is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        service.delete()
        cache.delete(f'catalog:service:{pk}')
        # Deleting a service also drops it from its siblings' variant lists.
        _invalidate_pattern('catalog:service:*')
        _invalidate_pattern('catalog:services:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceImageListCreateView(APIView):
    """
    GET  /api/catalog/services/<pk>/images/  - list service images (public).
    POST /api/catalog/services/<pk>/images/  - add an image (admin only, base64).
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
    DELETE /api/catalog/services/<pk>/images/<img_pk>/  - remove an image (admin only).
    PATCH  /api/catalog/services/<pk>/images/<img_pk>/  - update sort_order / name (admin only).
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


# ---------------------------------------------------------------------------
# Menu category views
# ---------------------------------------------------------------------------

class MenuCategoryListCreateView(APIView):
    """
    GET  /api/catalog/menu-categories/   - list menu categories (public).
    POST /api/catalog/menu-categories/   - create a menu category (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:menu_categories', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = MenuCategory.objects.filter(system_id=system_id)
        if not disabled_visible:
            qs = qs.filter(enabled=True)

        parent_id = request.query_params.get('parent')
        if parent_id == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent_id:
            qs = qs.filter(parent_id=parent_id)

        data = MenuCategorySerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = MenuCategoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        _invalidate_pattern('catalog:menu_categories:*')
        return Response(MenuCategorySerializer(category, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MenuCategoryDetailView(APIView):
    """
    GET    /api/catalog/menu-categories/<pk>/  - retrieve (public).
    PATCH  /api/catalog/menu-categories/<pk>/  - partial update (admin only).
    DELETE /api/catalog/menu-categories/<pk>/  - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return MenuCategory.objects.get(pk=pk)
        except MenuCategory.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:menu_category:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = MenuCategorySerializer(category, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuCategoryWriteSerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        cache.delete(f'catalog:menu_category:{pk}')
        _invalidate_pattern('catalog:menu_categories:*')
        return Response(MenuCategorySerializer(category, context={'request': request}).data)

    def delete(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        category.delete()
        cache.delete(f'catalog:menu_category:{pk}')
        _invalidate_pattern('catalog:menu_categories:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Ingredient views (reusable, System-scoped catalog)
# ---------------------------------------------------------------------------

class IngredientListCreateView(APIView):
    """
    GET  /api/catalog/ingredients/   - list ingredients (public).
    POST /api/catalog/ingredients/   - create an ingredient (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:ingredients', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = Ingredient.objects.filter(system_id=system_id)
        if not disabled_visible:
            qs = qs.filter(enabled=True)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        data = IngredientSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = IngredientWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ingredient = serializer.save()
        _invalidate_pattern('catalog:ingredients:*')
        return Response(IngredientSerializer(ingredient, context={'request': request}).data, status=status.HTTP_201_CREATED)


class IngredientDetailView(APIView):
    """
    GET    /api/catalog/ingredients/<pk>/  - retrieve (public).
    PATCH  /api/catalog/ingredients/<pk>/  - partial update (admin only).
    DELETE /api/catalog/ingredients/<pk>/  - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Ingredient.objects.get(pk=pk)
        except Ingredient.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:ingredient:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        ingredient = self._get_object(pk)
        if ingredient is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = IngredientSerializer(ingredient, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        ingredient = self._get_object(pk)
        if ingredient is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = IngredientWriteSerializer(ingredient, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        ingredient = serializer.save()
        cache.delete(f'catalog:ingredient:{pk}')
        _invalidate_pattern('catalog:ingredients:*')
        # A menu item embeds its ingredients' name/nutrition, so an edit here must
        # invalidate the menu caches that referenced this ingredient.
        _invalidate_pattern('catalog:menu_item*')
        return Response(IngredientSerializer(ingredient, context={'request': request}).data)

    def delete(self, request, pk):
        ingredient = self._get_object(pk)
        if ingredient is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            ingredient.delete()
        except ProtectedError:
            return Response(
                {'detail': 'This ingredient is still used by one or more menu items.'},
                status=status.HTTP_409_CONFLICT,
            )
        cache.delete(f'catalog:ingredient:{pk}')
        _invalidate_pattern('catalog:ingredients:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class IngredientNutritionLookupView(APIView):
    """
    POST /api/catalog/ingredients/nutrition-lookup/  - fetch nutrition from the web.

    Admin-only. Given an ingredient's identity + basis (never saved here), scrapes
    the open web and has the LLM map the result onto the FDA Nutrition-Facts fields,
    rescaled to the requested basis. Returns each of ``Ingredient.NUTRIENT_FIELDS``
    as a value (string) or ``null`` for anything the sources didn't support - the
    admin form previews these and applies only the non-null ones. Nothing is
    persisted; the operator still reviews and saves via the normal PATCH/POST.
    """

    permission_classes = [IsSystemAdmin]

    def post(self, request):
        name = str(request.data.get('name') or '').strip()
        en_name = str(request.data.get('en_name') or '').strip()
        if not (name or en_name):
            return Response(
                {'detail': 'A name or en_name is required to search.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            nutrients = lookup_nutrition(
                name=name,
                en_name=en_name,
                unit=str(request.data.get('unit') or 'g'),
                nutrition_basis_quantity=str(request.data.get('nutrition_basis_quantity') or '100'),
            )
        except LlmNotConfigured:
            return Response(
                {'detail': 'No LLM provider is configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception:
            # Scraper/LLM outages shouldn't 500 the CMS - report a clean 502 and
            # log the detail (upstream error bodies are not for the browser).
            logger.exception('Ingredient nutrition lookup failed')
            return Response(
                {'detail': 'The nutrition lookup service is unavailable. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({'nutrients': nutrients})


class IngredientPriceLookupView(APIView):
    """
    POST /api/catalog/ingredients/price-lookup/  - estimate price + find providers.

    Admin-only. Given an ingredient's identity + basis + target currency (never
    saved here), searches the open web and has the LLM estimate a single price for
    the requested amount/currency and extract the provider sources it found (store,
    link, quoted price). Returns ``{price, currency, providers}``; the admin form
    previews it, applies the price and appends the providers. Nothing is persisted;
    the operator still reviews and saves via the normal PATCH/POST.
    """

    permission_classes = [IsSystemAdmin]

    def post(self, request):
        name = str(request.data.get('name') or '').strip()
        en_name = str(request.data.get('en_name') or '').strip()
        if not (name or en_name):
            return Response(
                {'detail': 'A name or en_name is required to search.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = lookup_price(
                name=name,
                en_name=en_name,
                unit=str(request.data.get('unit') or 'g'),
                nutrition_basis_quantity=str(request.data.get('nutrition_basis_quantity') or '100'),
                currency=str(request.data.get('currency') or 'USD'),
            )
        except LlmNotConfigured:
            return Response(
                {'detail': 'No LLM provider is configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception:
            # Scraper/LLM outages shouldn't 500 the CMS - report a clean 502 and
            # log the detail (upstream error bodies are not for the browser).
            logger.exception('Ingredient price lookup failed')
            return Response(
                {'detail': 'The price lookup service is unavailable. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


# ---------------------------------------------------------------------------
# Menu item views
# ---------------------------------------------------------------------------

class MenuItemListCreateView(APIView):
    """
    GET  /api/catalog/menu-items/   - list menu items (public).
    POST /api/catalog/menu-items/   - create a menu item (admin only).

    Query params (GET):
      system    - filter by system pk
      category  - filter by menu category pk
      brand     - filter by brand pk
      featured  - 'true' to show only featured items
      available - 'true' to show only orderable items
      dietary   - one of 'vegetarian' | 'vegan' | 'gluten_free'
      search    - text search on name
      include_disabled - 'true' to also return disabled items (system admins only)
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get('system')
        if not system_id:
            system = _resolve_system(request)
            if system is None:
                return Response([], status=status.HTTP_200_OK)
            system_id = system.id

        disabled_visible = show_disabled(request)
        cache_key = _scoped_list_key('catalog:menu_items', request, system_id, disabled_visible)

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = MenuItem.objects.filter(system_id=system_id).select_related('brand', 'category', 'system').prefetch_related('images', 'ingredients__ingredient', 'ingredients__options__ingredient', 'variants', 'variants__images')
        if not disabled_visible:
            qs = qs.filter(enabled=True)

        category_id = request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)

        brand_id = request.query_params.get('brand')
        if brand_id:
            qs = qs.filter(brand_id=brand_id)

        if request.query_params.get('featured') == 'true':
            qs = qs.filter(is_featured=True)

        if request.query_params.get('available') == 'true':
            qs = qs.filter(is_available=True)

        dietary = request.query_params.get('dietary')
        if dietary == 'vegetarian':
            qs = qs.filter(is_vegetarian=True)
        elif dietary == 'vegan':
            qs = qs.filter(is_vegan=True)
        elif dietary == 'gluten_free':
            qs = qs.filter(is_gluten_free=True)

        slug = request.query_params.get('slug')
        if slug:
            qs = qs.filter(slug=slug)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        data = MenuItemSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = MenuItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        menu_item = serializer.create(serializer.validated_data)
        _invalidate_pattern('catalog:menu_items:*')
        return Response(MenuItemSerializer(menu_item, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MenuItemDetailView(APIView):
    """
    GET    /api/catalog/menu-items/<pk>/  - retrieve (public).
    PATCH  /api/catalog/menu-items/<pk>/  - partial update (admin only).
    DELETE /api/catalog/menu-items/<pk>/  - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return MenuItem.objects.select_related('brand', 'category', 'system').prefetch_related('images', 'ingredients__ingredient', 'ingredients__options__ingredient', 'variants', 'variants__images').get(pk=pk)
        except MenuItem.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f'catalog:menu_item:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        menu_item = self._get_object(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = MenuItemSerializer(menu_item, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        menu_item = self._get_object(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuItemWriteSerializer(menu_item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        menu_item = serializer.update(menu_item, serializer.validated_data)
        cache.delete(f'catalog:menu_item:{pk}')
        # Variants are symmetrical, so editing this item's variant list also
        # changes what its siblings serialize - clear every menu-item detail key,
        # not just this one's.
        _invalidate_pattern('catalog:menu_item:*')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(MenuItemSerializer(menu_item, context={'request': request}).data)

    def delete(self, request, pk):
        menu_item = self._get_object(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        menu_item.delete()
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern(f'catalog:menu_item_ingredients:{pk}:*')
        cache.delete(f'catalog:menu_item_recipe:{pk}')
        # Deleting an item also drops it from its siblings' variant lists.
        _invalidate_pattern('catalog:menu_item:*')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


class MenuItemImageListCreateView(APIView):
    """
    GET  /api/catalog/menu-items/<pk>/images/  - list images (public).
    POST /api/catalog/menu-items/<pk>/images/  - add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_item(self, pk):
        try:
            return MenuItem.objects.get(pk=pk)
        except MenuItem.DoesNotExist:
            return None

    def get(self, request, pk):
        menu_item = self._get_item(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuItemImageSerializer(menu_item.images.all(), many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request, pk):
        menu_item = self._get_item(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuItemImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = serializer.save(menu_item)
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(MenuItemImageSerializer(image, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MenuItemImageDetailView(APIView):
    """
    PATCH  /api/catalog/menu-items/<pk>/images/<img_pk>/  - update sort_order / name (admin only).
    DELETE /api/catalog/menu-items/<pk>/images/<img_pk>/  - remove an image (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_image(self, pk, img_pk):
        try:
            return MenuItemImage.objects.get(pk=img_pk, menu_item_id=pk)
        except MenuItemImage.DoesNotExist:
            return None

    def patch(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if 'name' in request.data:
            image.name = request.data['name']
        if 'sort_order' in request.data:
            image.sort_order = request.data['sort_order']
        image.save(update_fields=[f for f in ['name', 'sort_order'] if f in request.data])
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(MenuItemImageSerializer(image, context={'request': request}).data)

    def delete(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Menu item ingredient views
# ---------------------------------------------------------------------------

class MenuItemIngredientListCreateView(APIView):
    """
    GET  /api/catalog/menu-items/<pk>/ingredients/  - list ingredients (public).
    POST /api/catalog/menu-items/<pk>/ingredients/  - create an ingredient (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_item(self, pk):
        try:
            return MenuItem.objects.get(pk=pk)
        except MenuItem.DoesNotExist:
            return None

    def get(self, request, pk):
        # System admins may request disabled ingredients too (so the CMS editor
        # can still see/re-enable one it turned off). The resolved flag - not the
        # raw param - scopes the cache key, or an admin response could be replayed
        # to the public.
        disabled_visible = show_disabled(request)
        cache_key = f'catalog:menu_item_ingredients:{pk}:{int(disabled_visible)}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        menu_item = self._get_item(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = menu_item.ingredients.all() if disabled_visible else menu_item.ingredients.filter(enabled=True)
        qs = qs.prefetch_related('options__ingredient')
        data = MenuItemIngredientSerializer(qs, many=True, context={'request': request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        menu_item = self._get_item(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuItemIngredientWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ingredient = serializer.create(serializer.validated_data, menu_item=menu_item)
        _invalidate_pattern(f'catalog:menu_item_ingredients:{pk}:*')
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(MenuItemIngredientSerializer(ingredient, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MenuItemIngredientDetailView(APIView):
    """
    GET    /api/catalog/menu-items/<pk>/ingredients/<ing_pk>/  - retrieve (public).
    PATCH  /api/catalog/menu-items/<pk>/ingredients/<ing_pk>/  - partial update (admin only).
    DELETE /api/catalog/menu-items/<pk>/ingredients/<ing_pk>/  - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk, ing_pk):
        try:
            return MenuItemIngredient.objects.get(pk=ing_pk, menu_item_id=pk)
        except MenuItemIngredient.DoesNotExist:
            return None

    def get(self, request, pk, ing_pk):
        ingredient = self._get_object(pk, ing_pk)
        if ingredient is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(MenuItemIngredientSerializer(ingredient, context={'request': request}).data)

    def patch(self, request, pk, ing_pk):
        ingredient = self._get_object(pk, ing_pk)
        if ingredient is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuItemIngredientWriteSerializer(ingredient, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        ingredient = serializer.update(ingredient, serializer.validated_data)
        _invalidate_pattern(f'catalog:menu_item_ingredients:{pk}:*')
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(MenuItemIngredientSerializer(ingredient, context={'request': request}).data)

    def delete(self, request, pk, ing_pk):
        ingredient = self._get_object(pk, ing_pk)
        if ingredient is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        ingredient.delete()
        _invalidate_pattern(f'catalog:menu_item_ingredients:{pk}:*')
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Recipe view (INTERNAL - admin only for every method, including GET)
# ---------------------------------------------------------------------------

class MenuItemRecipeView(APIView):
    """
    GET /api/catalog/menu-items/<pk>/recipe/  - the internal recipe (admin only).
    PUT /api/catalog/menu-items/<pk>/recipe/  - replace notes + ordered steps (admin only).

    Unlike every other catalog endpoint, GET here is NOT public: a recipe is the
    kitchen's own IP, so it never leaves the admin surface.
    """

    permission_classes = [IsSystemAdmin]

    def _get_item(self, pk):
        try:
            return MenuItem.objects.prefetch_related('recipe_steps').get(pk=pk)
        except MenuItem.DoesNotExist:
            return None

    def get(self, request, pk):
        menu_item = self._get_item(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(MenuItemRecipeSerializer(menu_item, context={'request': request}).data)

    def put(self, request, pk):
        menu_item = self._get_item(pk)
        if menu_item is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MenuItemRecipeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(menu_item)
        cache.delete(f'catalog:menu_item:{pk}')
        _invalidate_pattern('catalog:menu_items:*')
        menu_item = self._get_item(pk)
        return Response(MenuItemRecipeSerializer(menu_item, context={'request': request}).data)


# ---------------------------------------------------------------------------
# Clone views (admin only)
# ---------------------------------------------------------------------------
#
# The CMS's "Clone" button: a deep copy of one catalog record so an operator can
# build a variant of it without re-typing everything. It lives on the server, not
# in the browser, for one reason above the rest - the copy has to duplicate the
# record's *image files*, and a browser could only do that by downloading every
# image and re-uploading it as base64.
#
# The clone is made from what is in the database, so unsaved edits sitting in the
# form are deliberately not part of it (the CMS says so in the confirm dialog).


class _BaseCloneView(APIView):
    """Shared POST handler for the per-resource clone endpoints.

    Subclasses supply the model, the clone function, the read serializer, and the
    cache keys the new row invalidates.
    """

    permission_classes = [IsSystemAdmin]

    model = None
    clone_fn = None
    read_serializer = None

    def _invalidate(self, clone):
        raise NotImplementedError

    def post(self, request, pk):
        source = self.model.objects.filter(pk=pk).first()
        if source is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        name = str(request.data.get('name') or '').strip()
        if not name:
            return Response(
                {'name': ['This field is required.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Blank means "no English name", which is what a null column says. An
        # empty string would render as a real (empty) EN name on the storefront.
        en_name = str(request.data.get('en_name') or '').strip() or None

        clone = type(self).clone_fn(source, name, en_name)
        self._invalidate(clone)
        return Response(
            self.read_serializer(clone, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProductCloneView(_BaseCloneView):
    """POST /api/catalog/products/<pk>/clone/ - deep-copy a product (admin only)."""

    model = Product
    clone_fn = staticmethod(clone_product)
    read_serializer = ProductSerializer

    def _invalidate(self, clone):
        _invalidate_pattern('catalog:products:*')


class ServiceCloneView(_BaseCloneView):
    """POST /api/catalog/services/<pk>/clone/ - deep-copy a service (admin only)."""

    model = Service
    clone_fn = staticmethod(clone_service)
    read_serializer = ServiceSerializer

    def _invalidate(self, clone):
        _invalidate_pattern('catalog:services:*')


class MenuItemCloneView(_BaseCloneView):
    """POST /api/catalog/menu-items/<pk>/clone/ - deep-copy a menu item (admin only)."""

    model = MenuItem
    clone_fn = staticmethod(clone_menu_item)
    read_serializer = MenuItemSerializer

    def _invalidate(self, clone):
        # The clone joins the original's sibling family, and `variants` is
        # symmetrical - so every menu-item detail payload can change, not just
        # the two rows involved.
        _invalidate_pattern('catalog:menu_item:*')
        _invalidate_pattern('catalog:menu_items:*')
