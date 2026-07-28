"""The AI authoring endpoints.

`core` owns no content models, so this file exists only to route the `/api/ai/*`
drafting tools. Every one of them is staff-only - see `core/ai_views.py`.
"""
from django.urls import path

from .ai_views import AiChatView, AiCopyView, AiResearchView, AiTranslateView

urlpatterns = [
    path('ai/chat/', AiChatView.as_view(), name='ai-chat'),
    path('ai/translate/', AiTranslateView.as_view(), name='ai-translate'),
    path('ai/copy/', AiCopyView.as_view(), name='ai-copy'),
    path('ai/research/', AiResearchView.as_view(), name='ai-research'),
]
