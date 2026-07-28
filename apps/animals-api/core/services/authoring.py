"""Translating and writing the catalog's copy with an LLM.

Two authoring jobs that both operate on a **field map** - the ``{field: text}``
shape the CMS forms are made of - rather than on free text:

* ``translate_fields`` fills the other half of a Spanish/English pair.
* ``generate_copy`` writes a description or a short description from scratch (or
  polishes a draft) in one language.

Both return only fields they actually produced, so a caller can merge the result
straight onto a row without a "did the model answer for this one?" branch. Both
are `chat_json` calls: the caller is code applying a patch, not a human watching
tokens arrive - `/api/ai/chat/` exists for that.

The prompts mirror `apps/website/components/admin/field-assist.tsx`, which builds
the same two prompts for website's CMS. Keep them recognisably the same shape;
what differs here is the subject matter (a nature field journal, not a
storefront) and that the field map is translated in one call rather than one call
per field.
"""
import json
import logging

from core.models import TRANSLATED_FIELDS

from .llm import chat_json

logger = logging.getLogger(__name__)


def _as_json(value) -> str:
    """The user turn, as compact JSON. `ensure_ascii=False` keeps accented
    Spanish readable to the model rather than escaping it into \\uXXXX."""
    return json.dumps(value, ensure_ascii=False)

# Which language each side of a pair is written in. The bare field is Spanish and
# `en_*` is English - see core.models.TRANSLATED_FIELDS.
LANGUAGES = {
    'es': 'Spanish',
    'en': 'English',
}

# What each field is *for*, so the model writes to the right length and register
# instead of producing three paragraphs where a card expects one line. Keyed by
# the bare field name; the `en_` twin resolves to the same entry.
FIELD_CONTEXT = {
    'name': {
        'what': 'the common name of a species, category, place, season or weather condition',
        'guidance': 'A name is a few words at most. Use the established common name in the '
                    'target language where one exists (a species usually has one); never '
                    'translate a scientific/Latin name, and never invent a name that is not '
                    'in use - repeat the original if there is no accepted equivalent.',
    },
    'short_description': {
        'what': 'the one- or two-line summary shown on a card or list row',
        'guidance': 'Keep it under 30 words. One sentence, no line breaks, no closing '
                    'flourish - it sits under a title in a small box.',
    },
    'description': {
        'what': 'the full description on a detail page',
        'guidance': 'Two or three short paragraphs. Concrete and observational - what it '
                    'looks like, where and when it is seen, what it does. No marketing '
                    'language and no invented statistics.',
    },
}

_DEFAULT_CONTEXT = {
    'what': 'a field of a nature journal entry',
    'guidance': 'Match the length and register of the original.',
}


def _context_for(field: str) -> dict:
    """The FIELD_CONTEXT entry for a field, with the `en_` prefix stripped."""
    return FIELD_CONTEXT.get(field.removeprefix('en_'), _DEFAULT_CONTEXT)


def _field_brief(fields: dict) -> str:
    """A per-field line telling the model what each key is and how long it runs."""
    lines = []
    for field in fields:
        ctx = _context_for(field)
        lines.append(f'- "{field}": {ctx["what"]}. {ctx["guidance"]}')
    return '\n'.join(lines)


def _clean(value) -> str:
    return value.strip() if isinstance(value, str) else ''


def _harvest(result: dict, keys) -> dict:
    """Keep the string values the model returned for `keys`, dropping the rest.

    The model is asked for an exact key set and usually obeys, but a stray key,
    a null, or a number would otherwise be written onto a row verbatim. Anything
    that is not a non-empty string for a key we asked about is dropped, which is
    what lets a caller apply the result without validating it again.
    """
    return {key: _clean(result.get(key)) for key in keys if _clean(result.get(key))}


# ---------------------------------------------------------------------------
# Translation
# ---------------------------------------------------------------------------

