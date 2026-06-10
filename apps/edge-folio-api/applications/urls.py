from django.urls import path

from .views import (
    CoverLetterView,
    JobApplicationDetailView,
    JobApplicationListCreateView,
    NaftaLetterView,
    RefreshMetricsView,
    SearchCompanyView,
    TailorApplicationView,
)

urlpatterns = [
    path('', JobApplicationListCreateView.as_view(), name='applications-list'),
    path('<int:pk>/', JobApplicationDetailView.as_view(), name='application-detail'),
    path('<int:pk>/tailor/', TailorApplicationView.as_view(), name='application-tailor'),
    path('<int:pk>/cover-letter/', CoverLetterView.as_view(), name='application-cover-letter'),
    path('<int:pk>/nafta-letter/', NaftaLetterView.as_view(), name='application-nafta-letter'),
    path('<int:pk>/metrics/', RefreshMetricsView.as_view(), name='application-metrics'),
    path('<int:pk>/search-company/', SearchCompanyView.as_view(), name='application-search-company'),
]
