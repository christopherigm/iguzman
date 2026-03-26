from django.core.cache import cache

from rest_framework import status
from rest_framework.authentication import BasicAuthentication
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsSystemAdmin
from .models import Brand, CompanyHighlight, CompanyHighlightItem, SuccessStory, SuccessStoryImage, System
from .serializers import (
    BrandSerializer,
    BrandWriteSerializer,
    CompanyHighlightItemSerializer,
    CompanyHighlightItemWriteSerializer,
    CompanyHighlightSerializer,
    CompanyHighlightWriteSerializer,
    SuccessStoryImageSerializer,
    SuccessStoryImageWriteSerializer,
    SuccessStorySerializer,
    SuccessStoryWriteSerializer,
    SystemSerializer,
    SystemWriteSerializer,
)

SYSTEM_CACHE_TTL = 3600  # 1 hour
CACHE_TTL = 300  # 5 minutes


def _invalidate_pattern(pattern):
    """Delete all keys matching a glob pattern (Redis only; silently skipped on LocMemCache)."""
    try:
        cache.delete_pattern(pattern)
    except AttributeError:
        pass


class SystemListView(APIView):
    """GET /api/systems/ — list all enabled System records (admin only).

    Uses BasicAuthentication so deployment scripts can authenticate without
    a per-tenant JWT flow.
    """

    authentication_classes = [BasicAuthentication]
    permission_classes = [IsAdminUser]

    def get(self, request):
        systems = System.objects.filter(enabled=True).values("id", "site_name", "host")
        return Response(list(systems))


