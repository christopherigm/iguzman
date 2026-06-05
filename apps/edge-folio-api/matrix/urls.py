from django.urls import path

from .views import (
    BulletPointDetailView,
    BulletPointListCreateView,
    BulletReorderView,
    SkillDetailView,
    SkillListCreateView,
)

urlpatterns = [
    path('skills/', SkillListCreateView.as_view(), name='matrix-skills'),
    path('skills/<int:pk>/', SkillDetailView.as_view(), name='matrix-skill-detail'),
    path('bullets/', BulletPointListCreateView.as_view(), name='matrix-bullets'),
    path('bullets/reorder/', BulletReorderView.as_view(), name='matrix-bullets-reorder'),
    path('bullets/<int:pk>/', BulletPointDetailView.as_view(), name='matrix-bullet-detail'),
]
