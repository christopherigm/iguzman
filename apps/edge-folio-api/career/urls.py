from django.urls import path

from .views import (
    EducationDetailView,
    EducationListCreateView,
    WorkExperienceDetailView,
    WorkExperienceListCreateView,
)

urlpatterns = [
    path('work-experience/', WorkExperienceListCreateView.as_view(), name='work-experience-list'),
    path('work-experience/<int:pk>/', WorkExperienceDetailView.as_view(), name='work-experience-detail'),
    path('education/', EducationListCreateView.as_view(), name='education-list'),
    path('education/<int:pk>/', EducationDetailView.as_view(), name='education-detail'),
]
