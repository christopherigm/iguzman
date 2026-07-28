"""Backup & restore endpoints - administrators only.

::

    GET    /api/backups/                list the restore points
    POST   /api/backups/                build one (synchronous)
    DELETE /api/backups/<pk>/           delete a restore point and its file
    GET    /api/backups/<pk>/download/  stream the archive
    POST   /api/backups/restore/        apply an uploaded archive (multipart)

Building and restoring are **synchronous**: each is one request that serialises
the database and copies every media file. That is why gunicorn's timeout and the
ingress's read/send timeouts are 600s, and why the CMS's progress bar is
indeterminate - the server has no way to report a percentage back mid-request,
and a fake one would be worse than an honest animation.

⚠ ``SiteBackupSerializer`` deliberately does not expose ``file``. Publishing
that URL would route around ``SiteBackupDownloadView``, which is the only
sanctioned read path - see ``core/backup.py``'s header for what that protects.
"""

import os

from django.core.files import File
from django.http import FileResponse
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog import cache_keys as catalog_keys
from journal import cache_keys as journal_keys

from . import cache_keys as keys
from .backup import (
    ALL_SECTIONS,
    BackupError,
    MODE_REPLACE,
    RESTORE_MODES,
    normalize_sections,
    read_manifest,
    restore_archive,
    write_archive,
)
from .cache import invalidate
from .models import SiteBackup
from .permissions import IsSiteAdmin


def _invalidate_everything():
    """Clear every cached payload after a restore.

    A restore rewrites arbitrary rows across three apps without going through
    any of their views or (for bulk deletes) their receivers, so there is no
    targeted set to clear - the honest answer is "all of it".
    """
    invalidate(
        keys.SYSTEM,
        catalog_keys.CATEGORIES, catalog_keys.CATEGORY,
        catalog_keys.SPECIES_LIST, catalog_keys.SPECIES,
        catalog_keys.SEASONS, catalog_keys.SEASON,
        catalog_keys.WEATHER_CONDITIONS, catalog_keys.WEATHER_CONDITION,
        catalog_keys.LOCATIONS, catalog_keys.LOCATION,
        catalog_keys.KINDS,
        journal_keys.SIGHTINGS, journal_keys.SIGHTING, journal_keys.STATS,
    )


class SiteBackupSerializer(serializers.ModelSerializer):
    created_by_email = serializers.SerializerMethodField()

    class Meta:
        model = SiteBackup
        # `file` is absent on purpose - see this module's docstring.
        fields = (
            'id', 'name', 'sections', 'size_bytes',
            'total_records', 'media_files', 'created', 'created_by_email',
        )

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by_id else None


class SiteBackupListView(APIView):
    permission_classes = [IsSiteAdmin]

    def get(self, request):
        qs = SiteBackup.objects.select_related('created_by').all()
        return Response(SiteBackupSerializer(qs, many=True).data)

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        sections = request.data.get('sections') or list(ALL_SECTIONS)
        if not name:
            return Response({'detail': 'A name is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sections = normalize_sections(sections)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        path, manifest = write_archive(sections)
        try:
            backup = SiteBackup(
                name=name[:128],
                sections=sections,
                size_bytes=os.path.getsize(path),
                total_records=sum((manifest.get('counts') or {}).values()),
                media_files=manifest.get('media_files', 0),
                created_by=request.user if request.user.is_authenticated else None,
            )
            with open(path, 'rb') as fh:
                backup.file.save(f'{name[:64]}.zip', File(fh), save=False)
            backup.save()
        finally:
            # The temp file has been copied into storage either way; leaving it
            # behind would slowly fill the pod's disk.
            os.unlink(path)

        return Response(SiteBackupSerializer(backup).data, status=status.HTTP_201_CREATED)


class SiteBackupDetailView(APIView):
    permission_classes = [IsSiteAdmin]

    def delete(self, request, pk):
        backup = SiteBackup.objects.filter(pk=pk).first()
        if backup is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        # `SiteBackup.delete` removes the stored zip too.
        backup.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SiteBackupDownloadView(APIView):
    """Stream one archive. The only sanctioned way to read a backup file."""

    permission_classes = [IsSiteAdmin]

    def get(self, request, pk):
        backup = SiteBackup.objects.filter(pk=pk).first()
        if backup is None or not backup.file:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Opened through the storage backend rather than by path: in production
        # the file is an object in R2, not something on this pod's filesystem.
        response = FileResponse(
            backup.file.open('rb'),
            as_attachment=True,
            filename=f'{backup.name}.zip',
            content_type='application/zip',
        )
        return response


class SiteBackupRestoreView(APIView):
    """POST an archive back. Multipart, because a zip cannot ride in JSON."""

    permission_classes = [IsSiteAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if upload is None:
            return Response({'detail': 'No archive was uploaded.'}, status=status.HTTP_400_BAD_REQUEST)

        mode = request.data.get('mode') or MODE_REPLACE
        if mode not in RESTORE_MODES:
            return Response({'detail': f'Unknown restore mode {mode!r}.'}, status=status.HTTP_400_BAD_REQUEST)

        sections = request.data.getlist('sections') if hasattr(request.data, 'getlist') else None
        if not sections:
            sections = list(ALL_SECTIONS)

        # Written to a temp file rather than read into memory: zipfile needs a
        # seekable source and an archive with media is far larger than a request
        # worker should hold.
        import tempfile

        handle = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
        try:
            for chunk in upload.chunks():
                handle.write(chunk)
            handle.close()
            # Validate the manifest before doing anything else, so a wrong file
            # is refused with a readable message rather than part-applied.
            read_manifest(handle.name)
            result = restore_archive(handle.name, sections, mode=mode)
        except BackupError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            handle.close()
            if os.path.exists(handle.name):
                os.unlink(handle.name)

        _invalidate_everything()
        return Response(result)
