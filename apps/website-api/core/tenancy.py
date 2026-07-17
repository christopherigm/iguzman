"""Which tenant a request belongs to.

Lives here rather than in any one app because users, orders and anything else
user-scoped must agree on the answer - and must all take it from the same place.
"""


def user_system(request):
    """The tenant this user belongs to, or None.

    The System is taken from the profile (set at signup), never from anything the
    browser sends. That is the whole point: it is what stops a crafted id from
    reaching another customer's catalog, cart, or orders.
    """
    try:
        return request.user.profile.system
    except Exception:
        return None
