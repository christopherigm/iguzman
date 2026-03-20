from django.core.cache import cache

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CompanyHighlight, CompanyHighlightItem, SuccessStory, SuccessStoryImage, System
from .serializers import (
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


class SystemView(APIView):
    """
    GET  /api/system/          — returns the System record matching the request host (public).
    PATCH /api/system/<pk>/   — partial update of a System record (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
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

        return Response(SystemSerializer(instance, context={"request": request}).data)


class SuccessStoryListView(APIView):
    """
    GET  /api/success-stories/   — list stories for the current system (public).
    POST /api/success-stories/   — create a new story (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def _resolve_system(self, request):
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]
        return System.objects.filter(host=host, enabled=True).first()

    def get(self, request):
        system = self._resolve_system(request)
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        qs = SuccessStory.objects.filter(system=system, enabled=True).prefetch_related("gallery")
        return Response(SuccessStorySerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        serializer = SuccessStoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = SuccessStory()
        instance.save()  # get PK before image upload
        instance = serializer.save(instance)
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
        return [IsAdminUser()]

    def _get_object(self, pk):
        try:
            return SuccessStory.objects.prefetch_related("gallery").get(pk=pk)
        except SuccessStory.DoesNotExist:
            return None

    def get(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(SuccessStorySerializer(instance, context={"request": request}).data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SuccessStoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        return Response(SuccessStorySerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuccessStoryGalleryView(APIView):
    """
    GET    /api/success-stories/<pk>/gallery/          — list gallery images (public).
    POST   /api/success-stories/<pk>/gallery/          — create & attach a new image (admin only).
    DELETE /api/success-stories/<pk>/gallery/<img_pk>/ — detach an image from gallery (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def _get_story(self, pk):
        try:
            return SuccessStory.objects.get(pk=pk)
        except SuccessStory.DoesNotExist:
            return None

    def get(self, request, pk):
        story = self._get_story(pk)
        if story is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            SuccessStoryImageSerializer(
                story.gallery.all(), many=True, context={"request": request}
            ).data
        )

    def post(self, request, pk):
        story = self._get_story(pk)
        if story is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SuccessStoryImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        img = SuccessStoryImage()
        img.save()
        img = serializer.save(img)
        story.gallery.add(img)
        return Response(
            SuccessStoryImageSerializer(img, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, pk, img_pk):
        story = self._get_story(pk)
        if story is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            img = story.gallery.get(pk=img_pk)
        except SuccessStoryImage.DoesNotExist:
            return Response({"detail": "Image not found in gallery."}, status=status.HTTP_404_NOT_FOUND)
        story.gallery.remove(img)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyHighlightListView(APIView):
    """
    GET  /api/highlights/   — list highlights for the current system (public).
    POST /api/highlights/   — create a new highlight (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def _resolve_system(self, request):
        host = (
            request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()
        ).split(":")[0]
        return System.objects.filter(host=host, enabled=True).first()

    def get(self, request):
        system = self._resolve_system(request)
        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        qs = CompanyHighlight.objects.filter(system=system, enabled=True).prefetch_related("items")
        return Response(CompanyHighlightSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request):
        serializer = CompanyHighlightWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = CompanyHighlight()
        instance.save()
        instance = serializer.save(instance)
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
        return [IsAdminUser()]

    def _get_object(self, pk):
        try:
            return CompanyHighlight.objects.prefetch_related("items").get(pk=pk)
        except CompanyHighlight.DoesNotExist:
            return None

    def get(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(CompanyHighlightSerializer(instance, context={"request": request}).data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyHighlightWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        return Response(CompanyHighlightSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanyHighlightItemsView(APIView):
    """
    GET  /api/highlights/<pk>/items/   — list items for a highlight (public).
    POST /api/highlights/<pk>/items/   — create a new item (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def _get_highlight(self, pk):
        try:
            return CompanyHighlight.objects.get(pk=pk)
        except CompanyHighlight.DoesNotExist:
            return None

    def get(self, request, pk):
        highlight = self._get_highlight(pk)
        if highlight is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            CompanyHighlightItemSerializer(
                highlight.items.all(), many=True, context={"request": request}
            ).data
        )

    def post(self, request, pk):
        highlight = self._get_highlight(pk)
        if highlight is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyHighlightItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = CompanyHighlightItem(highlight=highlight)
        item.save()
        item = serializer.save(item)
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
        return [IsAdminUser()]

    def _get_item(self, pk, item_pk):
        try:
            return CompanyHighlightItem.objects.get(pk=item_pk, highlight_id=pk)
        except CompanyHighlightItem.DoesNotExist:
            return None

    def get(self, request, pk, item_pk):
        item = self._get_item(pk, item_pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(CompanyHighlightItemSerializer(item, context={"request": request}).data)

    def patch(self, request, pk, item_pk):
        item = self._get_item(pk, item_pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CompanyHighlightItemWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(item)
        return Response(CompanyHighlightItemSerializer(item, context={"request": request}).data)

    def delete(self, request, pk, item_pk):
        item = self._get_item(pk, item_pk)
        if item is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
