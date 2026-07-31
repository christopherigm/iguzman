"""
Generic cached list/detail views.

website-api spells every one of these out per model, which is why its
``catalog/views.py`` is 1,400 lines of the same eight methods. The caching
contract there is uniform enough to factor out, so it is factored out here: a
concrete view names its model, its two serializers and its cache prefixes, and
overrides ``filter_queryset`` when it has query params of its own.

The contract every subclass inherits (see also website-api's CLAUDE.md
"Caching Rule", which these implement):

* **GET is public, writes are admin-only.** Nothing here is per-user, which is
  what makes a single shared cache entry per key correct.
* **Every cached response's key carries the resolved disabled-visibility** - a
  list's on top of its query params, a detail's on top of its pk or slug - and
  never the raw ``include_disabled`` param, or a staff response containing
  unpublished drafts would be replayed to the public. A draft is addressable by
  an administrator (that is how the CMS opens its edit form), so this matters on
  the detail route too, not only on the lists.
* **A write invalidates its own list namespace and its own detail keys.**
  Note this covers only writes that came through *this view*; the authoring
  surface here is the Django admin, whose saves never reach it. The receivers in
  each app's ``signals.py`` are what actually keep the cache honest - they cover
  the admin, cascades and the shell as well - and they clear the same namespaces,
  so what happens here is deliberate belt-and-braces for a model that has no
  receivers yet.
* **Nothing is cached at all when ``API_CACHE_ENABLED`` is off** (the development
  default) - every read goes through ``core.cache.cached_get``/``cached_set``,
  never ``cache`` directly, which is what makes that switch total.
"""

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .cache import CACHE_TTL, cached_get, cached_set, invalidate
from .permissions import IsSiteAdmin, show_disabled

__all__ = [
    'CACHE_TTL',
    'CachedDetailView',
    'CachedListCreateView',
    'CachedViewMixin',
    'MAX_PAGE_SIZE',
    'list_key',
]

# Cap on how many rows one paginated request may ask for, so a `?limit=100000`
# cannot turn a feed endpoint into a full-table serialize.
MAX_PAGE_SIZE = 100


def list_key(prefix, params):
    """Stable cache key for a list endpoint from its query params."""
    flat = '&'.join(f'{k}={v}' for k, v in sorted(params.items()))
    return f'{prefix}:{flat}' if flat else prefix


class CachedViewMixin:
    """Permissions, querysets and cache-key helpers shared by both base views."""

    model = None
    serializer_class = None
    write_serializer_class = None
    list_cache_prefix = ''
    detail_cache_prefix = ''
    select_related = ()
    prefetch_related = ()

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [AllowAny()]
        return [IsSiteAdmin()]

    def base_queryset(self):
        qs = self.model.objects.all()
        if self.select_related:
            qs = qs.select_related(*self.select_related)
        if self.prefetch_related:
            qs = qs.prefetch_related(*self.prefetch_related)
        return qs

    def invalidate_detail(self, instance=None, pk=None, slug=None):
        # The whole namespace, not the one pk/slug this write touched: a PATCH
        # can *rename* a row, and the entry under its previous slug would
        # otherwise outlive it. The arguments are kept for call-site clarity.
        if self.detail_cache_prefix:
            invalidate(self.detail_cache_prefix)

    def invalidate_list(self):
        if self.list_cache_prefix:
            invalidate(self.list_cache_prefix)