def translate_fields(fields: dict, target: str, subject: str = '') -> dict:
    """Translate a ``{field: text}`` map into `target` ('es' or 'en').

    ``fields`` is keyed by the **source** field names; the returned map uses the
    same keys, holding the translated text. Turning `{'name': 'Venado'}` into the
    row's `en_name` is the caller's job - this function does not know which side
    of a pair it is filling, which is what lets it serve both directions.

    ``subject`` is optional context ("White-tailed Deer", "a sighting at Parque
    Ecológico") that disambiguates a short field: "Ciervo" alone could be a
    species, a category or a place name.

    Returns only the fields the model actually translated. An empty input, or an
    input whose every value is blank, returns ``{}`` without calling the provider
    - there is nothing to translate and no reason to spend a request on it.
    """
    if target not in LANGUAGES:
        raise ValueError(f'Unsupported target language {target!r}; expected one of {sorted(LANGUAGES)}.')

    payload = {key: _clean(value) for key, value in (fields or {}).items() if _clean(value)}
    if not payload:
        return {}

    source_label = LANGUAGES['en'] if target == 'es' else LANGUAGES['es']
    target_label = LANGUAGES[target]

    system = f"""\
You are a professional translator working on a public nature field journal \
(wildlife, plants, fungi, seasons, weather, and the places they are observed).

Translate each value in the user's JSON object from {source_label} to \
{target_label}. Return a JSON object with EXACTLY the same keys.

What each key is:
{_field_brief(payload)}

Rules:
- Translate only. Do not add, remove, summarise or embellish anything.
- Preserve the original's paragraph breaks, length and register.
- Never translate a scientific (Latin) name, and keep proper place names in \
their original form unless a genuine established {target_label} form exists.
- If a value has no sensible translation, repeat it unchanged.
- Return ONLY the JSON object - no markdown, no commentary.\
"""

    user = payload if not subject else {'subject': subject, 'fields': payload}
    result = chat_json(
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': _as_json(user)},
        ],
        # Deterministic: a translation is not a place for sampling variety, and it
        # makes re-running the same field idempotent.
        temperature=0.0,
    )
    # Tolerate the model wrapping its answer in the same {"fields": ...} envelope
    # it was handed.
    if isinstance(result.get('fields'), dict):
        result = result['fields']
    return _harvest(result, payload.keys())


# ---------------------------------------------------------------------------
# Copy generation
# ---------------------------------------------------------------------------

def generate_copy(
    subject: str,
    fields=None,
    language: str = 'es',
    context: str = '',
    drafts=None,
) -> dict:
    """Write (or rewrite) descriptive copy about `subject` in `language`.

    ``fields`` names which of TRANSLATED_FIELDS to produce - by default the two
    description lengths, since `name` is what the author already typed.
    ``context`` is anything extra worth knowing (the category, the place, the
    date), and ``drafts`` is a ``{field: text}`` map of existing copy to polish
    rather than replace.

    Returns ``{field: text}`` for the fields the model wrote.
    """
    if language not in LANGUAGES:
        raise ValueError(f'Unsupported language {language!r}; expected one of {sorted(LANGUAGES)}.')

    subject = _clean(subject)
    if not subject:
        return {}

    wanted = [f for f in (fields or ('short_description', 'description')) if f.removeprefix('en_') in TRANSLATED_FIELDS]
    if not wanted:
        return {}

    drafts = {k: _clean(v) for k, v in (drafts or {}).items() if _clean(v)}
    language_label = LANGUAGES[language]

    system = f"""\
You are a naturalist writing for a public nature field journal - a personal, \
observational record of wildlife, plants, fungi, seasons and weather.

Write the requested fields about the subject, in {language_label}. Return a JSON \
object with EXACTLY these keys: {', '.join(f'"{f}"' for f in wanted)}.

What each key is:
{_field_brief({f: None for f in wanted})}

Rules:
- Write plainly and concretely, in the voice of someone who has been outdoors \
looking at this. No marketing language, no second-person address to the reader.
- State only what is generally true of the subject. Never invent a specific \
observation, date, place, measurement or statistic - this is a factual record.
- If a draft is supplied for a field, improve that draft rather than replacing \
its content.
- Return ONLY the JSON object - no markdown, no commentary.\
"""

    user = {'subject': subject}
    if context:
        user['context'] = _clean(context)
    if drafts:
        user['drafts'] = drafts

    result = chat_json(
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': _as_json(user)},
        ],
        # Some latitude, unlike translation: this is prose being written, and a
        # fully greedy decode reads flat.
        temperature=0.6,
    )
    return _harvest(result, wanted)
