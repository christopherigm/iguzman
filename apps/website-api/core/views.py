import json
import logging
import os
import tempfile
import zipfile

from django.conf import settings
from django.core.cache import cache
from django.core.files import File
from django.db.models import Q
from django.db.models.functions import Coalesce
from django.http import FileResponse, StreamingHttpResponse
from django.utils import timezone
from django.utils.text import slugify

from rest_framework import status
from rest_framework.authentication import BasicAuthentication
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsSystemAdmin, show_disabled
from core.tenancy import user_system
from .backup import (
    MODE_REPLACE,
    SECTION_IMAGES,
    BackupError,
    normalize_sections,
    restore_archive,
    write_archive,
)
from .cache import invalidate_pattern as _invalidate_pattern
from .storage import test_credentials
from .models import ALL_DAY_GRACE, Branch, Brand, CompanyHighlight, CompanyHighlightItem, ContactMessage, Event, EventImage, SiteBackup, SocialPost, SuccessStory, SuccessStoryImage, System
from .serializers import (
    AiChatSerializer,
    BranchSerializer,
    BranchWriteSerializer,
    BrandSerializer,
    BrandWriteSerializer,
    CompanyHighlightItemSerializer,
    CompanyHighlightItemWriteSerializer,
    CompanyHighlightSerializer,
    CompanyHighlightWriteSerializer,
    ContactMessageCreateSerializer,
    ContactMessageSerializer,
    EventImageSerializer,
    EventImageWriteSerializer,
    EventSerializer,
    EventWriteSerializer,
    SiteBackupSerializer,
    SocialPostSerializer,
    SocialPostWriteSerializer,
    SuccessStoryImageSerializer,
    SuccessStoryImageWriteSerializer,
    SuccessStorySerializer,
    SuccessStoryWriteSerializer,
    SystemSerializer,
    SystemWriteSerializer,
)
from core.services.contact import send_contact_message_notification, send_contact_message_reply
from core.services.llm import stream_chat
from core.site_payload import ImageArchive, apply_payload

logger = logging.getLogger(__name__)

SYSTEM_CACHE_TTL = 3600  # 1 hour
CACHE_TTL = 300  # 5 minutes
# Event payloads whose *contents* depend on the clock - the upcoming/past lists
# and any single event (which carries `is_past`). A five-minute entry would keep
# announcing an event that finished four minutes ago; a signal cannot help,
# because nothing was written when it ended.
EVENT_SCOPED_CACHE_TTL = 60  # 1 minute


def _sse_data(payload):
    """Serialize one Server-Sent Events data frame."""
    return f"data: {json.dumps(payload)}\n\n"


class SystemListView(APIView):
    """GET /api/systems/ - list all enabled System records (admin only).

    Uses BasicAuthentication so deployment scripts can authenticate without
    a per-tenant JWT flow.
    """

    authentication_classes = [BasicAuthentication]
    permission_classes = [IsAdminUser]

    def get(self, request):
        systems = System.objects.filter(enabled=True).values("id", "site_name", "host")
        return Response(list(systems))


