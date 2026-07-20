"""Which tenant a request belongs to.

Lives here rather than in any one app because users, orders and anything else
user-scoped must agree on the answer - and must all take it from the same place.
"""


def profile_system(user):
    """The tenant this user account belongs to, or None.

    Takes the user rather than a request, for the paths that have one without the
    other - email verification runs off a token, not a session.
    """
    try:
        return user.profile.system
    except Exception:
        return None


def user_system(request):
    """The tenant this user belongs to, or None.

    The System is taken from the profile (set at signup), never from anything the
    browser sends. That is the whole point: it is what stops a crafted id from
    reaching another customer's catalog, cart, or orders.
    """
    return profile_system(getattr(request, "user", None))


def host_system(request):
    """The tenant this *request* was addressed to, or None.

    The host is the only thing an anonymous visitor can be scoped by - they have
    no profile to read a System off. It is the same resolution every public
    catalog endpoint already uses (`X-Website-Host`, forwarded by the Next.js SSR
    layer, else the real Host header), so a guest's cart is scoped exactly like
    the catalog they picked it from.

    A client can set `X-Website-Host`, so this only ever *narrows* what is
    already public: it picks which tenant's published catalog to read. Never use
    it for anything the browser must not choose - redirect targets
    (`_site_base_url`) and a signed-in user's tenancy both stay on `user_system`.
    """
    from .models import System

    host = (
        request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
    ).split(":")[0]
    return System.objects.filter(host=host, enabled=True).first()


def request_system(request):
    """The tenant to scope this request to, signed in or not.

    A signed-in user is always scoped by their profile, never by the host they
    happen to be on - otherwise a crafted `X-Website-Host` would let an account
    reach another tenant's catalog through its own cart. Only an anonymous
    caller, who has no profile, falls back to the host.
    """
    if request.user.is_authenticated:
        return user_system(request)
    return host_system(request)
