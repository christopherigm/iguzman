from django.urls import path

from .views import (
    CoverLetterView,
    JobApplicationDetailView,
    JobApplicationListCreateView,
    TailorApplicationView,
)

urlpatterns = [
    path('', JobApplicationListCreateView.as_view(), name='applications-list'),
    path('<int:pk>/', JobApplicationDetailView.as_view(), name='application-detail'),
    path('<int:pk>/tailor/', TailorApplicationView.as_view(), name='application-tailor'),
    path('<int:pk>/cover-letter/', CoverLetterView.as_view(), name='application-cover-letter'),
]
