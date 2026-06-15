from django.urls import path

from .views import (
    JobFeedView,
    SaveJobView,
    UserApiCredentialDetailView,
    UserApiCredentialListCreateView,
)

urlpatterns = [
    path('feed/', JobFeedView.as_view(), name='jobs-feed'),
    path('credentials/', UserApiCredentialListCreateView.as_view(), name='jobs-credentials'),
    path('credentials/<int:pk>/', UserApiCredentialDetailView.as_view(), name='jobs-credential-detail'),
    path('<int:pk>/save/', SaveJobView.as_view(), name='jobs-save'),
]