class CachedListCreateView(CachedViewMixin, APIView):
    """GET a filtered, cached list; POST a new row (staff only).

    Set ``paginate = True`` to return ``{count, limit, offset, results}`` instead
    of a bare list - for feeds that grow without bound.

    Set ``paginate_on_request = True`` instead to answer that envelope **only when
    the caller asks for a page** (``?limit=`` / ``?offset=``), and a bare list to
    everyone else. That is for a list that is not a growing feed but has outgrown
    one response for *some* callers: the CMS's species table asks for 50 rows and
    a search term, while the public grids still read the whole category in one
    request and must not have their payload shape changed underneath them.
    """

    paginate = False
    paginate_on_request = False
    default_page_size = 20

    def filter_queryset(self, qs, request):
        """Apply the endpoint's own query params. Override in the subclass."""
        return qs

    def get(self, request):
        disabled_visible = show_disabled(request)
        params = {k: v for k, v in request.query_params.items() if k != 'include_disabled'}
        if disabled_visible:
            params['include_disabled'] = '1'
        cache_key = list_key(self.list_cache_prefix, params)

        cached = cached_get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = self.base_queryset()
        if not disabled_visible:
            qs = qs.filter(enabled=True)
        qs = self.filter_queryset(qs, request)

        # The two ways in are the same envelope; what differs is only whether the
        # endpoint always answers with it or waits to be asked. Note the cache key
        # already carries `limit`/`offset` (they are query params like any other),
        # so a paged response and a bare one never share an entry.
        page_requested = self.paginate_on_request and (
            'limit' in request.query_params or 'offset' in request.query_params
        )
        if self.paginate or page_requested:
            data = self._paginated(qs, request)
        else:
            data = self.serializer_class(qs, many=True, context={'request': request}).data

        cached_set(cache_key, data)
        return Response(data)

    def _paginated(self, qs, request):
        try:
            limit = int(request.query_params.get('limit', self.default_page_size))
        except (TypeError, ValueError):
            limit = self.default_page_size
        try:
            offset = int(request.query_params.get('offset', 0))
        except (TypeError, ValueError):
            offset = 0
        limit = max(1, min(limit, MAX_PAGE_SIZE))
        offset = max(0, offset)

        # One COUNT and one page - never `len(qs)`, which would pull every row
        # into memory just to size the feed.
        count = qs.count()
        page = qs[offset:offset + limit]
        results = self.serializer_class(page, many=True, context={'request': request}).data
        return {
            'count': count,
            'limit': limit,
            'offset': offset,
            'results': results,
        }

    def post(self, request):
        serializer = self.write_serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        self.invalidate_list()
        self.invalidate_detail(instance)
        return Response(
            self.serializer_class(instance, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class CachedDetailView(CachedViewMixin, APIView):
    """GET/PATCH/DELETE one row, addressed by either pk or slug.

    The slug route is what the public site uses (``/species/white-tailed-deer``);
    the pk route is what the admin CMS uses. Both are cached, under distinct keys.
    """

    def _lookup(self, pk=None, slug=None):
        qs = self.base_queryset()
        try:
            return qs.get(pk=pk) if pk is not None else qs.get(slug=slug)
        except self.model.DoesNotExist:
            return None

    def _cache_key(self, pk=None, slug=None, disabled_visible=False):
        # The resolved disabled-visibility is part of the key for the same reason
        # it is on the list endpoints: an administrator's read of an unpublished
        # draft must never be replayed to the next anonymous caller from the same
        # entry. It is the *resolved* value, never the raw param.
        suffix = ':staff' if disabled_visible else ''
        if pk is not None:
            return f'{self.detail_cache_prefix}:{pk}{suffix}'
        return f'{self.detail_cache_prefix}:slug:{slug}{suffix}'

    def get(self, request, pk=None, slug=None):
        disabled_visible = show_disabled(request)
        cache_key = self._cache_key(pk, slug, disabled_visible)
        cached = cached_get(cache_key)
        if cached is not None:
            return Response(cached)

        instance = self._lookup(pk, slug)
        if instance is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        # A disabled row is a draft: addressable by staff (who reach it from the
        # CMS with `?include_disabled=true`), invisible to everyone else.
        if not instance.enabled and not disabled_visible:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = self.serializer_class(instance, context={'request': request}).data
        cached_set(cache_key, data)
        return Response(data)

    def patch(self, request, pk=None, slug=None):
        instance = self._lookup(pk, slug)
        if instance is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        previous_slug = getattr(instance, 'slug', None)

        serializer = self.write_serializer_class(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        self.invalidate_detail(instance)
        self.invalidate_detail(pk=instance.pk, slug=previous_slug)
        self.invalidate_list()
        return Response(self.serializer_class(instance, context={'request': request}).data)

    def delete(self, request, pk=None, slug=None):
        instance = self._lookup(pk, slug)
        if instance is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        identity = (instance.pk, getattr(instance, 'slug', None))
        try:
            instance.delete()
        except ProtectedError:
            # A PROTECT'ed FK still points here (a species with sightings, a
            # category with species). Say which, rather than returning a 500.
            return Response(
                {'detail': f'This {self.model._meta.verbose_name} is still referenced '
                           f'by other records and cannot be deleted.'},
                status=status.HTTP_409_CONFLICT,
            )
        self.invalidate_detail(pk=identity[0], slug=identity[1])
        self.invalidate_list()
        return Response(status=status.HTTP_204_NO_CONTENT)
