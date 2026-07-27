from django.urls import path

from .views import (
    AdminContactMessageDetailView,
    AdminContactMessageListView,
    AdminContactMessageReplyView,
    AiChatView,
    BranchDetailView,
    BranchListCreateView,
    BrandDetailView,
    BrandListCreateView,
    CompanyHighlightBySlugView,
    CompanyHighlightDetailView,
    CompanyHighlightItemDetailView,
    CompanyHighlightItemsView,
    CompanyHighlightListView,
    ContactMessageCreateView,
    PublishSiteView,
    SiteBackupDetailView,
    SiteBackupDownloadView,
    SiteBackupListCreateView,
    SiteRestoreView,
    SlugCheckView,
    SocialPostDetailView,
    SocialPostListCreateView,
    SuccessStoryBySlugView,
    SuccessStoryDetailView,
    SuccessStoryImageDetailView,
    SuccessStoryImagesView,
    SuccessStoryListView,
    SystemListView,
    SystemView,
)

urlpatterns = [
    path("systems/", SystemListView.as_view(), name="system-list"),
    path("publish-site/", PublishSiteView.as_view(), name="publish-site"),
    path("system/", SystemView.as_view(), name="system-detail"),
    path("system/<int:pk>/", SystemView.as_view(), name="system-update"),

    path("success-stories/", SuccessStoryListView.as_view(), name="success-story-list"),
    path("success-stories/slug/<slug:slug>/", SuccessStoryBySlugView.as_view(), name="success-story-by-slug"),
    path("success-stories/<int:pk>/", SuccessStoryDetailView.as_view(), name="success-story-detail"),
    path("success-stories/<int:pk>/images/", SuccessStoryImagesView.as_view(), name="success-story-images"),
    path("success-stories/<int:pk>/images/<int:img_pk>/", SuccessStoryImageDetailView.as_view(), name="success-story-image-detail"),

    path("highlights/", CompanyHighlightListView.as_view(), name="highlight-list"),
    path("highlights/slug/<slug:slug>/", CompanyHighlightBySlugView.as_view(), name="highlight-by-slug"),
    path("highlights/<int:pk>/", CompanyHighlightDetailView.as_view(), name="highlight-detail"),
    path("highlights/<int:pk>/items/", CompanyHighlightItemsView.as_view(), name="highlight-items"),
    path("highlights/<int:pk>/items/<int:item_pk>/", CompanyHighlightItemDetailView.as_view(), name="highlight-item-detail"),

    path("brands/", BrandListCreateView.as_view(), name="brand-list"),
    path("brands/<int:pk>/", BrandDetailView.as_view(), name="brand-detail"),

    path("branches/", BranchListCreateView.as_view(), name="branch-list"),
    path("branches/<int:pk>/", BranchDetailView.as_view(), name="branch-detail"),

    # Public create; admin inbox is under /admin/ so the allowlist can tell them
    # apart (only the admin paths carry customer PII).
    path("contact-messages/", ContactMessageCreateView.as_view(), name="contact-message-create"),
    path("contact-messages/admin/", AdminContactMessageListView.as_view(), name="contact-message-admin-list"),
    path("contact-messages/admin/<int:pk>/", AdminContactMessageDetailView.as_view(), name="contact-message-admin-detail"),
    path("contact-messages/admin/<int:pk>/reply/", AdminContactMessageReplyView.as_view(), name="contact-message-admin-reply"),

    path("social-posts/", SocialPostListCreateView.as_view(), name="social-post-list"),
    path("social-posts/<int:pk>/", SocialPostDetailView.as_view(), name="social-post-detail"),

    # Backup & restore. `restore/` is declared before `<int:pk>/` so the literal
    # segment is not swallowed by the detail route.
    path("backups/", SiteBackupListCreateView.as_view(), name="backup-list"),
    path("backups/restore/", SiteRestoreView.as_view(), name="backup-restore"),
    path("backups/<int:pk>/", SiteBackupDetailView.as_view(), name="backup-detail"),
    path("backups/<int:pk>/download/", SiteBackupDownloadView.as_view(), name="backup-download"),

    path("check-slug/", SlugCheckView.as_view(), name="check-slug"),

    path("ai/chat/", AiChatView.as_view(), name="ai-chat"),
]
