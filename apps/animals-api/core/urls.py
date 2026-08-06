"""The site-wide endpoints owned by `core`.

Four groups, and they are unrelated to each other:

* **Site settings** (`/api/system/`) - the singleton the CMS edits and every
  public page reads. Public on GET, administrators only on PATCH.
* **Backup & restore** (`/api/backups/...`) - administrators only.
* **AI authoring** (`/api/ai/*`) - the drafting tools, administrators only.
  None of them writes to the database; see `core/ai_views.py`.
* **My contributions** (`/api/contributions/...`) - what a signed-in reader has
  filed, and the only place they may edit or withdraw it. Scoped to the caller's
  own rows and deliberately uncached; see `core/my_contributions.py`.
"""
from django.urls import path

from .ai_views import AiChatView, AiCopyView, AiResearchView, AiTranslateView
from .backup_views import (
    SiteBackupDetailView,
    SiteBackupDownloadView,
    SiteBackupListView,
    SiteBackupRestoreView,
)
from .my_contributions import MyContributionDetailView, MyContributionListView
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

    # A contributor's own records. `<str:type_key>` is one of `sightings`,
    # `species`, `locations` - matched against `CONTRIBUTION_TYPES` in the view,
    # so an unknown segment is a 404 rather than a URL that never resolves.
    path(
        'contributions/',
        MyContributionListView.as_view(),
        name='my-contribution-list',
    ),
    path(
        'contributions/<str:type_key>/<int:pk>/',
        MyContributionDetailView.as_view(),
        name='my-contribution-detail',
    ),

    path('ai/chat/', AiChatView.as_view(), name='ai-chat'),
    path('ai/translate/', AiTranslateView.as_view(), name='ai-translate'),
    path('ai/copy/', AiCopyView.as_view(), name='ai-copy'),
    path('ai/research/', AiResearchView.as_view(), name='ai-research'),
]
