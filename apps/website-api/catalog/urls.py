from django.urls import path

from .views import (
    ProductCategoryDetailView,
    ProductCategoryListCreateView,
    ProductDetailView,
    ProductImageDetailView,
    ProductImageListCreateView,
    ProductListCreateView,
    ServiceCategoryListCreateView,
    ServiceCategoryDetailView,
    ServiceListCreateView,
    ServiceDetailView,
)

urlpatterns = [
    # Product categories
    path('catalog/product-categories/', ProductCategoryListCreateView.as_view(), name='product-category-list'),
    path('catalog/product-categories/<int:pk>/', ProductCategoryDetailView.as_view(), name='product-category-detail'),

    # Products
    path('catalog/products/', ProductListCreateView.as_view(), name='product-list'),
    path('catalog/products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),

    # Product images
    path('catalog/products/<int:pk>/images/', ProductImageListCreateView.as_view(), name='product-image-list'),
    path('catalog/products/<int:pk>/images/<int:img_pk>/', ProductImageDetailView.as_view(), name='product-image-detail'),

    # Service categories
    path('catalog/service-categories/', ServiceCategoryListCreateView.as_view(), name='service-category-list'),
    path('catalog/service-categories/<int:pk>/', ServiceCategoryDetailView.as_view(), name='service-category-detail'),

    # Services
    path('catalog/services/', ServiceListCreateView.as_view(), name='service-list'),
    path('catalog/services/<int:pk>/', ServiceDetailView.as_view(), name='service-detail'),
]
