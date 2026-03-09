from django.urls import path

from .views import (
    CategoryDetailView,
    CategoryListCreateView,
    ProductDetailView,
    ProductImageDetailView,
    ProductImageListCreateView,
    ProductListCreateView,
)

urlpatterns = [
    # Categories
    path('catalog/categories/', CategoryListCreateView.as_view(), name='category-list'),
    path('catalog/categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),

    # Products
    path('catalog/products/', ProductListCreateView.as_view(), name='product-list'),
    path('catalog/products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),

    # Product images
    path('catalog/products/<int:pk>/images/', ProductImageListCreateView.as_view(), name='product-image-list'),
    path('catalog/products/<int:pk>/images/<int:img_pk>/', ProductImageDetailView.as_view(), name='product-image-detail'),
]
