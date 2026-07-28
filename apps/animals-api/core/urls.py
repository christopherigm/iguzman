"""The site-wide endpoints owned by `core`.

Three groups, and they are unrelated to each other:

* **Site settings** (`/api/system/`) - the singleton the CMS edits and every
  public page reads. Public on GET, administrators only on PATCH.
* **Backup & restore** (`/api/backups/...`) - administrators only.
* **AI authoring** (`/api/ai/*`) - the drafting tools, administrators only.
  None of them writes to the database; see `core/ai_views.py`.
"""
from django.urls import path

from .ai_views import AiChatView, AiCopyView, AiResearchView, AiTranslateView
from .backup_views import (
    SiteBackupDetailView,
    SiteBackupDownloadView,
    SiteBackupListView,
    SiteBackupRestoreView,
)
from .system_views import SystemView

urlpatterns = [
    # No pk: System is a singleton here, not a tenant. See core/system_views.py.
    path('system/', SystemView.as_view(), name='system'),

    # `restore/` is declared before `<int:pk>/` so the literal cannot be read as
    # a pk by a future converter change.
    path('backups/', SiteBackupListView.as_view(), name='backup-list'),
    path('backups/restore/', SiteBackupRestoreView.as_view(), name='backup-restore'),
    path('backups/<int:pk>/', SiteBackupDetailView.as_view(), name='backup-detail'),
    path('backups/<int:pk>/download/', SiteBackupDownloadView.as_view(), name='backup-download'),

    path('ai/chat/', AiChatView.as_view(), name='ai-chat'),
    path('ai/translate/', AiTranslateView.as_view(), name='ai-translate'),
    path('ai/copy/', AiCopyView.as_view(), name='ai-copy'),
    path('ai/research/', AiResearchView.as_view(), name='ai-research'),
]