class PublishSiteView(APIView):
    """POST /api/publish-site/ - upsert a customer System + its content from a
    serialized payload (admin only).

    The production counterpart to the local ``export_site`` command: ``pnpm
    publish-site`` POSTs an exported payload here to publish a tested site into
    this database. Send ``{"reset": true}`` for an exact replace of the System's
    prior content.

    **Two body shapes**, because images are optional:

    * ``application/json`` - the payload alone. Every image field on the target
      is left untouched, which is what this endpoint has always done.
    * ``multipart/form-data`` with a ``payload`` part (the same JSON) and an
      ``images`` part (the zip from ``export_site --images``). A record with no
      image yet is given the photograph it had in the source database; one that
      already has an image keeps it, so a customer's CMS upload is never
      clobbered. See ``core/site_payload.apply_payload``.

    Uses BasicAuthentication so the deploy script can authenticate without a
    per-tenant JWT flow (mirrors SystemListView).
    """

    authentication_classes = [BasicAuthentication]
    permission_classes = [IsAdminUser]
    parser_classes = [JSONParser, MultiPartParser]

    def post(self, request):
        try:
            payload, upload = self._unpack(request)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(payload, dict) or not (payload.get("system") or {}).get("host"):
            return Response(
                {"detail": "A JSON body with system.host is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        archive = None
        try:
            if upload is not None:
                try:
                    archive = ImageArchive(zipfile.ZipFile(upload))
                except zipfile.BadZipFile:
                    return Response(
                        {"detail": "The `images` part is not a readable zip."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            summary = apply_payload(
                payload, reset=bool(payload.get("reset")), images=archive
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        self._invalidate(summary["host"])
        return Response(summary, status=status.HTTP_200_OK)

    @staticmethod
    def _unpack(request):
        """Return ``(payload, images_or_None)`` for either body shape."""
        if "payload" not in request.data:
            # Plain JSON body - the historical shape.
            return request.data, None
        raw = request.data["payload"]
        # A multipart `payload` arrives as a string when sent as a field and as
        # an uploaded file when sent as `-F payload=@file.json`; the deploy
        # script uses the latter because a 20MB catalog does not belong in a
        # form field.
        if hasattr(raw, "read"):
            raw = raw.read()
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        if isinstance(raw, str):
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"The `payload` part is not valid JSON: {exc}") from exc
        else:
            payload = raw
        return payload, request.data.get("images")

    @staticmethod
    def _invalidate(host):
        """Clear every cache namespace publishing can touch (see apps/website-api/CLAUDE.md)."""
        cache.delete(f"system:host:{host}")
        for pattern in (
            "system:pk:*",
            "core:success_stories:*",
            "core:success_story:*",
            "core:highlights:*",
            "core:highlight:*",
            "core:highlight_item*",
            "core:events:*",
            "core:event:*",
            "core:event_images:*",
            "catalog:product_categories*",
            "catalog:products*",
            "catalog:service_categories*",
            "catalog:services*",
            "catalog:menu_categories*",
            "catalog:menu_category*",
            "catalog:menu_items*",
            "catalog:menu_item*",
        ):
            _invalidate_pattern(pattern)


class SystemView(APIView):
    """
    GET  /api/system/          - returns the System record matching the request host (public).
    PATCH /api/system/<pk>/   - partial update of a System record (admin only).
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


class SystemStorageView(APIView):
    """
    GET  /api/system/<pk>/storage/  - this tenant's R2 config, secret omitted.
    POST /api/system/<pk>/storage/  - test credentials against R2 (writes nothing
                                      but a scratch object it deletes again).

    Split out of the System payload rather than added to it, because
    `GET /api/system/` is `AllowAny` and feeds every public page: the bucket name
    and access key id are not the kind of thing to publish alongside a site's
    colours. The secret has no read path here either - the response says only
    whether one is stored.

    Both are scoped to the **caller's own** System, taken from their profile, so
    a tenant admin cannot read or probe another customer's storage by changing
    the pk in the URL.
    """

    permission_classes = [IsSystemAdmin]

    def _own_system(self, request, pk):
        system = user_system(request)
        if system is None or system.pk != int(pk):
            return None
        return system

    def get(self, request, pk):
        system = self._own_system(request, pk)
        if system is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._payload(system))

    def post(self, request, pk):
        """Test a credential set before it is trusted with a customer's uploads.

        Credentials come from the **body**, so the operator can verify what they
        just typed without saving it first - a wrong key saved is a wrong key
        every upload then fails against. A blank `storage_secret_access_key`
        means "use the stored one", which is what makes it possible to re-test an
        existing connection (the form never has the secret to send back).
        """
        system = self._own_system(request, pk)
        if system is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data or {}
        secret = (data.get("storage_secret_access_key") or "").strip()
        if not secret:
            secret = system.storage_secret_access_key

        result = test_credentials(
            account_id=(data.get("storage_account_id") or system.storage_account_id).strip(),
            access_key_id=(data.get("storage_access_key_id") or system.storage_access_key_id).strip(),
            secret_access_key=secret,
            bucket_name=(data.get("storage_bucket_name") or system.storage_bucket_name).strip(),
            public_domain=(data.get("storage_public_domain") or system.storage_public_domain).strip(),
        )
        return Response(result)

    @staticmethod
    def _payload(system):
        return {
            "storage_enabled": system.storage_enabled,
            "storage_account_id": system.storage_account_id,
            "storage_access_key_id": system.storage_access_key_id,
            "storage_bucket_name": system.storage_bucket_name,
            "storage_public_domain": system.storage_public_domain,
            # Never the key itself - only whether one is on file, which is what
            # lets the CMS render "leave blank to keep the current key".
            "storage_secret_set": bool(system.storage_secret_access_key_encrypted),
            "storage_configured": system.storage_configured,
        }


def _disabled_suffix(disabled_visible):
    """Cache-key suffix separating an admin response (which contains disabled
    records) from the public one. Derived from the resolved flag, never the raw
    param, so the two can never share an entry. The existing ``*`` invalidation
    patterns match both variants.
    """
    return ":include_disabled" if disabled_visible else ""


class SuccessStoryListView(APIView):
    """
    GET  /api/success-stories/   - list stories for the current system (public).
    POST /api/success-stories/   - create a new story (admin only).

    Query params (GET):
      system           - filter by system pk
      include_disabled - 'true' to also return disabled stories (system admins
                         only; ignored for everyone else)
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
        disabled_visible = show_disabled(request)
        suffix = _disabled_suffix(disabled_visible)
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = f"core:success_stories:system:{system_id}{suffix}"
        else:
            # Existing host-based resolution
            system = self._resolve_system(request)
            if system is None:
                return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
            system_id = system.id
            cache_key = f"core:success_stories:{system.host}{suffix}"

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = SuccessStory.objects.filter(system_id=system_id).prefetch_related("images")
        if not disabled_visible:
            qs = qs.filter(enabled=True)
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
    GET    /api/success-stories/<pk>/   - retrieve a story (public).
    PATCH  /api/success-stories/<pk>/   - partial update (admin only).
    DELETE /api/success-stories/<pk>/   - delete (admin only).
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
    GET  /api/success-stories/<pk>/images/ - list gallery images (public).
    POST /api/success-stories/<pk>/images/ - add an image (admin only, base64).
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
    PATCH  /api/success-stories/<pk>/images/<img_pk>/ - update sort_order / name (admin only).
    DELETE /api/success-stories/<pk>/images/<img_pk>/ - delete an image (admin only).
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
    """GET /api/success-stories/slug/<slug>/ - retrieve a story by slug for the current system (public)."""

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
    GET  /api/highlights/   - list highlights for the current system (public).
    POST /api/highlights/   - create a new highlight (admin only).
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
        disabled_visible = show_disabled(request)
        suffix = _disabled_suffix(disabled_visible)
        system_id = request.query_params.get('system')
        if system_id:
            cache_key = f"core:highlights:system:{system_id}{suffix}"
        else:
            # Existing host-based resolution
            system = self._resolve_system(request)
            if system is None:
                return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
            system_id = system.id
            cache_key = f"core:highlights:{system.host}{suffix}"

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = CompanyHighlight.objects.filter(system_id=system_id).prefetch_related("items")
        if not disabled_visible:
            qs = qs.filter(enabled=True)
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
    GET    /api/highlights/<pk>/   - retrieve a highlight (public).
    PATCH  /api/highlights/<pk>/   - partial update (admin only).
    DELETE /api/highlights/<pk>/   - delete (admin only).
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
    """GET /api/highlights/slug/<slug>/ - retrieve a highlight by slug for the current system (public)."""

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
    GET  /api/highlights/<pk>/items/   - list items for a highlight (public).
    POST /api/highlights/<pk>/items/   - create a new item (admin only).
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
    GET    /api/highlights/<pk>/items/<item_pk>/   - retrieve an item (public).
    PATCH  /api/highlights/<pk>/items/<item_pk>/   - partial update (admin only).
    DELETE /api/highlights/<pk>/items/<item_pk>/   - delete (admin only).
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


# --------------------------------------------------------------------------- #
# Events
# --------------------------------------------------------------------------- #

# The largest `?limit=` an anonymous caller can ask for. The landing slider asks
# for a handful; this only stops one request from serializing a tenant's whole
# ten-year history of events (each with its gallery) into a cache entry.
MAX_EVENT_LIMIT = 200

EVENT_SCOPE_UPCOMING = "upcoming"
EVENT_SCOPE_PAST = "past"
EVENT_SCOPE_ALL = "all"


def _invalidate_event(pk):
    """Clear every namespace one event's write can make wrong.

    One helper rather than four repeated lines because an event is read under
    five key shapes (the scoped lists, the by-pk detail, the by-slug detail and
    the gallery), and a write to any part of it invalidates all of them - the
    list payloads embed the whole serialized event, gallery included.
    ``core:events:*`` also has to be swept on a *slug* change, since the by-slug
    key is namespaced by the old slug and nothing else would ever reach it.
    """
    cache.delete(f"core:event:{pk}")
    cache.delete(f"core:event_images:{pk}")
    _invalidate_pattern("core:event:slug:*")
    _invalidate_pattern("core:events:*")


def _event_queryset(system_id, *, scope, disabled_visible, limit=None):
    """The events of one system, narrowed and ordered by ``scope``.

    ``upcoming`` is soonest-first (what is coming up, in the order it arrives),
    ``past`` is newest-first (the most recent thing that happened, first) and
    ``all`` keeps the model's own chronological order.

    ⚠ The upcoming/past split is made in **SQL**, against ``ends_at`` falling
    back to ``starts_at``, and an all-day row is given ``ALL_DAY_GRACE`` on top -
    an all-day event is stored at midnight and would otherwise retire one minute
    into the day it runs on. That is an approximation of ``Event.effective_end``,
    which is exact but needs each row's own timezone and so cannot be a ``WHERE``
    clause. It errs toward keeping an event listed slightly too long; every
    payload also carries the exact ``is_past``, which is what a consumer should
    render a badge from.
    """
    now = timezone.now()
    qs = (
        Event.objects.filter(system_id=system_id)
        .select_related("branch")
        .prefetch_related("images")
        .annotate(_ends=Coalesce("ends_at", "starts_at"))
    )
    if not disabled_visible:
        qs = qs.filter(enabled=True)

    live = Q(_ends__gte=now) | Q(is_all_day=True, _ends__gte=now - ALL_DAY_GRACE)
    if scope == EVENT_SCOPE_UPCOMING:
        qs = qs.filter(live).order_by("starts_at")
    elif scope == EVENT_SCOPE_PAST:
        qs = qs.exclude(live).order_by("-starts_at")
    else:
        qs = qs.order_by("starts_at")

    if limit is not None:
        qs = qs[:limit]
    return qs


def _event_scope(request):
    scope = (request.query_params.get("scope") or EVENT_SCOPE_ALL).lower()
    return scope if scope in (EVENT_SCOPE_UPCOMING, EVENT_SCOPE_PAST) else EVENT_SCOPE_ALL


def _event_limit(request):
    raw = request.query_params.get("limit")
    if not raw:
        return None
    try:
        return max(1, min(int(raw), MAX_EVENT_LIMIT))
    except (TypeError, ValueError):
        return None


class EventListView(APIView):
    """
    GET  /api/events/   - list events for the current system (public).
    POST /api/events/   - create an event (admin only).

    Query params (GET):
      system           - filter by system pk
      scope            - 'upcoming' | 'past' | 'all' (default). See
                         ``_event_queryset`` for the ordering each implies.
      limit            - cap the number returned (max ``MAX_EVENT_LIMIT``)
      include_disabled - 'true' to also return disabled events (system admins
                         only; ignored for everyone else)
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
        disabled_visible = show_disabled(request)
        suffix = _disabled_suffix(disabled_visible)
        scope = _event_scope(request)
        limit = _event_limit(request)
        system_id = request.query_params.get("system")
        if system_id:
            base = f"core:events:system:{system_id}"
        else:
            system = self._resolve_system(request)
            if system is None:
                return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
            system_id = system.id
            base = f"core:events:{system.host}"
        cache_key = f"{base}:{scope}:{limit or 'all'}{suffix}"

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        qs = _event_queryset(
            system_id, scope=scope, disabled_visible=disabled_visible, limit=limit
        )
        data = EventSerializer(qs, many=True, context={"request": request}).data
        # ⚠ Deliberately shorter than CACHE_TTL for the scoped reads: their
        # contents depend on the clock, so an event that has just finished must
        # not keep claiming to be upcoming for five minutes. The unscoped list is
        # time-independent and keeps the normal TTL.
        ttl = CACHE_TTL if scope == EVENT_SCOPE_ALL else EVENT_SCOPED_CACHE_TTL
        cache.set(cache_key, data, ttl)
        return Response(data)

    def post(self, request):
        serializer = EventWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data.get("starts_at"):
            return Response(
                {"starts_at": ["An event needs a start date."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Saved bare first so the image upload has a pk to name its file with -
        # the same two-step every other content model here uses. `starts_at` is
        # NOT NULL, so the bare row carries the validated one from the start.
        instance = Event(starts_at=serializer.validated_data["starts_at"])
        instance.save()
        instance = serializer.save(instance)
        _invalidate_pattern("core:events:*")
        return Response(
            EventSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class EventDetailView(APIView):
    """
    GET    /api/events/<pk>/   - retrieve an event (public).
    PATCH  /api/events/<pk>/   - partial update (admin only).
    DELETE /api/events/<pk>/   - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return (
                Event.objects.select_related("branch")
                .prefetch_related("images")
                .get(pk=pk)
            )
        except Event.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:event:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = EventSerializer(instance, context={"request": request}).data
        # `is_past` rides in this payload, so it ages like the scoped lists do.
        cache.set(cache_key, data, EVENT_SCOPED_CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EventWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        _invalidate_event(pk)
        return Response(EventSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        _invalidate_event(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventBySlugView(APIView):
    """GET /api/events/slug/<slug>/ - retrieve an event by slug for the current system (public)."""

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

        cache_key = f"core:event:slug:{system.host}:{slug}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        try:
            instance = (
                Event.objects.select_related("branch")
                .prefetch_related("images")
                .get(system=system, slug=slug, enabled=True)
            )
        except Event.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        data = EventSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, EVENT_SCOPED_CACHE_TTL)
        return Response(data)


class EventImagesView(APIView):
    """
    GET  /api/events/<pk>/images/ - list gallery images (public).
    POST /api/events/<pk>/images/ - add an image (admin only, base64).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_event(self, pk):
        try:
            return Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:event_images:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        event = self._get_event(pk)
        if event is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = EventImageSerializer(
            event.images.all(), many=True, context={"request": request}
        ).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request, pk):
        event = self._get_event(pk)
        if event is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = EventImageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        img = serializer.save(event)
        _invalidate_event(pk)
        return Response(
            EventImageSerializer(img, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class EventImageDetailView(APIView):
    """
    PATCH  /api/events/<pk>/images/<img_pk>/ - update sort_order / name (admin only).
    DELETE /api/events/<pk>/images/<img_pk>/ - delete an image (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_image(self, pk, img_pk):
        try:
            return EventImage.objects.get(pk=img_pk, event_id=pk)
        except EventImage.DoesNotExist:
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
        _invalidate_event(pk)
        return Response(EventImageSerializer(img, context={"request": request}).data)

    def delete(self, request, pk, img_pk):
        img = self._get_image(pk, img_pk)
        if img is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        img.delete()
        _invalidate_event(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _get_admin_system_id(request):
    """Return the system_id of the authenticated admin, or None."""
    try:
        return request.user.profile.system_id
    except Exception:
        return None


class BrandListCreateView(APIView):
    """
    GET  /api/brands/   - list brands for the current system (by ?system= or host).
    POST /api/brands/   - create a brand (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        disabled_visible = show_disabled(request)
        suffix = _disabled_suffix(disabled_visible)
        system_id = request.query_params.get("system")
        if system_id:
            cache_key = f"core:brands:system:{system_id}{suffix}"
        else:
            host = (request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()).split(":")[0]
            system = System.objects.filter(host=host, enabled=True).first()
            if system is None:
                return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
            system_id = system.id
            cache_key = f"core:brands:{system.host}{suffix}"

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = Brand.objects.filter(system_id=system_id)
        if not disabled_visible:
            qs = qs.filter(enabled=True)
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
    GET    /api/brands/<pk>/   - retrieve a brand (public).
    PATCH  /api/brands/<pk>/   - partial update (admin only).
    DELETE /api/brands/<pk>/   - delete (admin only).
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


class BranchListCreateView(APIView):
    """
    GET  /api/branches/   - list branches for the current system (by ?system= or host).
    POST /api/branches/   - create a branch (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def get(self, request):
        disabled_visible = show_disabled(request)
        suffix = _disabled_suffix(disabled_visible)
        system_id = request.query_params.get("system")
        if system_id:
            cache_key = f"core:branches:system:{system_id}{suffix}"
        else:
            host = (request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()).split(":")[0]
            system = System.objects.filter(host=host, enabled=True).first()
            if system is None:
                return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
            system_id = system.id
            cache_key = f"core:branches:{system.host}{suffix}"

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        # `hours` is nested in the payload, so prefetch it - otherwise a tenant
        # with six locations costs seven queries to render its contact page.
        qs = Branch.objects.filter(system_id=system_id).prefetch_related("hours", "resource_pools__resources")
        if not disabled_visible:
            qs = qs.filter(enabled=True)
        data = BranchSerializer(qs, many=True, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        system_id = _get_admin_system_id(request)
        serializer = BranchWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = Branch()
        if system_id and "system" not in serializer.validated_data:
            instance.system_id = system_id
        instance.save()
        instance = serializer.save(instance)
        _invalidate_pattern("core:branches:*")
        return Response(
            BranchSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class BranchDetailView(APIView):
    """
    GET    /api/branches/<pk>/   - retrieve a branch (public).
    PATCH  /api/branches/<pk>/   - partial update (admin only).
    DELETE /api/branches/<pk>/   - delete (admin only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsSystemAdmin()]

    def _get_object(self, pk):
        try:
            return Branch.objects.prefetch_related("hours", "resource_pools__resources").get(pk=pk)
        except Branch.DoesNotExist:
            return None

    def get(self, request, pk):
        cache_key = f"core:branch:{pk}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = BranchSerializer(instance, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def patch(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        admin_system_id = _get_admin_system_id(request)
        if admin_system_id and instance.system_id and instance.system_id != admin_system_id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BranchWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(instance)
        cache.delete(f"core:branch:{pk}")
        _invalidate_pattern("core:branches:*")
        return Response(BranchSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        admin_system_id = _get_admin_system_id(request)
        if admin_system_id and instance.system_id and instance.system_id != admin_system_id:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        cache.delete(f"core:branch:{pk}")
        _invalidate_pattern("core:branches:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ContactMessageCreateView(APIView):
    """POST /api/contact-messages/ - a customer sends a question (public).

    Anonymous by design (a visitor need not have an account to ask something),
    but a signed-in sender is linked and their account name/email are used rather
    than whatever the body claims. Scoped to the tenant by request host for a
    guest, by the account's own system for a signed-in user - never let a header
    pick a logged-in user's tenant. On success the tenant's admins are emailed.

    A sender leaves an email, a WhatsApp number, or both; the message is refused
    only when there is no way at all to answer it. A signed-in sender always has
    an account email, so for them the number is purely an extra way to be reached.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ContactMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user if request.user.is_authenticated else None
        if user is not None:
            system = _signed_in_system(user)
            name = (f"{user.first_name} {user.last_name}".strip() or user.username)
            email = user.email
        else:
            host = (request.META.get("HTTP_X_WEBSITE_HOST") or request.get_host()).split(":")[0]
            system = System.objects.filter(host=host, enabled=True).first()
            name = (data.get("name") or "").strip()
            email = (data.get("email") or "").strip()

        # The number is taken from the body on both paths - an account has no
        # phone of its own, so even a signed-in sender types it here.
        phone = (data.get("phone") or "").strip()
        preferred = data.get("preferred_channel") or ""

        if system is None:
            return Response({"detail": "No system configuration found."}, status=status.HTTP_404_NOT_FOUND)
        if not name:
            return Response(
                {"detail": "A name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not email and not phone:
            # One way to answer is the minimum; which one is the sender's choice.
            return Response(
                {"detail": "An email address or a WhatsApp number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fall back to whichever channel the sender actually left, so a stated
        # preference can never point at an address that is not there.
        if preferred == ContactMessage.CHANNEL_WHATSAPP and not phone:
            preferred = ContactMessage.CHANNEL_EMAIL
        elif preferred == ContactMessage.CHANNEL_EMAIL and not email:
            preferred = ContactMessage.CHANNEL_WHATSAPP
        elif not preferred:
            preferred = (
                ContactMessage.CHANNEL_WHATSAPP
                if phone and not email
                else ContactMessage.CHANNEL_EMAIL
            )

        message = ContactMessage.objects.create(
            system=system,
            user=user,
            name=name[:255],
            email=email,
            phone=(phone[:32] or None),
            preferred_channel=preferred,
            subject=(data.get("subject") or None),
            message=data["message"],
            related_kind=(data.get("related_kind") or None),
            related_id=data.get("related_id"),
            related_name=(data.get("related_name") or None),
        )
        _invalidate_pattern("core:contact_messages:*")

        # Never let a mail failure lose the customer's message - it is already
        # saved and visible in the inbox; the email is a best-effort nudge.
        try:
            send_contact_message_notification(message)
        except Exception:
            logger.exception("Failed to send contact-message notification for #%s", message.pk)

        return Response(
            {"detail": "Message sent.", "id": message.pk},
            status=status.HTTP_201_CREATED,
        )


class AdminContactMessageListView(APIView):
    """GET /api/contact-messages/admin/ - the tenant's inbox (admin only)."""

    permission_classes = [IsSystemAdmin]

    def get(self, request):
        system_id = _get_admin_system_id(request)
        cache_key = f"core:contact_messages:system:{system_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = ContactMessage.objects.filter(system_id=system_id)
        data = ContactMessageSerializer(qs, many=True, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)


class AdminContactMessageDetailView(APIView):
    """
    GET    /api/contact-messages/admin/<pk>/  - one message (admin only).
    PATCH  /api/contact-messages/admin/<pk>/  - mark read/unread (admin only).
    DELETE /api/contact-messages/admin/<pk>/  - delete (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_object(self, request, pk):
        system_id = _get_admin_system_id(request)
        try:
            return ContactMessage.objects.get(pk=pk, system_id=system_id)
        except ContactMessage.DoesNotExist:
            return None

    def get(self, request, pk):
        instance = self._get_object(request, pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        # Opening a message marks it read, so the inbox unread count is truthful.
        if not instance.is_read:
            instance.is_read = True
            instance.save(update_fields=["is_read"])
            _invalidate_pattern("core:contact_messages:*")
        return Response(ContactMessageSerializer(instance, context={"request": request}).data)

    def patch(self, request, pk):
        instance = self._get_object(request, pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if "is_read" in request.data:
            instance.is_read = bool(request.data["is_read"])
            instance.save(update_fields=["is_read"])
            _invalidate_pattern("core:contact_messages:*")
        return Response(ContactMessageSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(request, pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        _invalidate_pattern("core:contact_messages:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminContactMessageReplyView(APIView):
    """POST /api/contact-messages/admin/<pk>/reply/ - record an admin's reply.

    Admin-only and system-scoped like the rest of the inbox. Marks the message
    read as a side effect. The optional `channel` picks how the reply reaches the
    customer, and the two are **not** symmetrical:

    - ``email`` (the default) sends it from here. Nothing is recorded unless the
      mail actually went out, so the inbox's "Replied" state never lies.
    - ``whatsapp`` sends nothing. The admin's own WhatsApp does that, through a
      wa.me deep link the CMS opens with this text prefilled; this endpoint only
      records what they wrote so the inbox keeps a thread and a second admin does
      not answer again unaware. ⚠ It therefore records an *intent*, not a
      delivery - there is no send to fail and no receipt to wait for. Whoever
      displays it must not imply otherwise.
    """

    permission_classes = [IsSystemAdmin]

    def post(self, request, pk):
        system_id = _get_admin_system_id(request)
        try:
            message = ContactMessage.objects.get(pk=pk, system_id=system_id)
        except ContactMessage.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        body = (request.data.get("body") or "").strip()
        subject = (request.data.get("subject") or "").strip()
        channel = (request.data.get("channel") or "").strip() or ContactMessage.CHANNEL_EMAIL
        if not body:
            return Response(
                {"detail": "A reply message is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if channel not in dict(ContactMessage.CHANNEL_CHOICES):
            return Response(
                {"detail": "Unknown reply channel."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Refuse a channel the customer left no address for, rather than
        # recording a reply that could not have reached anyone.
        if channel == ContactMessage.CHANNEL_WHATSAPP and not message.phone:
            return Response(
                {"detail": "This message has no WhatsApp number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if channel == ContactMessage.CHANNEL_EMAIL and not message.email:
            return Response(
                {"detail": "This message has no email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if channel == ContactMessage.CHANNEL_EMAIL:
            try:
                send_contact_message_reply(message, body, subject or None)
            except Exception:
                # Nothing is recorded on a send failure, so the admin can retry and the
                # inbox keeps showing the message as un-answered.
                logger.exception("Failed to send contact-message reply for #%s", message.pk)
                return Response(
                    {"detail": "The reply could not be sent. Please try again."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        message.reply_body = body
        # A WhatsApp message has no subject line, so never store one against it -
        # it would render a field the customer was never shown.
        message.reply_subject = (
            (subject or None) if channel == ContactMessage.CHANNEL_EMAIL else None
        )
        message.reply_channel = channel
        message.replied_at = timezone.now()
        message.replied_by = request.user
        message.is_read = True
        message.save(
            update_fields=[
                "reply_body", "reply_subject", "reply_channel",
                "replied_at", "replied_by", "is_read",
            ]
        )
        _invalidate_pattern("core:contact_messages:*")
        return Response(
            ContactMessageSerializer(message, context={"request": request}).data
        )


class SocialPostListCreateView(APIView):
    """
    GET  /api/social-posts/   - list the tenant's social posts (admin only).
    POST /api/social-posts/   - create a social post (admin only).

    Entirely admin + system-scoped, like the contact inbox: the system is taken
    from the admin's token, never the body, so a browser cannot author into
    another tenant.
    """

    permission_classes = [IsSystemAdmin]

    def get(self, request):
        system_id = _get_admin_system_id(request)
        cache_key = f"core:social_posts:system:{system_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = SocialPost.objects.filter(system_id=system_id)
        data = SocialPostSerializer(qs, many=True, context={"request": request}).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)

    def post(self, request):
        system_id = _get_admin_system_id(request)
        serializer = SocialPostWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(system_id=system_id)
        _invalidate_pattern("core:social_posts:*")
        return Response(
            SocialPostSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class SocialPostDetailView(APIView):
    """
    GET    /api/social-posts/<pk>/  - one social post (admin only).
    PATCH  /api/social-posts/<pk>/  - partial update (admin only).
    DELETE /api/social-posts/<pk>/  - delete (admin only).
    """

    permission_classes = [IsSystemAdmin]

    def _get_object(self, request, pk):
        system_id = _get_admin_system_id(request)
        try:
            return SocialPost.objects.get(pk=pk, system_id=system_id)
        except SocialPost.DoesNotExist:
            return None

    def get(self, request, pk):
        instance = self._get_object(request, pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(SocialPostSerializer(instance, context={"request": request}).data)

    def patch(self, request, pk):
        instance = self._get_object(request, pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SocialPostWriteSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _invalidate_pattern("core:social_posts:*")
        return Response(SocialPostSerializer(instance, context={"request": request}).data)

    def delete(self, request, pk):
        instance = self._get_object(request, pk)
        if instance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        instance.delete()
        _invalidate_pattern("core:social_posts:*")
        return Response(status=status.HTTP_204_NO_CONTENT)


def _signed_in_system(user):
    """The tenant a signed-in sender belongs to (its profile System), or None."""
    from core.tenancy import profile_system
    return profile_system(user)


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
        "event": ("core", "Event"),
        "product": ("catalog", "Product"),
        "product-category": ("catalog", "ProductCategory"),
        "service": ("catalog", "Service"),
        "service-category": ("catalog", "ServiceCategory"),
        "variant-option": ("catalog", "VariantOption"),
        "menu-item": ("catalog", "MenuItem"),
        "menu-category": ("catalog", "MenuCategory"),
        "ingredient": ("catalog", "Ingredient"),
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


class AiChatView(APIView):
    """
    POST /api/ai/chat/ - stream an LLM completion back as OpenAI-shaped SSE.

    Admin-only: the sole caller is the admin CMS (enhance / translate on the
    content forms). Provider choice lives in `core.services.llm` - Groq first,
    OpenRouter as fallback - so no client can pick one.
    """

    permission_classes = [IsSystemAdmin]

    def post(self, request):
        serializer = AiChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        messages = [dict(m) for m in serializer.validated_data["messages"]]
        temperature = serializer.validated_data["temperature"]

        # Checked up front: once the first chunk is yielded the 200 is committed and
        # a misconfiguration could only be reported inside the stream.
        if not settings.GROQ_API_KEY and not settings.OPENROUTER_API_KEY:
            return Response(
                {"detail": "No LLM provider is configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response = StreamingHttpResponse(
            self._sse(messages, temperature),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        # nginx buffers proxied responses by default, which would hold the whole
        # completion back and deliver it in one lump - defeating the streaming UI.
        response["X-Accel-Buffering"] = "no"
        return response

    def _sse(self, messages, temperature):
        try:
            for token in stream_chat(messages, temperature):
                yield _sse_data({"choices": [{"delta": {"content": token}}]})
        except Exception:
            # Provider errors are logged in full but reported generically: the body
            # of an upstream error is not something to forward to a browser.
            logger.exception("AI chat stream failed")
            yield _sse_data({"error": {"message": "The AI provider is unavailable. Please try again."}})
        yield "data: [DONE]\n\n"


# --------------------------------------------------------------------------- #
# Backup & restore
# --------------------------------------------------------------------------- #

BACKUPS_CACHE_TTL = 300  # 5 minutes


def _backups_key(system_id):
    return f"core:backups:system:{system_id}"


def invalidate_after_restore(host):
    """Clear every cache namespace a restore can invalidate.

    A restore rewrites more than publishing does - it can touch the System row,
    the whole catalog, stories, highlights, brands, branches, the contact inbox,
    social posts, and per-user carts/favorites/orders - so this is deliberately
    the widest invalidation in the project. The per-user keys are wildcarded
    because a restore does not know which accounts it moved.
    """
    cache.delete(f"system:host:{host}")
    for pattern in (
        "system:pk:*",
        "core:success_stories:*", "core:success_story:*",
        "core:highlights:*", "core:highlight:*", "core:highlight_item*",
        "core:brands:*", "core:brand:*",
        "core:branches:*", "core:branch:*",
        "core:contact_messages:*",
        "core:social_posts:*",
        "catalog:*",
        "orders:list:*",
        "users:favorites*", "users:cart*",
    ):
        _invalidate_pattern(pattern)


class SiteBackupListCreateView(APIView):
    """
    GET  /api/backups/   - this tenant's restore points, newest first.
    POST /api/backups/   - build a new archive from the selected sections.

    Both are scoped to the caller's own System, taken from their profile and
    never from the request body: a backup is the most concentrated form a
    tenant's data takes, so the tenant boundary is enforced on every path.

    The POST is synchronous - it serialises the database and copies every media
    file into a zip before responding, which is why the CMS shows an
    indeterminate progress bar rather than a percentage.
    """

    permission_classes = [IsSystemAdmin]

    def get(self, request):
        system = user_system(request)
        if system is None:
            return Response({"detail": "No system for this user."}, status=status.HTTP_400_BAD_REQUEST)

        cache_key = _backups_key(system.pk)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        backups = SiteBackup.objects.filter(system=system).select_related("created_by")
        data = SiteBackupSerializer(backups, many=True, context={"request": request}).data
        cache.set(cache_key, data, BACKUPS_CACHE_TTL)
        return Response(data)

    def post(self, request):
        system = user_system(request)
        if system is None:
            return Response({"detail": "No system for this user."}, status=status.HTTP_400_BAD_REQUEST)

        sections = request.data.get("sections") or []
        if isinstance(sections, str):
            sections = [s.strip() for s in sections.split(",") if s.strip()]
        try:
            sections = normalize_sections(sections)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        name = (request.data.get("name") or "").strip()[:255]
        if not name:
            name = timezone.localtime().strftime("%Y-%m-%d %H:%M")

        path, manifest = write_archive(
            system, sections, include_images=SECTION_IMAGES in sections
        )
        try:
            backup = SiteBackup(
                system=system,
                name=name,
                sections=manifest["sections"],
                include_images=manifest["include_images"],
                size_bytes=os.path.getsize(path),
                media_files=manifest["media_files"],
                record_counts=manifest["counts"],
                created_by=request.user if request.user.is_authenticated else None,
            )
            with open(path, "rb") as fh:
                backup.file.save(f"{slugify(name) or 'backup'}.zip", File(fh), save=False)
            backup.save()
        finally:
            # The archive now lives in storage; the working copy must not linger
            # in /tmp, where a few full-catalog backups would fill the disk.
            os.unlink(path)

        cache.delete(_backups_key(system.pk))
        return Response(
            SiteBackupSerializer(backup, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class SiteBackupDetailView(APIView):
    """DELETE /api/backups/<pk>/ - drop a restore point (and its archive)."""

    permission_classes = [IsSystemAdmin]

    def delete(self, request, pk):
        system = user_system(request)
        backup = SiteBackup.objects.filter(pk=pk, system=system).first()
        if backup is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        backup.delete()  # post_delete removes the file - see core/signals.py
        cache.delete(_backups_key(system.pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class SiteBackupDownloadView(APIView):
    """GET /api/backups/<pk>/download/ - stream one archive to its owner.

    This is the ONLY sanctioned way to read a backup, and in production it is
    close to the only lock. The archive sits in the same media namespace as the
    images it contains - a Cloudflare-published R2 bucket, which has no
    per-object ACLs, so the `/media/backups/` deny rule the old nginx sidecar
    carried has no equivalent there. What stands between an archive and the
    internet is the
    uuid4 in its stored name, `SiteBackupSerializer` never exposing `file`, and
    this view matching the row against the caller's own System. See
    `core/storage.py` for the Cloudflare WAF rule that restores a second lock.
    """

    permission_classes = [IsSystemAdmin]

    def get(self, request, pk):
        system = user_system(request)
        backup = SiteBackup.objects.filter(pk=pk, system=system).first()
        if backup is None or not backup.file:
            return Response(status=status.HTTP_404_NOT_FOUND)
        filename = f"{slugify(backup.name) or 'backup'}.zip"
        return FileResponse(
            backup.file.open("rb"),
            as_attachment=True,
            filename=filename,
            content_type="application/zip",
        )


class SiteRestoreView(APIView):
    """POST /api/backups/restore/ - apply an archive to the caller's own site.

    Takes either an uploaded `file` (multipart) or the `backup_id` of a stored
    restore point, plus `sections` and a `mode` (`replace` wipes the selected
    sections and rebuilds; `merge` upserts and leaves untouched rows alone).

    Two guards worth keeping. The archive must name this tenant's host, so a
    mis-picked file cannot overwrite one customer's site with another's; and the
    whole apply runs in a single transaction, so a restore that fails part-way
    leaves the site as it was rather than half-replaced.
    """

    permission_classes = [IsSystemAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        system = user_system(request)
        if system is None:
            return Response({"detail": "No system for this user."}, status=status.HTTP_400_BAD_REQUEST)

        sections = request.data.get("sections") or []
        if isinstance(sections, str):
            sections = [s.strip() for s in sections.split(",") if s.strip()]
        mode = (request.data.get("mode") or MODE_REPLACE).strip()

        upload = request.FILES.get("file")
        backup_id = request.data.get("backup_id")

        if upload is not None:
            path = self._spool(upload)
            cleanup = True
        elif backup_id:
            backup = SiteBackup.objects.filter(pk=backup_id, system=system).first()
            if backup is None or not backup.file:
                return Response({"detail": "Backup not found."}, status=status.HTTP_404_NOT_FOUND)
            path = backup.file.path
            cleanup = False
        else:
            return Response(
                {"detail": "Upload a `file` or name a `backup_id`."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = restore_archive(system, path, sections, mode=mode)
        except BackupError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            # The restore is atomic, so the site is untouched - but the operator
            # must not be shown a stack trace, and the detail belongs in the log.
            logger.exception("restore failed for system %s", system.pk)
            return Response(
                {"detail": "The restore failed and nothing was changed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if cleanup:
                os.unlink(path)

        invalidate_after_restore(system.host)
        return Response(result, status=status.HTTP_200_OK)

    @staticmethod
    def _spool(upload):
        """Write the upload to a temp file.

        `zipfile` needs a seekable file and a large multipart upload arrives as a
        chunked TemporaryUploadedFile, so it is copied out in chunks rather than
        read into memory - a tenant's archive can be hundreds of megabytes.
        """
        handle = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
        try:
            for chunk in upload.chunks():
                handle.write(chunk)
        finally:
            handle.close()
        return handle.name
