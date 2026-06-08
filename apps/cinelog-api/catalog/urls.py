from django.urls import path

from .views import CategoryListView, MovieDetailView, MovieListView, ScanView

urlpatterns = [
    path('movies/', MovieListView.as_view(), name='movie-list'),
    path('movies/<int:pk>/', MovieDetailView.as_view(), name='movie-detail'),
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('scan/', ScanView.as_view(), name='scan'),
]
