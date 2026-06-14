from django.urls import path

from .views import (
    CategoryListView,
    InboxAcceptView,
    InboxListView,
    InboxRejectView,
    MovieDetailView,
    MovieListView,
    ScanView,
)

urlpatterns = [
    path('movies/', MovieListView.as_view(), name='movie-list'),
    path('movies/<int:pk>/', MovieDetailView.as_view(), name='movie-detail'),
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('scan/', ScanView.as_view(), name='scan'),
    path('inbox/', InboxListView.as_view(), name='inbox-list'),
    path('inbox/<int:pk>/accept/', InboxAcceptView.as_view(), name='inbox-accept'),
    path('inbox/<int:pk>/reject/', InboxRejectView.as_view(), name='inbox-reject'),
]
