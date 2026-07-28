from django.urls import path

from .views import (
    CategoryDetailView,
    CategoryListCreateView,
    KindListView,
    LocationDetailView,
    LocationListCreateView,
    SeasonDetailView,
    SeasonListCreateView,
    SpeciesDetailView,
    SpeciesImageDetailView,
    SpeciesImageListCreateView,
    SpeciesListCreateView,
    WeatherConditionDetailView,
    WeatherConditionListCreateView,
)

# Every resource is addressable two ways: by pk (what the CMS holds) and by slug
# (what the public URLs carry). The slug route is spelled `slug/<slug>/` rather
# than a bare `<slug:slug>/` so it can never be confused with a pk - a numeric
# slug would otherwise make the two patterns ambiguous.
urlpatterns = [
    # The five top-level branches
    path('catalog/kinds/', KindListView.as_view(), name='kind-list'),

    # Categories
    path('catalog/categories/', CategoryListCreateView.as_view(), name='category-list'),
    path('catalog/categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),
    path('catalog/categories/slug/<slug:slug>/', CategoryDetailView.as_view(), name='category-detail-slug'),

    # Species
    path('catalog/species/', SpeciesListCreateView.as_view(), name='species-list'),
    path('catalog/species/<int:pk>/', SpeciesDetailView.as_view(), name='species-detail'),
    path('catalog/species/slug/<slug:slug>/', SpeciesDetailView.as_view(), name='species-detail-slug'),

    # Species reference photos
    path('catalog/species/<int:pk>/images/', SpeciesImageListCreateView.as_view(), name='species-image-list'),
    path('catalog/species/<int:pk>/images/<int:img_pk>/', SpeciesImageDetailView.as_view(), name='species-image-detail'),

    # Seasons
    path('catalog/seasons/', SeasonListCreateView.as_view(), name='season-list'),
    path('catalog/seasons/<int:pk>/', SeasonDetailView.as_view(), name='season-detail'),
    path('catalog/seasons/slug/<slug:slug>/', SeasonDetailView.as_view(), name='season-detail-slug'),

    # Weather conditions
    path('catalog/weather-conditions/', WeatherConditionListCreateView.as_view(), name='weather-condition-list'),
    path('catalog/weather-conditions/<int:pk>/', WeatherConditionDetailView.as_view(), name='weather-condition-detail'),
    path('catalog/weather-conditions/slug/<slug:slug>/', WeatherConditionDetailView.as_view(), name='weather-condition-detail-slug'),

    # Locations
    path('catalog/locations/', LocationListCreateView.as_view(), name='location-list'),
    path('catalog/locations/<int:pk>/', LocationDetailView.as_view(), name='location-detail'),
    path('catalog/locations/slug/<slug:slug>/', LocationDetailView.as_view(), name='location-detail-slug'),
]
