import logging

from pydantic import BaseModel, Field

from ..vocab import (
    AUDIO_FORMAT_CHOICES,
    HDR_FORMAT_CHOICES,
    LANGUAGE_NAMES,
    normalize_audio_formats,
    normalize_hdr_formats,
    normalize_language_names,
)
from .llm import chat_structured

logger = logging.getLogger(__name__)

# Cap the raw text handed to the LLM so a fat /extract page can't blow the
# context window or the token bill - the title usually surfaces in the first
# few snippets anyway.
_MAX_INPUT_CHARS = 6000


class ScrapedMovie(BaseModel):
    """
    Schema the LLM must return when cleaning raw web text into a movie record.

    Instructor enforces this shape, so the Celery task never parses JSON by
    hand - it receives a validated `ScrapedMovie` or a raised exception.
    """

    title: str = Field(
        description='Clean canonical theatrical title, with no format/edition suffixes.'
    )
    year: int | None = Field(
        default=None, description='Four-digit original release year, or null if unknown.'
    )
    director: str = Field(
        default='', description="The film's director, or an empty string if not stated."
    )


_SYSTEM_PROMPT = """\
You are a film metadata extraction assistant.

You are given raw, messy web search text gathered for a physical-media barcode \
(DVD / Blu-ray / 4K UHD). Identify the single movie the barcode refers to and \
return its clean, canonical details.

Rules:
- Return the canonical theatrical title only. Strip edition/format noise such as \
  "Blu-ray", "DVD", "4K UHD", "Collector's Edition", "Steelbook", region codes, \
  studio names, and bracketed qualifiers.
- year is the original theatrical release year as a four-digit integer, or null \
  when it cannot be determined from the text.
- director is the film's director if clearly stated, otherwise an empty string. \
  Never guess a director.
- If the text describes a TV series or box set, or you cannot pin down a single \
  film, return an empty title.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{"title": "<string>", "year": <integer or null>, "director": "<string>"}
"""


class ScrapedSynopsis(BaseModel):
    """Schema the LLM returns when distilling a clean plot synopsis."""

    synopsis: str = Field(
        default='',
        description='A concise, spoiler-light plot synopsis of 2-4 sentences, '
        'or an empty string if the text does not describe the film.',
    )


_SYNOPSIS_SYSTEM_PROMPT = """\
You are a film synopsis assistant.

You are given the title of a movie and raw, messy web text gathered for it. \
Write a clean, neutral plot synopsis for that film.

Rules:
- 2-4 sentences, present tense, no spoilers for the ending.
- Describe only the named film. If the text is about a different title, a TV \
  series, merchandise, or you cannot determine the plot, return an empty string.
- Do not include ratings, prices, edition/format details, or marketing copy.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{"synopsis": "<string>"}
"""


def extract_synopsis(raw_text: str, title: str) -> str:
    """
    Distill a clean plot synopsis for `title` from raw scraped web text.

    Returns the synopsis string (possibly empty when the text doesn't describe
    the film). Network / rate-limit errors from the LLM layer propagate to the
    caller (the extras fetch swallows them).
    """
    if not raw_text.strip():
        return ''
    result = chat_structured(
        messages=[
            {'role': 'system', 'content': _SYNOPSIS_SYSTEM_PROMPT},
            {
                'role': 'user',
                'content': f'FILM TITLE: {title}\n\nRAW WEB TEXT:\n'
                f'{raw_text[:_MAX_INPUT_CHARS]}\n\nWrite the synopsis as JSON.',
            },
        ],
        response_model=ScrapedSynopsis,
        temperature=0.2,
    )
    return result.synopsis.strip()


# Allowed values handed to the LLM, built from the canonical vocab so the prompt
# never drifts from the lookup tables.
_AUDIO_VOCAB = ', '.join(f'{code} ({label})' for code, label in AUDIO_FORMAT_CHOICES)
_HDR_VOCAB = ', '.join(f'{code} ({label})' for code, label in HDR_FORMAT_CHOICES)
_LANGUAGE_VOCAB = ', '.join(LANGUAGE_NAMES)


