from django.urls import path

from .views import (
    CategoryDetailView,
    CategoryImageDetailView,
    CategoryImageListCreateView,
    CategoryListCreateView,
    CountryDetailView,
    CountryListCreateView,
    CountyDetailView,
    CountyListCreateView,
    KindListView,
    LocationDetailView,
    LocationImageDetailView,
    LocationImageListCreateView,
    LocationListCreateView,
    SeasonDetailView,
    SeasonImageDetailView,
    SeasonImageListCreateView,
    SeasonListCreateView,
    SpeciesContributeView,
    SpeciesDetailView,
    SpeciesImageDetailView,
    SpeciesImageListCreateView,
    SpeciesListCreateView,
    StateDetailView,
    StateListCreateView,
    WeatherConditionDetailView,
    WeatherConditionImageDetailView,
    WeatherConditionImageListCreateView,
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
    path('catalog/categories/<int:pk>/images/', CategoryImageListCreateView.as_view(), name='category-image-list'),
    path('catalog/categories/<int:pk>/images/<int:img_pk>/', CategoryImageDetailView.as_view(), name='category-image-detail'),

    # Species
    path('catalog/species/', SpeciesListCreateView.as_view(), name='species-list'),
    # The public contribute flow. Above `<int:pk>/` so the literal is never read
    # as a pk, exactly like `slug/` below and the journal's `map/`.
    path('catalog/species/contribute/', SpeciesContributeView.as_view(), name='species-contribute'),
    path('catalog/species/<int:pk>/', SpeciesDetailView.as_view(), name='species-detail'),
    path('catalog/species/slug/<slug:slug>/', SpeciesDetailView.as_view(), name='species-detail-slug'),

    # Species photos. Every record's gallery hangs off its own URL the same way -
    # the first row is that record's main image, so the order these are POSTed
    # and re-ordered in is what picks the cover.
    path('catalog/species/<int:pk>/images/', SpeciesImageListCreateView.as_view(), name='species-image-list'),
    path('catalog/species/<int:pk>/images/<int:img_pk>/', SpeciesImageDetailView.as_view(), name='species-image-detail'),

    # Seasons
    path('catalog/seasons/', SeasonListCreateView.as_view(), name='season-list'),
    path('catalog/seasons/<int:pk>/', SeasonDetailView.as_view(), name='season-detail'),
    path('catalog/seasons/slug/<slug:slug>/', SeasonDetailView.as_view(), name='season-detail-slug'),
    path('catalog/seasons/<int:pk>/images/', SeasonImageListCreateView.as_view(), name='season-image-list'),
    path('catalog/seasons/<int:pk>/images/<int:img_pk>/', SeasonImageDetailView.as_view(), name='season-image-detail'),

    # Weather conditions
    path('catalog/weather-conditions/', WeatherConditionListCreateView.as_view(), name='weather-condition-list'),
    path('catalog/weather-conditions/<int:pk>/', WeatherConditionDetailView.as_view(), name='weather-condition-detail'),
    path('catalog/weather-conditions/slug/<slug:slug>/', WeatherConditionDetailView.as_view(), name='weather-condition-detail-slug'),
    path('catalog/weather-conditions/<int:pk>/images/', WeatherConditionImageListCreateView.as_view(), name='weather-condition-image-list'),
    path('catalog/weather-conditions/<int:pk>/images/<int:img_pk>/', WeatherConditionImageDetailView.as_view(), name='weather-condition-image-detail'),

    # Geography, top down. No `/images/` pair on any of the three: they are
    # lookup tables, not picture models - a state has a name and nothing else to
    # show.
    path('catalog/countries/', CountryListCreateView.as_view(), name='country-list'),
    path('catalog/countries/<int:pk>/', CountryDetailView.as_view(), name='country-detail'),
    path('catalog/countries/slug/<slug:slug>/', CountryDetailView.as_view(), name='country-detail-slug'),

    path('catalog/states/', StateListCreateView.as_view(), name='state-list'),
    path('catalog/states/<int:pk>/', StateDetailView.as_view(), name='state-detail'),
    path('catalog/states/slug/<slug:slug>/', StateDetailView.as_view(), name='state-detail-slug'),

    path('catalog/counties/', CountyListCreateView.as_view(), name='county-list'),
    path('catalog/counties/<int:pk>/', CountyDetailView.as_view(), name='county-detail'),
    path('catalog/counties/slug/<slug:slug>/', CountyDetailView.as_view(), name='county-detail-slug'),

    # Locations
    path('catalog/locations/', LocationListCreateView.as_view(), name='location-list'),
    path('catalog/locations/<int:pk>/', LocationDetailView.as_view(), name='location-detail'),
    path('catalog/locations/slug/<slug:slug>/', LocationDetailView.as_view(), name='location-detail-slug'),
    path('catalog/locations/<int:pk>/images/', LocationImageListCreateView.as_view(), name='location-image-list'),
    path('catalog/locations/<int:pk>/images/<int:img_pk>/', LocationImageDetailView.as_view(), name='location-image-detail'),
]
