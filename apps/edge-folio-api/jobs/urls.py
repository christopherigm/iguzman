from django.urls import path

from .views import (
    DeleteJobView,
    FetchJobsView,
    JobFeedView,
    JobSearchListView,
    SaveJobView,
    UserApiCredentialDetailView,
    UserApiCredentialListCreateView,
)

urlpatterns = [
    path('feed/', JobFeedView.as_view(), name='jobs-feed'),
    path('fetch/', FetchJobsView.as_view(), name='jobs-fetch'),
    path('searches/', JobSearchListView.as_view(), name='jobs-searches'),
    path('credentials/', UserApiCredentialListCreateView.as_view(), name='jobs-credentials'),
    path('credentials/<int:pk>/', UserApiCredentialDetailView.as_view(), name='jobs-credential-detail'),
    path('<int:pk>/save/', SaveJobView.as_view(), name='jobs-save'),
    path('<int:pk>/delete/', DeleteJobView.as_view(), name='jobs-delete'),
]
