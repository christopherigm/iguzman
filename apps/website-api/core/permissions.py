from rest_framework.permissions import BasePermission


class IsSystemAdmin(BasePermission):
    """Allow access only to users with is_admin=True on their UserProfile."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        try:
            return bool(request.user.profile.is_admin)
        except Exception:
            return False
