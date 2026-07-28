"""Request bodies for the `/api/ai/*` authoring endpoints.

Kept out of `core/serializers.py`, which is the shared image-processing layer
every content serializer imports and has nothing to do with these.
"""
from rest_framework import serializers

from core.models import TRANSLATED_FIELDS
from core.services.authoring import LANGUAGES

# Every field either endpoint may be asked to write: both members of each
# translated pair. Spelled as a choice list so a typo is a 400 naming the valid
# options, rather than a silently ignored key.
_WRITABLE_FIELDS = sorted(
    {*TRANSLATED_FIELDS, *(f'en_{f}' for f in TRANSLATED_FIELDS)}
)


class AiChatMessageSerializer(serializers.Serializer):
    """One chat message. Mirrors the OpenAI wire shape."""

    role = serializers.ChoiceField(choices=['system', 'user', 'assistant'])
    content = serializers.CharField(trim_whitespace=False, max_length=32000)


class AiChatSerializer(serializers.Serializer):
    """Body of POST /api/ai/chat/.

    The client does not choose a provider or a model: provider choice (Groq,
    falling back to OpenRouter) is a backend concern, so a `model` key in the
    body is deliberately not read.
    """

    messages = AiChatMessageSerializer(many=True, allow_empty=False, max_length=50)
    temperature = serializers.FloatField(min_value=0, max_value=2, default=0.7)


class AiTranslateSerializer(serializers.Serializer):
    """Body of POST /api/ai/translate/.

    `fields` is a ``{field: text}`` map keyed by the **source** field names, and
    the response echoes those same keys. Which column the caller writes each
    result to is the caller's decision - this endpoint does not know whether it
    is filling `en_name` from `name` or the reverse.
    """

    fields = serializers.DictField(
        child=serializers.CharField(trim_whitespace=False, allow_blank=True, max_length=32000),
        allow_empty=False,
    )
    target = serializers.ChoiceField(choices=sorted(LANGUAGES))
    subject = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate_fields(self, value):
        unknown = sorted(set(value) - set(_WRITABLE_FIELDS))
        if unknown:
            raise serializers.ValidationError(
                f'Not translatable fields: {", ".join(unknown)}. '
                f'Expected any of: {", ".join(_WRITABLE_FIELDS)}.'
            )
        return value


class AiCopySerializer(serializers.Serializer):
    """Body of POST /api/ai/copy/ - write or polish descriptive copy."""

    subject = serializers.CharField(max_length=255)
    fields = serializers.ListField(
        child=serializers.ChoiceField(choices=_WRITABLE_FIELDS),
        required=False,
        allow_empty=False,
        max_length=len(_WRITABLE_FIELDS),
    )
    language = serializers.ChoiceField(choices=sorted(LANGUAGES), default='es')
    context = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    drafts = serializers.DictField(
        child=serializers.CharField(trim_whitespace=False, allow_blank=True, max_length=32000),
        required=False,
    )


class AiResearchSerializer(serializers.Serializer):
    """Body of POST /api/ai/research/ - draft a catalog record from the web."""

    # A plain CharField validated by hand, rather than a ChoiceField: the list of
    # researchable subjects lives in `catalog.services.research`, and a
    # ChoiceField would need it at class-definition time - making `core` import
    # `catalog` when this module loads, which inverts the dependency (`core` is
    # the base app every other one imports). The lazy import below keeps the
    # single source of truth without the cycle.
    subject = serializers.CharField(max_length=32)
    name = serializers.CharField(max_length=255)
    context = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate_subject(self, value):
        from catalog.services.research import SUBJECTS

        if value not in SUBJECTS:
            raise serializers.ValidationError(
                f'Unknown subject. Expected one of: {", ".join(sorted(SUBJECTS))}.'
            )
        return value
