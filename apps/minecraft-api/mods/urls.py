from django.urls import path

from .views import ModDetailView, ModListCreateView

urlpatterns = [
    path('', ModListCreateView.as_view(), name='mod-list-create'),
    path('<int:pk>/', ModDetailView.as_view(), name='mod-detail'),
]
