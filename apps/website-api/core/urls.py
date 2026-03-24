from django.urls import path

from .views import (
    CompanyHighlightBySlugView,
    CompanyHighlightDetailView,
    CompanyHighlightItemDetailView,
    CompanyHighlightItemsView,
    CompanyHighlightListView,
    SuccessStoryBySlugView,
    SuccessStoryDetailView,
    SuccessStoryGalleryView,
    SuccessStoryListView,
    SystemListView,
    SystemView,
)

urlpatterns = [
    path("systems/", SystemListView.as_view(), name="system-list"),
    path("system/", SystemView.as_view(), name="system-detail"),
    path("system/<int:pk>/", SystemView.as_view(), name="system-update"),

    path("success-stories/", SuccessStoryListView.as_view(), name="success-story-list"),
    path("success-stories/slug/<slug:slug>/", SuccessStoryBySlugView.as_view(), name="success-story-by-slug"),
    path("success-stories/<int:pk>/", SuccessStoryDetailView.as_view(), name="success-story-detail"),
    path("success-stories/<int:pk>/gallery/", SuccessStoryGalleryView.as_view(), name="success-story-gallery"),
    path("success-stories/<int:pk>/gallery/<int:img_pk>/", SuccessStoryGalleryView.as_view(), name="success-story-gallery-item"),

    path("highlights/", CompanyHighlightListView.as_view(), name="highlight-list"),
    path("highlights/slug/<slug:slug>/", CompanyHighlightBySlugView.as_view(), name="highlight-by-slug"),
    path("highlights/<int:pk>/", CompanyHighlightDetailView.as_view(), name="highlight-detail"),
    path("highlights/<int:pk>/items/", CompanyHighlightItemsView.as_view(), name="highlight-items"),
    path("highlights/<int:pk>/items/<int:item_pk>/", CompanyHighlightItemDetailView.as_view(), name="highlight-item-detail"),
]
