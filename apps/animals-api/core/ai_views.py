"""The `/api/ai/*` authoring endpoints - staff only, every one of them.

Four ways to get the LLM to help fill the catalog, all of them **drafting tools**:
nothing here writes to the database. Each returns a patch for the author to
review and apply through the normal endpoints (or to retype in the Django admin,
which is this app's CMS). That separation is the point - a journal's value is
that a person vouched for what it says.

```
POST /api/ai/chat/       stream an arbitrary completion as SSE
POST /api/ai/translate/  fill the other half of a Spanish/English field pair
POST /api/ai/copy/       write or polish a description in one language
POST /api/ai/research/   draft a whole catalog record from live web sources
```

Three rules that apply to all of them:

* **Admins only** (`IsSiteAdmin`), unlike every read endpoint in this project.
  These spend money on a provider and write copy that will be published under
  the journal's name.
* **A missing provider key is a 503**, checked *before* any response is opened -
  see the streaming note below. A 503 from here means the key never reached the
  process, not that a provider is down.
* **Provider errors are reported generically and logged in full.** An upstream
  error body can carry prompt text and account details, and is not something to
  forward to a browser.

Kept out of `core/views.py`, which is strictly the generic cached list/detail
machinery every catalog resource inherits.
"""
import json
import logging

from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .ai_serializers import (
    AiChatSerializer,
    AiCopySerializer,
    AiResearchSerializer,
    AiTranslateSerializer,
)
from .permissions import IsSiteAdmin
from .services import llm
from .services.authoring import generate_copy, translate_fields

logger = logging.getLogger(__name__)

_UNAVAILABLE = 'The AI provider is unavailable. Please try again.'


def _sse_data(payload: dict) -> str:
    return f'data: {json.dumps(payload)}\n\n'


class _AiView(APIView):
    """Shared permission and the not-configured guard."""

    permission_classes = [IsSiteAdmin]

    def unconfigured(self):
        """A 503 when no provider key is set, else None."""
        if llm.is_configured():
            return None
        return Response(
            {'detail': 'No LLM provider is configured.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    def run(self, work):
        """Call an LLM-backed service, turning its failures into clean responses."""
        try:
            return Response(work())
        except llm.LlmNotConfigured:
            # Reachable despite the guard above: Groq can be configured, fail, and
            # find no OpenRouter key behind it.
            return Response(
                {'detail': 'No LLM provider is configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ValueError as e:
            # The services raise this for an argument the serializer could not
            # have rejected (an unsupported language reaching them another way).
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception('AI request failed')
            return Response(
                {'detail': _UNAVAILABLE}, status=status.HTTP_502_BAD_GATEWAY
            )


class AiChatView(_AiView):
    """
    POST /api/ai/chat/ - stream an LLM completion back as OpenAI-shaped SSE.

    The general-purpose endpoint, for a future CMS field-assist button that shows
    text arriving as it is generated. The three endpoints below are the
    structured ones and should be preferred where they fit - they validate what
    comes back, which a free-form stream cannot.
    """

    def post(self, request):
        serializer = AiChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Checked up front: once the first chunk is yielded the 200 is committed,
        # and a misconfiguration could then only be reported inside the stream.
        unavailable = self.unconfigured()
        if unavailable is not None:
            return unavailable

        messages = [dict(m) for m in serializer.validated_data['messages']]
        response = StreamingHttpResponse(
            self._sse(messages, serializer.validated_data['temperature']),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        # nginx buffers proxied responses by default, which would hold the whole
        # completion back and deliver it in one lump - defeating the streaming UI.
        response['X-Accel-Buffering'] = 'no'
        return response

    def _sse(self, messages, temperature):
        try:
            for token in llm.stream_chat(messages, temperature):
                yield _sse_data({'choices': [{'delta': {'content': token}}]})
        except Exception:
            # StreamingHttpResponse commits the 200 before this generator runs, so
            # an error can only be reported *inside* the stream.
            logger.exception('AI chat stream failed')
            yield _sse_data({'error': {'message': _UNAVAILABLE}})
        yield 'data: [DONE]\n\n'


class AiTranslateView(_AiView):
    """
    POST /api/ai/translate/ - translate a field map between Spanish and English.

    Body: ``{"fields": {"name": "Venado cola blanca", ...}, "target": "en",
    "subject": "optional context"}``. The response echoes the request's keys with
    translated values, omitting any the model did not answer for - so the caller
    merges the result rather than diffing it.

    Which column each result lands in is the caller's decision: the same request
    shape fills `en_name` from `name` and `name` from `en_name`.
    """

    def post(self, request):
        serializer = AiTranslateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        unavailable = self.unconfigured()
        if unavailable is not None:
            return unavailable

        return self.run(lambda: {
            'fields': translate_fields(
                fields=data['fields'],
                target=data['target'],
                subject=data.get('subject', ''),
            ),
            'target': data['target'],
        })


class AiCopyView(_AiView):
    """
    POST /api/ai/copy/ - write or polish descriptive copy in one language.

    Body: ``{"subject": "White-tailed Deer", "fields": ["short_description",
    "description"], "language": "es", "context": "...", "drafts": {...}}``.
    Writes one language per call by design: a description and its translation are
    better produced as write-then-translate (this endpoint, then the one above)
    than as one prompt trying to keep two languages in step.
    """

    def post(self, request):
        serializer = AiCopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        unavailable = self.unconfigured()
        if unavailable is not None:
            return unavailable

        return self.run(lambda: {
            'fields': generate_copy(
                subject=data['subject'],
                fields=data.get('fields'),
                language=data['language'],
                context=data.get('context', ''),
                drafts=data.get('drafts'),
            ),
            'language': data['language'],
        })


class AiResearchView(_AiView):
    """
    POST /api/ai/research/ - draft a catalog record from live web sources.

    Body: ``{"subject": "species"|"category"|"location", "name": "...",
    "context": "..."}``. Returns ``{"fields": {...}, "sources": [...],
    "used_web_search": bool}`` where `fields` are real, writable fields of that
    model in **both** languages.

    ⚠ The result is a draft to review, never a row to apply blind. `fields` is
    filtered to the model's real schema, but no filter can tell a true sentence
    from a plausible one - `sources` is returned so the author can check, and
    `used_web_search` says whether there were any (with the scraper unconfigured
    or down, the model answers from its own knowledge and returns none).
    """

    def post(self, request):
        serializer = AiResearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        unavailable = self.unconfigured()
        if unavailable is not None:
            return unavailable

        # Imported here rather than at module scope: `core` is the base app every
        # other one imports, and a top-level `catalog` import would invert that.
        from catalog.services.research import research

        return self.run(lambda: research(
            subject=data['subject'],
            name=data['name'],
            context=data.get('context', ''),
        ))
