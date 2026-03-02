from django.urls import path

from .views import SystemView

urlpatterns = [
    path("system/", SystemView.as_view(), name="system-detail"),
    path("system/<int:pk>/", SystemView.as_view(), name="system-update"),
]
