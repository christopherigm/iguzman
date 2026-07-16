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


def show_disabled(request):
    """Whether this request may see records with enabled=False.

    The list endpoints are public (AllowAny GET) and also feed the customer-facing
    site, so the query param alone is never enough: an anonymous caller passing
    ?include_disabled=true still gets enabled-only records. Callers must feed the
    return value - not the raw param - into their cache key, or an admin's response
    can be replayed to the public.
    """
    if request.query_params.get("include_disabled") != "true":
        return False
    return IsSystemAdmin().has_permission(request, None)
