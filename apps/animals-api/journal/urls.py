from django.urls import path

from .views import (
    JournalStatsView,
    SightingContributeVideoView,
    SightingContributeView,
    SightingDetailView,
    SightingMapView,
    SightingListCreateView,
    SightingMediaDetailView,
    SightingMediaListCreateView,
    SightingVideoProcessingView,
    SightingVideoReserveView,
)

urlpatterns = [
    path('journal/stats/', JournalStatsView.as_view(), name='journal-stats'),

    path('journal/sightings/', SightingListCreateView.as_view(), name='sighting-list'),
    # Above `<int:pk>/` for the same reason `media/video/` is: a literal segment
    # must never be read as a pk.
    path('journal/sightings/map/', SightingMapView.as_view(), name='sighting-map'),
    # The public contribute flow - a literal, so it sits above `<int:pk>/` too.
    path('journal/sightings/contribute/', SightingContributeView.as_view(), name='sighting-contribute'),
    path('journal/sightings/<int:pk>/', SightingDetailView.as_view(), name='sighting-detail'),
    path('journal/sightings/slug/<slug:slug>/', SightingDetailView.as_view(), name='sighting-detail-slug'),

    # Gallery. The `video/` reservation sits above `<int:media_pk>/` so the
    # literal is never read as a media pk.
    path('journal/sightings/<int:pk>/media/', SightingMediaListCreateView.as_view(), name='sighting-media-list'),
    # `video/contribute/` above `video/` - both are literals, but the longer one
    # must be tried first or the prefix swallows it.
    path(
        'journal/sightings/<int:pk>/media/video/contribute/',
        SightingContributeVideoView.as_view(),
        name='sighting-media-video-contribute',
    ),
    path('journal/sightings/<int:pk>/media/video/', SightingVideoReserveView.as_view(), name='sighting-media-video'),
    # The handler's status callback. Below the media detail route's prefix but a
    # distinct literal, and the only endpoint here authenticated by a shared
    # secret rather than a session - see the view.
    path(
        'journal/sightings/<int:pk>/media/<int:media_pk>/processing/',
        SightingVideoProcessingView.as_view(),
        name='sighting-media-processing',
    ),
    path('journal/sightings/<int:pk>/media/<int:media_pk>/', SightingMediaDetailView.as_view(), name='sighting-media-detail'),
]
