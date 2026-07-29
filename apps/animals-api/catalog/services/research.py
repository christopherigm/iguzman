"""Research a catalog subject on the web and map what comes back onto model fields.

Backs `POST /api/ai/research/`. Given little more than a name ("venado cola
blanca"), it:

  1. builds a search query aimed at identification/natural-history pages,
  2. gathers results *with their URLs* via `core.services.scraper`,
  3. has the LLM fill one model's fields from that text - **both** languages of
     every pair in a single call, so the Spanish and the English say the same
     thing rather than being one translated from the other, and
  4. coerces the answer to the target model's real schema before returning it.

The output is a patch, not a row: the view returns it for the author to review
and apply, and nothing here writes to the database. That is deliberate - the
whole point of the catalog is that a human vouched for what it says.

⚠ **What it cannot promise.** An LLM reading search snippets will occasionally
state something the sources do not support, and no amount of prompting fixes
that. `sources` is returned alongside the fields so the author can check;
`_KNOWN_FIELDS` is what stops a hallucinated *field* from reaching a row, but
nothing here can tell a true sentence from a plausible one. Treat every result as
a draft.
"""
import logging

from core.services.llm import chat_json
from core.services.scraper import is_configured as scraper_configured
from core.services.scraper import search_results

logger = logging.getLogger(__name__)

# Cap the raw text handed to the LLM so a fat result set cannot blow the context
# window or the token bill.
_MAX_INPUT_CHARS = 8000

# What each researchable model may have filled in, and how each field is
# described to the model. This is the allowlist: a key the model returns that is
# not here is dropped, so a confident invention lands nowhere. Note what is
# absent - `slug`, `enabled`, `sort_order`, every FK and every image - none of
# which is a research question, and `slug` in particular is a unique key that an
# author (or `prepopulated_fields`) owns.
_SUBJECTS = {
    'species': {
        'label': 'a species (an animal, plant or fungus)',
        'fields': {
            'name': 'the common name in Spanish',
            'en_name': 'the common name in English',
            'scientific_name': 'the binomial scientific name, e.g. "Odocoileus virginianus". '
                               'Null if this is not a biological species.',
            'family': 'the taxonomic family, e.g. "Cervidae". Null if unknown.',
            'short_description': 'a one-sentence summary in Spanish, under 30 words',
            'en_short_description': 'the same summary in English, under 30 words',
            'description': 'two or three short paragraphs in Spanish: appearance, habitat '
                           'and range, behaviour, and when it is typically seen',
            'en_description': 'the same description in English',
        },
    },
    'category': {
        'label': 'a sub-category of a nature journal (a group like "Deer", "Oaks", "Raptors")',
        'fields': {
            'name': 'the group name in Spanish',
            'en_name': 'the group name in English',
            'scientific_name': 'the taxonomic group this corresponds to, e.g. "Cervidae" for '
                               'Deer. Null if the group is not taxonomic.',
            'short_description': 'a one-sentence summary in Spanish, under 30 words',
            'en_short_description': 'the same summary in English, under 30 words',
            'description': 'two or three short paragraphs in Spanish describing what belongs '
                           'to this group and how to recognise it',
            'en_description': 'the same description in English',
        },
    },
    'location': {
        'label': 'a place where wildlife is observed (a park, reserve, trail, lake, beach)',
        'fields': {
            'name': 'the place name in Spanish (keep the local proper name)',
            'en_name': 'the place name in English, ONLY if a genuine established English '
                       'form exists; otherwise null',
            # There is no `region`/`country` here any more, and no `county`/`state`
            # replacing them: those are FKs into the geography catalog now, and a
            # model that answered "Jalisco" could not say *which row* that is. An
            # invented one would then be created by an author accepting the draft.
            # FKs are absent from every subject for exactly this reason.
            'latitude': 'decimal latitude, e.g. 19.412345. Null if not confidently known.',
            'longitude': 'decimal longitude. Null if not confidently known.',
            'short_description': 'a one-sentence summary in Spanish, under 30 words',
            'en_short_description': 'the same summary in English, under 30 words',
            'description': 'two or three short paragraphs in Spanish: the habitat, what can '
                           'be seen there, and when',
            'en_description': 'the same description in English',
        },
    },
}

SUBJECTS = tuple(_SUBJECTS)

# Numeric fields, coerced out of whatever the model returned (a string, a number,
# a "19.41° N") and dropped when they will not parse or fall outside the real
# world. Latitude/longitude are the only ones today.
_COORDINATE_BOUNDS = {'latitude': 90.0, 'longitude': 180.0}


