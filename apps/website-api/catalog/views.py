from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Product, ProductImage
from .serializers import (
    CategorySerializer,
    CategoryWriteSerializer,
    ProductSerializer,
    ProductWriteSerializer,
    ProductImageSerializer,
    ProductImageWriteSerializer,
)


class CategoryListCreateView(APIView):
    """
    GET  /api/catalog/categories/   — list categories (public).
    POST /api/catalog/categories/   — create a category (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
        qs = Category.objects.filter(enabled=True)

        system_id = request.query_params.get('system')
        if system_id:
            qs = qs.filter(system_id=system_id)

        parent_id = request.query_params.get('parent')
        if parent_id == 'null':
            qs = qs.filter(parent__isnull=True)
        elif parent_id:
            qs = qs.filter(parent_id=parent_id)

        serializer = CategorySerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        serializer = CategoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(CategorySerializer(category, context={'request': request}).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    """
    GET    /api/catalog/categories/<pk>/  — retrieve (public).
    PATCH  /api/catalog/categories/<pk>/  — partial update (admin only).
    DELETE /api/catalog/categories/<pk>/  — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def _get_object(self, pk):
        try:
            return Category.objects.get(pk=pk)
        except Category.DoesNotExist:
            return None

    def get(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(CategorySerializer(category, context={'request': request}).data)

    def patch(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CategoryWriteSerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(CategorySerializer(category, context={'request': request}).data)

    def delete(self, request, pk):
        category = self._get_object(pk)
        if category is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        category.delete()
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
        return [IsAdminUser()]

    def get(self, request):
        qs = Product.objects.filter(enabled=True).select_related('brand', 'category', 'system').prefetch_related('images')

        system_id = request.query_params.get('system')
        if system_id:
            qs = qs.filter(system_id=system_id)

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

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)

        serializer = ProductSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

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
        return [IsAdminUser()]

    def _get_object(self, pk):
        try:
            return Product.objects.select_related('brand', 'category', 'system').prefetch_related('images').get(pk=pk)
        except Product.DoesNotExist:
            return None

    def get(self, request, pk):
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProductSerializer(product, context={'request': request}).data)

    def patch(self, request, pk):
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductWriteSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        product = serializer.update(product, serializer.validated_data)
        return Response(ProductSerializer(product, context={'request': request}).data)

    def delete(self, request, pk):
        product = self._get_object(pk)
        if product is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductImageListCreateView(APIView):
    """
    GET  /api/catalog/products/<pk>/images/  — list product images (public).
    POST /api/catalog/products/<pk>/images/  — add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

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
        return Response(ProductImageSerializer(image, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProductImageDetailView(APIView):
    """
    DELETE /api/catalog/products/<pk>/images/<img_pk>/  — remove an image (admin only).
    PATCH  /api/catalog/products/<pk>/images/<img_pk>/  — update sort_order / name (admin only).
    """

    permission_classes = [IsAdminUser]

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
        return Response(ProductImageSerializer(image, context={'request': request}).data)

    def delete(self, request, pk, img_pk):
        image = self._get_image(pk, img_pk)
        if image is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