class SystemView(APIView):
    """
    GET  /api/system/          — returns the System record matching the request host (public).
    PATCH /api/system/<pk>/   — partial update of a System record (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request, pk=None):
        if pk is not None:
            cache_key = f"system:pk:{pk}"
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            try:
                instance = System.objects.get(pk=pk)
            except System.DoesNotExist:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            data = SystemSerializer(instance, context={"request": request}).data
            cache.set(cache_key, data, SYSTEM_CACHE_TTL)
            return Response(data)

        # X-Website-Host is forwarded by the Next.js SSR layer so that
        # server-side fetches (which originate from the Next.js process)
        # carry the original browser host for correct System record lookup.
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]

        cache_key = f"system:host:{host}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        instance = System.objects.filter(host=host, enabled=True).first()
        if instance is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)

        data = SystemSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, SYSTEM_CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        try:
            instance = System.objects.get(pk=pk)
        except System.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SystemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)

        cache.delete(f"system:host:{instance.host}")
        cache.delete(f"system:pk:{pk}")

        return Response(SystemSerializer(instance, context={"request": request}).data)


class SuccessStoryListView(APIView):
    """
    GET  /api/success-stories/   — list stories for the current system (public).
    POST /api/success-stories/   — create a new story (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _resolve_system(self, request):
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]
        return System.objects.filter(host=host, enabled=True).first()

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = f"core:success_stories:system:{system_id}"
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            qs = SuccessStory.objects.filter(system_id=system_id, enabled=True).prefetch_related("images")
            data = SuccessStorySerializer(qs, many=True, context={"request": request}).data
            cache.set(cache_key, data, CACHE_TTL)
            return Response(data)
        # Existing host-based resolution
        system = self._resolve_system(request)
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        cache_key = f"core:success_stories:{system.host}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = SuccessStory.objects.filter(system=system, enabled=True).prefetch_related("images")
        data = SuccessStorySerializer(qs, many=True, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = SuccessStoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = SuccessStory()
        instance.save()  # get PK before image upload
        instance = serializer.save(instance)
        _invalidate_pattern("core:success_stories:*")
        return Response(
            SuccessStorySerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class SuccessStoryDetailView(APIView):
    """
    GET    /api/success-stories/<pk>/   — retrieve a story (public).
    PATCH  /api/success-stories/<pk>/   — partial update (admin only).
    DELETE /api/success-stories/<pk>/   — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return SuccessStory.objects.prefetch_related("images").get(pk=pk)
        except SuccessStory.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:success_story:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = SuccessStorySerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SuccessStoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        cache.delete(f"core:success_story:{pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")
        return Response(SuccessStorySerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        cache.delete(f"core:success_story:{pk}")
        cache.delete(f"core:success_story_images:{pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuccessStoryImagesView(APIView):
    """
    GET  /api/success-stories/<pk>/images/ — list gallery images (public).
    POST /api/success-stories/<pk>/images/ — add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_story(self, pk):
        try:
            return SuccessStory.objects.get(pk=pk)
        except SuccessStory.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:success_story_images:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        story = self._get_story(pk)
        if story is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = SuccessStoryImageSerializer(
            story.images.all(), many=True, context={"request": request}
        ).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        story = self._get_story(pk)
        if story is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SuccessStoryImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        img = serializer.save(story)
        cache.delete(f"core:success_story_images:{pk}")
        cache.delete(f"core:success_story:{pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")
        return Response(
            SuccessStoryImageSerializer(img, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class SuccessStoryImageDetailView(APIView):
    """
    PATCH  /api/success-stories/<pk>/images/<img_pk>/ — update sort_order / name (admin only).
    DELETE /api/success-stories/<pk>/images/<img_pk>/ — delete an image (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_image(self, pk, img_pk):
        try:
            return SuccessStoryImage.objects.get(pk=img_pk, story_id=pk)
        except SuccessStoryImage.DoesNotExist:
            return None

    def patch(self, request, pk, img_pk):
        img = self._get_image(pk, img_pk)
        if img is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        name = request.data.get("name")
        sort_order = request.data.get("sort_order")
        if name is not None:
            img.name = name
        if sort_order is not None:
            img.sort_order = sort_order
        img.save(update_fields=[f for f in ["name", "sort_order"] if f in request.data])
        cache.delete(f"core:success_story_images:{pk}")
        cache.delete(f"core:success_story:{pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")
        return Response(SuccessStoryImageSerializer(img, context={"request": request}).data)

    def delete(self, request, pk, img_pk):
        img = self._get_image(pk, img_pk)
        if img is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        img.delete()
        cache.delete(f"core:success_story_images:{pk}")
        cache.delete(f"core:success_story:{pk}")
        _invalidate_pattern("core:success_story:slug:*")
        _invalidate_pattern("core:success_stories:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuccessStoryBySlugView(APIView):
    """GET /api/success-stories/slug/<slug>/ — retrieve a story by slug for the current system (public)."""

    permission_classes = [AllowAny]

    def _resolve_system(self, request):
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]
        return System.objects.filter(host=host, enabled=True).first()

    def get(self, request, slug):
        system = self._resolve_system(request)
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)

        cache_key = f"core:success_story:slug:{system.host}:{slug}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        try:
            instance = SuccessStory.objects.prefetch_related("images").get(
                system=system, slug=slug, enabled=True
            )
        except SuccessStory.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        data = SuccessStorySerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)


class CompanyHighlightListView(APIView):
    """
    GET  /api/highlights/   — list highlights for the current system (public).
    POST /api/highlights/   — create a new highlight (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _resolve_system(self, request):
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]
        return System.objects.filter(host=host, enabled=True).first()

    def get(self, request):
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = f"core:highlights:system:{system_id}"
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            qs = CompanyHighlight.objects.filter(system_id=system_id, enabled=True).prefetch_related("items")
            data = CompanyHighlightSerializer(qs, many=True, context={"request": request}).data
            cache.set(cache_key, data, CACHE_TTL)
            return Response(data)
        # Existing host-based resolution
        system = self._resolve_system(request)
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        cache_key = f"core:highlights:{system.host}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = CompanyHighlight.objects.filter(system=system, enabled=True).prefetch_related("items")
        data = CompanyHighlightSerializer(qs, many=True, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        serializer = CompanyHighlightWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = CompanyHighlight()
        instance.save()
        instance = serializer.save(instance)
        _invalidate_pattern("core:highlights:*")
        return Response(
            CompanyHighlightSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CompanyHighlightDetailView(APIView):
    """
    GET    /api/highlights/<pk>/   — retrieve a highlight (public).
    PATCH  /api/highlights/<pk>/   — partial update (admin only).
    DELETE /api/highlights/<pk>/   — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return CompanyHighlight.objects.prefetch_related("items").get(pk=pk)
        except CompanyHighlight.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:highlight:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = CompanyHighlightSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyHighlightWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        cache.delete(f"core:highlight:{pk}")
        _invalidate_pattern("core:highlights:*")
        return Response(CompanyHighlightSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        cache.delete(f"core:highlight:{pk}")
        cache.delete(f"core:highlight_items:{pk}")
        _invalidate_pattern("core:highlights:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyHighlightBySlugView(APIView):
    """GET /api/highlights/slug/<slug>/ — retrieve a highlight by slug for the current system (public)."""

    permission_classes = [AllowAny]

    def _resolve_system(self, request):
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]
        return System.objects.filter(host=host, enabled=True).first()

    def get(self, request, slug):
        system = self._resolve_system(request)
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)

        cache_key = f"core:highlight:slug:{system.host}:{slug}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        try:
            instance = CompanyHighlight.objects.prefetch_related("items").get(
                system=system, slug=slug, enabled=True
            )
        except CompanyHighlight.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        data = CompanyHighlightSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)


class CompanyHighlightItemsView(APIView):
    """
    GET  /api/highlights/<pk>/items/   — list items for a highlight (public).
    POST /api/highlights/<pk>/items/   — create a new item (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_highlight(self, pk):
        try:
            return CompanyHighlight.objects.get(pk=pk)
        except CompanyHighlight.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:highlight_items:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        highlight = self._get_highlight(pk)
        if highlight is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = CompanyHighlightItemSerializer(
            highlight.items.all(), many=True, context={"request": request}
        ).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        highlight = self._get_highlight(pk)
        if highlight is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyHighlightItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = CompanyHighlightItem(highlight=highlight)
        item.save()
        item = serializer.save(item)
        cache.delete(f"core:highlight_items:{pk}")
        cache.delete(f"core:highlight:{pk}")
        _invalidate_pattern("core:highlights:*")
        return Response(
            CompanyHighlightItemSerializer(item, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CompanyHighlightItemDetailView(APIView):
    """
    GET    /api/highlights/<pk>/items/<item_pk>/   — retrieve an item (public).
    PATCH  /api/highlights/<pk>/items/<item_pk>/   — partial update (admin only).
    DELETE /api/highlights/<pk>/items/<item_pk>/   — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_item(self, pk, item_pk):
        try:
            return CompanyHighlightItem.objects.get(pk=item_pk, highlight_id=pk)
        except CompanyHighlightItem.DoesNotExist:
            return None

    def get(self, request, pk, item_pk):
        cache_key = f"core:highlight_item:{item_pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        item = self._get_item(pk, item_pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = CompanyHighlightItemSerializer(item, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk, item_pk):
        item = self._get_item(pk, item_pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyHighlightItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(item)
        cache.delete(f"core:highlight_item:{item_pk}")
        cache.delete(f"core:highlight_items:{pk}")
        cache.delete(f"core:highlight:{pk}")
        _invalidate_pattern("core:highlights:*")
        return Response(CompanyHighlightItemSerializer(item, context={"request": request}).data)

    def delete(self, request, pk, item_pk):
        item = self._get_item(pk, item_pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        cache.delete(f"core:highlight_item:{item_pk}")
        cache.delete(f"core:highlight_items:{pk}")
        cache.delete(f"core:highlight:{pk}")
        _invalidate_pattern("core:highlights:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


def _get_admin_system_id(request):
    """Return the system_id of the authenticated admin, or None."""
    try:
        return request.user.profile.system_id
    except Exception:
        return None


class BrandListCreateView(APIView):
    """
    GET  /api/brands/   — list brands for the current system (by ?system= or host).
    POST /api/brands/   — create a brand (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        system_id = request.query_params.get("system")
        if system_id:
            cache_key = f"core:brands:system:{system_id}"
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)
            qs = Brand.objects.filter(system_id=system_id, enabled=True)
            data = BrandSerializer(qs, many=True, context={"request": request}).data
            cache.set(cache_key, data, CACHE_TTL)
            return Response(data)
        host = (request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()).split(":")[0]
        system = System.objects.filter(host=host, enabled=True).first()
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        cache_key = f"core:brands:{system.host}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = Brand.objects.filter(system=system, enabled=True)
        data = BrandSerializer(qs, many=True, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        system_id = _get_admin_system_id(request)
        serializer = BrandWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = Brand()
        if system_id and "system" not in serializer.validated_data:
            instance.system_id = system_id
        instance.save()
        instance = serializer.save(instance)
        _invalidate_pattern("core:brands:*")
        return Response(
            BrandSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class BrandDetailView(APIView):
    """
    GET    /api/brands/<pk>/   — retrieve a brand (public).
    PATCH  /api/brands/<pk>/   — partial update (admin only).
    DELETE /api/brands/<pk>/   — delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Brand.objects.get(pk=pk)
        except Brand.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:brand:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = BrandSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        admin_system_id = _get_admin_system_id(request)
        if admin_system_id and instance.system_id and instance.system_id != admin_system_id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BrandWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        cache.delete(f"core:brand:{pk}")
        _invalidate_pattern("core:brands:*")
        return Response(BrandSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        admin_system_id = _get_admin_system_id(request)
        if admin_system_id and instance.system_id and instance.system_id != admin_system_id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        cache.delete(f"core:brand:{pk}")
        _invalidate_pattern("core:brands:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlugCheckView(APIView):
    """
    GET /api/check-slug/?model=<model>&slug=<slug>[&exclude_id=<id>]

    Returns {"available": true|false}.  Admin-only.

    Supported model values:
      brand, highlight, success-story,
      product, product-category, service, service-category, variant-option
    """

    permission_classes = [IsSystemAdmin]

    _MODEL_MAP = {
        "brand": ("core", "Brand"),
        "highlight": ("core", "CompanyHighlight"),
        "success-story": ("core", "SuccessStory"),
        "product": ("catalog", "Product"),
        "product-category": ("catalog", "ProductCategory"),
        "service": ("catalog", "Service"),
        "service-category": ("catalog", "ServiceCategory"),
        "variant-option": ("catalog", "VariantOption"),
    }

    def get(self, request):
        model_key = request.query_params.get("model", "")
        slug = request.query_params.get("slug", "").strip()
        exclude_id = request.query_params.get("exclude_id")

        if model_key not in self._MODEL_MAP:
            return Response(
                {"available": False, "error": "Unknown model"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not slug:
            return Response({"available": False})

        from django.apps import apps as django_apps
        app_label, model_name = self._MODEL_MAP[model_key]
        Model = django_apps.get_model(app_label, model_name)

        qs = Model.objects.filter(slug=slug)
        if exclude_id:
            try:
                qs = qs.exclude(pk=int(exclude_id))
            except (ValueError, TypeError):
                pass

        return Response({"available": not qs.exists()})
