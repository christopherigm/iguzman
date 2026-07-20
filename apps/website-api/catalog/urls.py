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
    ServiceImageListCreateView,
    ServiceImageDetailView,
    MenuCategoryListCreateView,
    MenuCategoryDetailView,
    MenuItemListCreateView,
    MenuItemDetailView,
    MenuItemImageListCreateView,
    MenuItemImageDetailView,
    MenuItemIngredientListCreateView,
    MenuItemIngredientDetailView,
    MenuItemRecipeView,
    IngredientListCreateView,
    IngredientDetailView,
    IngredientNutritionLookupView,
    IngredientPriceLookupView,
    ProductCloneView,
    ServiceCloneView,
    MenuItemCloneView,
)

urlpatterns = [
    # Product categories
    path('catalog/product-categories/', ProductCategoryListCreateView.as_view(), name='product-category-list'),
    path('catalog/product-categories/<int:pk>/', ProductCategoryDetailView.as_view(), name='product-category-detail'),

    # Products
    path('catalog/products/', ProductListCreateView.as_view(), name='product-list'),
    path('catalog/products/<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('catalog/products/<int:pk>/clone/', ProductCloneView.as_view(), name='product-clone'),

    # Product images
    path('catalog/products/<int:pk>/images/', ProductImageListCreateView.as_view(), name='product-image-list'),
    path('catalog/products/<int:pk>/images/<int:img_pk>/', ProductImageDetailView.as_view(), name='product-image-detail'),

    # Service categories
    path('catalog/service-categories/', ServiceCategoryListCreateView.as_view(), name='service-category-list'),
    path('catalog/service-categories/<int:pk>/', ServiceCategoryDetailView.as_view(), name='service-category-detail'),

    # Services
    path('catalog/services/', ServiceListCreateView.as_view(), name='service-list'),
    path('catalog/services/<int:pk>/', ServiceDetailView.as_view(), name='service-detail'),
    path('catalog/services/<int:pk>/clone/', ServiceCloneView.as_view(), name='service-clone'),

    # Service images
    path('catalog/services/<int:pk>/images/', ServiceImageListCreateView.as_view(), name='service-image-list'),
    path('catalog/services/<int:pk>/images/<int:img_pk>/', ServiceImageDetailView.as_view(), name='service-image-detail'),

    # Ingredients (reusable, System-scoped catalog referenced by menu items)
    path('catalog/ingredients/', IngredientListCreateView.as_view(), name='ingredient-list'),
    # Static path before <int:pk> so "nutrition-lookup" is never read as a pk.
    path('catalog/ingredients/nutrition-lookup/', IngredientNutritionLookupView.as_view(), name='ingredient-nutrition-lookup'),
    path('catalog/ingredients/price-lookup/', IngredientPriceLookupView.as_view(), name='ingredient-price-lookup'),
    path('catalog/ingredients/<int:pk>/', IngredientDetailView.as_view(), name='ingredient-detail'),

    # Menu categories
    path('catalog/menu-categories/', MenuCategoryListCreateView.as_view(), name='menu-category-list'),
    path('catalog/menu-categories/<int:pk>/', MenuCategoryDetailView.as_view(), name='menu-category-detail'),

    # Menu items
    path('catalog/menu-items/', MenuItemListCreateView.as_view(), name='menu-item-list'),
    path('catalog/menu-items/<int:pk>/', MenuItemDetailView.as_view(), name='menu-item-detail'),
    path('catalog/menu-items/<int:pk>/clone/', MenuItemCloneView.as_view(), name='menu-item-clone'),

    # Menu item images
    path('catalog/menu-items/<int:pk>/images/', MenuItemImageListCreateView.as_view(), name='menu-item-image-list'),
    path('catalog/menu-items/<int:pk>/images/<int:img_pk>/', MenuItemImageDetailView.as_view(), name='menu-item-image-detail'),

    # Menu item ingredients (priced customisation)
    path('catalog/menu-items/<int:pk>/ingredients/', MenuItemIngredientListCreateView.as_view(), name='menu-item-ingredient-list'),
    path('catalog/menu-items/<int:pk>/ingredients/<int:ing_pk>/', MenuItemIngredientDetailView.as_view(), name='menu-item-ingredient-detail'),

    # Menu item recipe (internal, admin only)
    path('catalog/menu-items/<int:pk>/recipe/', MenuItemRecipeView.as_view(), name='menu-item-recipe'),
]
