from rest_framework.permissions import BasePermission


def is_site_admin(user) -> bool:
    """Whether ``user`` may edit the site: the CMS flag, or Django staff.

    **The one place this is decided.** The JWT claim (``users.serializers``), the
    profile payload and ``IsSiteAdmin`` below all call this, so what the frontend
    renders and what the API enforces can never drift apart.

    ``UserProfile.is_admin`` opens the Next.js CMS at ``/admin`` and the write
    API. ``is_staff`` opens the Django admin on this backend, and is treated as
    implying the first: whoever may edit a row in Django may edit it through the
    CMS, and without this every account that authored this site before the flag
    existed would have lost write access the moment it landed.
    """
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_staff', False):
        return True
    profile = getattr(user, 'profile', None)
    return bool(profile is not None and profile.is_admin)


class IsSiteAdmin(BasePermission):
    """Allow writes to site administrators and to Django staff.

    Replaces the original ``IsStaffUser``: the CMS moved out of the Django admin
    and into ``apps/animals``' own ``/admin`` section, so authoring no longer
    implies an account inside Django. Every read endpoint stays public.
    """

    def has_permission(self, request, view):
        return is_site_admin(getattr(request, 'user', None))


class IsStaffUser(BasePermission):
    """Allow only Django staff - the platform operator, not the site's authors.

    Reserved for the few things that are genuinely operator-only. Everything an
    author does goes through ``IsSiteAdmin`` above.
    """

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
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
    return is_site_admin(getattr(request, 'user', None))
