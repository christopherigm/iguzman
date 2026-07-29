from django.urls import path

from .views import (
    JournalStatsView,
    SightingDetailView,
    SightingMapView,
    SightingListCreateView,
    SightingMediaDetailView,
    SightingMediaListCreateView,
    SightingVideoUploadView,
)

urlpatterns = [
    path('journal/stats/', JournalStatsView.as_view(), name='journal-stats'),

    path('journal/sightings/', SightingListCreateView.as_view(), name='sighting-list'),
    # Above `<int:pk>/` for the same reason `media/video/` is: a literal segment
    # must never be read as a pk.
    path('journal/sightings/map/', SightingMapView.as_view(), name='sighting-map'),
    path('journal/sightings/<int:pk>/', SightingDetailView.as_view(), name='sighting-detail'),
    path('journal/sightings/slug/<slug:slug>/', SightingDetailView.as_view(), name='sighting-detail-slug'),

    # Gallery. The `video/` upload sits above `<int:media_pk>/` so the literal is
    # never read as a media pk.
    path('journal/sightings/<int:pk>/media/', SightingMediaListCreateView.as_view(), name='sighting-media-list'),
    path('journal/sightings/<int:pk>/media/video/', SightingVideoUploadView.as_view(), name='sighting-media-video'),
    path('journal/sightings/<int:pk>/media/<int:media_pk>/', SightingMediaDetailView.as_view(), name='sighting-media-detail'),
]
