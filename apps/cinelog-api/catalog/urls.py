from django.urls import path

from .views import (
    CategoryListView,
    InboxAcceptView,
    InboxListView,
    InboxRefetchView,
    InboxRejectView,
    InboxSelectView,
    MovieBackdropView,
    MovieDetailView,
    MovieListView,
    MovieOwnView,
    MovieRefetchView,
    MovieSynopsisView,
    MovieTrailerView,
    ScanView,
)

urlpatterns = [
    path('movies/', MovieListView.as_view(), name='movie-list'),
    path('movies/<int:pk>/', MovieDetailView.as_view(), name='movie-detail'),
    path('movies/<int:pk>/backdrop/', MovieBackdropView.as_view(), name='movie-backdrop'),
    path('movies/<int:pk>/synopsis/', MovieSynopsisView.as_view(), name='movie-synopsis'),
    path('movies/<int:pk>/trailer/', MovieTrailerView.as_view(), name='movie-trailer'),
    path('movies/<int:pk>/own/', MovieOwnView.as_view(), name='movie-own'),
    path('movies/<int:pk>/refetch/', MovieRefetchView.as_view(), name='movie-refetch'),
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('scan/', ScanView.as_view(), name='scan'),
    path('inbox/', InboxListView.as_view(), name='inbox-list'),
    path('inbox/<int:pk>/accept/', InboxAcceptView.as_view(), name='inbox-accept'),
    path('inbox/<int:pk>/refetch/', InboxRefetchView.as_view(), name='inbox-refetch'),
    path('inbox/<int:pk>/select/', InboxSelectView.as_view(), name='inbox-select'),
    path('inbox/<int:pk>/reject/', InboxRejectView.as_view(), name='inbox-reject'),
]
