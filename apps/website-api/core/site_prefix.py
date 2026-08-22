"""The per-site namespace every globally-unique slug in the catalog carries.

Eleven models hang a ``slug = SlugField(unique=True)`` off one shared database
(`Product`, `Service`, `MenuItem`, `Ingredient`, their three categories, plus
`Brand`, `SuccessStory`, `CompanyHighlight` and `Event`), and this is a
multi-tenant install: without a namespace, the first tenant to sell a "Latte"
takes that slug away from every other tenant on the box.

``System.site_prefix`` is that namespace, and it is the **only** one. Three
different conventions used to be in play - the CMS built ``{system_id}-{name}``
(`lib/slug-utils.ts`), `catalog.services.clone` mirrored it, and
`seed_site` built ``{slugify(host)}-{name}`` - so the same dish arrived with a
different slug depending on which door it came through. All three now read this
column.

⚠ **Users are deliberately not namespaced by it.** `users.build_username`
composes a login from ``(system_id, email)``, and a login is not a URL: it is
matched exactly, never typed off a poster, and re-deriving it would sign every
existing customer out of their account. Coupons are not namespaced either -
``Coupon.code`` is already unique *per system* (the ``coupon_code_unique_per_system``
constraint) and ``orders.services.coupons.find_coupon`` filters by system, so
two tenants can both run "SUMMER20" with no collision. Prefixing it would only
lengthen what a customer types off a printed flyer.
"""

from django.utils.text import slugify

#: Matches ``System.site_prefix``'s column width. Kept short on purpose: it is
#: repeated at the head of every slug on the site, so a long one shows up in
#: every URL the tenant ever prints.
MAX_PREFIX_LENGTH = 32


def default_prefix_for_host(host: str) -> str:
    """The prefix a site starts life with, derived from its own hostname.

    The **first label only** - ``javastop.com.mx`` becomes ``javastop``, not
    ``javastop-com-mx``. The TLD says nothing a reader of the URL needs, and
    the prefix is repeated in front of every slug on the site.

    A port is stripped (``127.0.0.1:3000``), because a dev host carries one and
    it is not part of the site's identity. An IP address slugifies to its
    octets, which is meaningless but stable, so ``127.0.0.1`` yields ``127``
    and the caller's uniqueness pass gives it a suffix if that is taken.
    """
    label = (host or "").strip().lower().split(":")[0].split(".")[0]
    return slugify(label)[:MAX_PREFIX_LENGTH] or "site"


def unique_prefix(candidate: str, *, exclude_pk=None) -> str:
    """`candidate`, suffixed until no other System holds it.

    The column is ``unique=True`` precisely so two tenants cannot share a
    namespace and start colliding again - so a second ``shop.example.com``
    alongside ``shop.example.net`` becomes ``shop-2`` rather than an
    IntegrityError thrown at whoever happened to save second.
    """
    from core.models import System

    base = (slugify(candidate)[:MAX_PREFIX_LENGTH] or "site")
    value = base
    suffix = 2
    while True:
        taken = System.objects.filter(site_prefix=value)
        if exclude_pk is not None:
            taken = taken.exclude(pk=exclude_pk)
        if not taken.exists():
            return value
        # Trim the base so base+suffix still fits the column, rather than
        # letting the suffix be silently cut off - which would produce the same
        # truncated string on every iteration and loop forever.
        tail = f"-{suffix}"
        value = f"{base[: MAX_PREFIX_LENGTH - len(tail)]}{tail}"
        suffix += 1
