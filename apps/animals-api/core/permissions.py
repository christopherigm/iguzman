from rest_framework.permissions import BasePermission


class IsStaffUser(BasePermission):
    """Allow writes only to Django staff accounts.

    Unlike website-api there is no ``UserProfile.is_admin`` here: this is a
    single-site journal with one author, and the Django admin at ``/admin/`` is
    the CMS. ``is_staff`` is therefore the authoring role - whoever may edit in
    the admin may edit through the API, and nobody else. Every read endpoint is
    public.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and user.is_staff)


def show_disabled(request):
    """Whether this request may see records with ``enabled=False``.

    The list endpoints are ``AllowAny`` on GET and feed the public site, so the
    query param alone is never enough: an anonymous caller passing
    ``?include_disabled=true`` still gets enabled-only records. Callers must feed
    the **return value** - not the raw param - into their cache key, or a staff
    response containing unpublished drafts can be replayed to the public.
    """
    if request.query_params.get("include_disabled") != "true":
        return False
    return IsStaffUser().has_permission(request, None)
