from django.urls import path

from .views import (
    EducationDetailView,
    EducationListCreateView,
    LanguageDetailView,
    LanguageListCreateView,
    ProjectDetailView,
    ProjectListCreateView,
    TechStackListCreateView,
    TechStackPopularView,
    WorkExperienceDetailView,
    WorkExperienceListCreateView,
)

urlpatterns = [
    path('work-experience/', WorkExperienceListCreateView.as_view(), name='work-experience-list'),
    path('work-experience/<int:pk>/', WorkExperienceDetailView.as_view(), name='work-experience-detail'),
    path('education/', EducationListCreateView.as_view(), name='education-list'),
    path('education/<int:pk>/', EducationDetailView.as_view(), name='education-detail'),
    path('languages/', LanguageListCreateView.as_view(), name='language-list'),
    path('languages/<int:pk>/', LanguageDetailView.as_view(), name='language-detail'),
    path('projects/', ProjectListCreateView.as_view(), name='project-list'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='project-detail'),
    path('tech-stack/', TechStackListCreateView.as_view(), name='tech-stack-list'),
    path('tech-stack/popular/', TechStackPopularView.as_view(), name='tech-stack-popular'),
]