def _query(subject: str, name: str, extra: str) -> str:
    """A search query biased toward identification and natural-history pages."""
    if subject == 'location':
        base = f'{name} parque reserva naturaleza wildlife nature reserve'
    else:
        base = f'{name} species identification habitat behaviour nombre científico hábitat'
    return f'{base} {extra}'.strip()


def _system_prompt(subject: str, has_sources: bool) -> str:
    spec = _SUBJECTS[subject]
    field_lines = '\n'.join(f'- "{key}": {desc}' for key, desc in spec['fields'].items())
    sourcing = (
        'Base every statement on the search results above. Where they do not support a '
        'field, return null for it rather than guessing.'
        if has_sources else
        'No search results were available, so answer from your own knowledge. Return null '
        'for anything you are not confident about - a null is far more useful here than a '
        'plausible invention.'
    )
    return f"""\
You are a field naturalist filling in a catalog record for {spec['label']} in a \
public nature journal.

Return a JSON object with EXACTLY these keys:
{field_lines}

Rules:
- {sourcing}
- Spanish and English versions must state the SAME facts. Write each in natural, \
idiomatic prose - do not produce a word-for-word translation of the other.
- Never invent a scientific name, a coordinate, or a statistic. Null is correct \
when you do not know.
- Plain, observational prose. No marketing language and no second-person address.
- Return ONLY the JSON object - no markdown, no commentary.\
"""


def _coerce(subject: str, result: dict) -> dict:
    """Keep only real fields of `subject`, cleaned to their column's type."""
    allowed = _SUBJECTS[subject]['fields']
    out = {}
    for key, value in (result or {}).items():
        if key not in allowed or value is None:
            continue
        if key in _COORDINATE_BOUNDS:
            number = _coerce_coordinate(value, _COORDINATE_BOUNDS[key])
            if number is not None:
                out[key] = number
            continue
        text = value.strip() if isinstance(value, str) else ''
        # A model asked for null sometimes writes the *word* instead.
        if text and text.lower() not in ('null', 'none', 'n/a', 'unknown', 'desconocido'):
            out[key] = text
    return out


def _coerce_coordinate(value, limit: float) -> float | None:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if number != number or abs(number) > limit:  # NaN or out of range
        return None
    return round(number, 6)


def research(subject: str, name: str, context: str = '') -> dict:
    """Draft one catalog record's fields from the web.

    Returns ``{'fields': {...}, 'sources': [{title, url}], 'used_web_search': bool}``.
    ``fields`` holds only keys that really belong to `subject` and that the model
    answered - never a slug, an id or an image.

    Degrades rather than failing: with the scraper unconfigured (or returning
    nothing) it answers from the model's own knowledge, with `sources` empty and
    `used_web_search` false, so the caller can show the author how the draft was
    arrived at. LLM configuration errors propagate - those are a deployment
    problem the caller turns into a 503.
    """
    if subject not in _SUBJECTS:
        raise ValueError(f'Unknown research subject {subject!r}; expected one of {SUBJECTS}.')

    name = (name or '').strip()
    empty = {'fields': {}, 'sources': [], 'used_web_search': False}
    if not name:
        return empty

    results = []
    if scraper_configured():
        try:
            results = search_results(_query(subject, name, context))
        except Exception as e:
            # A scraper outage must not take the endpoint down with it: the LLM
            # can still answer from its own knowledge, which is the unconfigured
            # path and is already handled below.
            logger.warning('Web research failed for %r (%s); answering without sources', name, e)

    if results:
        sources_text = '\n\n'.join(
            f"TITLE: {r['title']}\nURL: {r['url']}\nSNIPPET: {r['snippet']}" for r in results
        )[:_MAX_INPUT_CHARS]
        user = f'SEARCH RESULTS:\n{sources_text}\n\nSUBJECT: {name}'
    else:
        user = f'SUBJECT: {name}'
    if context:
        user = f'{user}\nCONTEXT: {context.strip()}'

    result = chat_json(
        messages=[
            {'role': 'system', 'content': _system_prompt(subject, bool(results))},
            {'role': 'user', 'content': user},
        ],
        # Near-greedy: this is fact extraction, and sampling variety here just
        # means a different set of things to fact-check on every run.
        temperature=0.2,
    )

    return {
        'fields': _coerce(subject, result),
        'sources': [{'title': r['title'], 'url': r['url']} for r in results],
        'used_web_search': bool(results),
    }