class ScrapedTechSpecs(BaseModel):
    """
    Schema the LLM returns when reading a disc's technical-spec text.

    Every field is a list mapped onto the catalog's controlled vocabulary -
    audio / HDR as short codes, languages as English names. The values are still
    re-normalized in Python afterwards (`extract_tech_specs`), so a stray spelling
    the model slips through is dropped rather than creating a junk row.
    """

    audio_formats: list[str] = Field(
        default_factory=list,
        description='Audio track formats present on the disc, as codes from the allowed set.',
    )
    hdr_formats: list[str] = Field(
        default_factory=list,
        description='Dynamic-range / HDR formats on the disc, as codes from the allowed set.',
    )
    spoken_languages: list[str] = Field(
        default_factory=list,
        description='Languages the disc has audio tracks in, as English names from the allowed set.',
    )
    subtitle_languages: list[str] = Field(
        default_factory=list,
        description='Languages the disc has subtitle tracks in, as English names from the allowed set.',
    )


_TECH_SPECS_SYSTEM_PROMPT = f"""\
You are a physical-media (DVD / Blu-ray / 4K UHD) technical-specification \
extraction assistant.

You are given raw, messy web text gathered for a specific disc release (often \
from blu-ray.com or a retailer listing). Identify the disc's audio formats, \
HDR/dynamic-range formats, audio (spoken) languages, and subtitle languages.

Rules:
- Map every value onto the allowed sets below. Use the exact code for audio and \
  HDR, and the exact English name for languages. Discard anything that does not \
  clearly map to an allowed value.
- Allowed audio format codes: {_AUDIO_VOCAB}.
- Allowed HDR format codes: {_HDR_VOCAB}. A standard (non-HDR) disc is "sdr".
- Allowed languages: {_LANGUAGE_VOCAB}.
- Keep audio languages (spoken/dub tracks) and subtitle languages separate; a \
  language may appear in both.
- Only include a value when the text genuinely supports it. When the text says \
  nothing about a field, return an empty list - never guess.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{{"audio_formats": [<codes>], "hdr_formats": [<codes>], \
"spoken_languages": [<names>], "subtitle_languages": [<names>]}}
"""


def extract_tech_specs(raw_text: str) -> dict:
    """
    Extract a disc's technical specs from raw scraped web text and normalize them
    onto the catalog's controlled vocabulary.

    Returns a dict with keys ``audio_formats`` / ``hdr_formats`` (canonical
    codes) and ``spoken_languages`` / ``subtitle_languages`` (English names),
    each a de-duplicated list with unrecognised values dropped. Best-effort: an
    empty input (or text with no spec signal) yields all-empty lists. Network /
    rate-limit errors from the LLM layer propagate to the caller (the pipeline
    swallows them).
    """
    empty = {
        'audio_formats': [],
        'hdr_formats': [],
        'spoken_languages': [],
        'subtitle_languages': [],
    }
    if not raw_text.strip():
        return empty

    result = chat_structured(
        messages=[
            {'role': 'system', 'content': _TECH_SPECS_SYSTEM_PROMPT},
            {
                'role': 'user',
                'content': f'RAW DISC SPEC TEXT:\n{raw_text[:_MAX_INPUT_CHARS]}\n\n'
                'Extract the technical specs as JSON.',
            },
        ],
        response_model=ScrapedTechSpecs,
        temperature=0.0,
    )
    return {
        'audio_formats': normalize_audio_formats(result.audio_formats),
        'hdr_formats': normalize_hdr_formats(result.hdr_formats),
        'spoken_languages': normalize_language_names(result.spoken_languages),
        'subtitle_languages': normalize_language_names(result.subtitle_languages),
    }


def extract_movie(raw_text: str) -> ScrapedMovie:
    """
    Turn raw scraped web text into a schema-validated `ScrapedMovie`.

    Instructor guarantees the returned object matches the schema, so there is no
    manual JSON parsing. Network / rate-limit errors from the LLM layer
    propagate to the caller (the Celery task owns retries).
    """
    return chat_structured(
        messages=[
            {'role': 'system', 'content': _SYSTEM_PROMPT},
            {
                'role': 'user',
                'content': f'RAW WEB TEXT:\n{raw_text[:_MAX_INPUT_CHARS]}\n\nExtract the movie as JSON.',
            },
        ],
        response_model=ScrapedMovie,
        temperature=0.1,
    )
