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
    VariantOptionListCreateView,
    VariantOptionDetailView,
    VariantOptionValueListCreateView,
    VariantOptionValueDetailView,
    ProductVariantListCreateView,
    ProductVariantDetailView,
    ProductVariantImageListCreateView,
    ProductVariantImageDetailView,
    ServiceVariantListCreateView,
    ServiceVariantDetailView,
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

    # Product variants
    path('catalog/products/<int:pk>/variants/', ProductVariantListCreateView.as_view(), name='product-variant-list'),
    path('catalog/products/<int:pk>/variants/<int:var_pk>/', ProductVariantDetailView.as_view(), name='product-variant-detail'),
    path('catalog/products/<int:pk>/variants/<int:var_pk>/images/', ProductVariantImageListCreateView.as_view(), name='product-variant-image-list'),
    path('catalog/products/<int:pk>/variants/<int:var_pk>/images/<int:img_pk>/', ProductVariantImageDetailView.as_view(), name='product-variant-image-detail'),

    # Service categories
    path('catalog/service-categories/', ServiceCategoryListCreateView.as_view(), name='service-category-list'),
    path('catalog/service-categories/<int:pk>/', ServiceCategoryDetailView.as_view(), name='service-category-detail'),

    # Services
    path('catalog/services/', ServiceListCreateView.as_view(), name='service-list'),
    path('catalog/services/<int:pk>/', ServiceDetailView.as_view(), name='service-detail'),

    # Service variants
    path('catalog/services/<int:pk>/variants/', ServiceVariantListCreateView.as_view(), name='service-variant-list'),
    path('catalog/services/<int:pk>/variants/<int:var_pk>/', ServiceVariantDetailView.as_view(), name='service-variant-detail'),

    # Variant options (shared dimension definitions)
    path('catalog/variant-options/', VariantOptionListCreateView.as_view(), name='variant-option-list'),
    path('catalog/variant-options/<int:pk>/', VariantOptionDetailView.as_view(), name='variant-option-detail'),
    path('catalog/variant-options/<int:pk>/values/', VariantOptionValueListCreateView.as_view(), name='variant-option-value-list'),
    path('catalog/variant-options/<int:pk>/values/<int:val_pk>/', VariantOptionValueDetailView.as_view(), name='variant-option-value-detail'),
]
