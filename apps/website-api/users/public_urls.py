"""The users app's unauthenticated endpoints.

Kept apart from `users/urls.py` because that module is mounted under
`/api/auth/`, and a path under that prefix reads as "requires a session". These
deliberately do not: an anonymous visitor has a cart and saved items too, and
they are scoped by request host rather than by profile.
"""

from django.urls import path

from .views import GuestResolveView

urlpatterns = [
    path("guest/resolve/", GuestResolveView.as_view(), name="guest-resolve"),
]
