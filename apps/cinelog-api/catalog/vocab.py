"""
Controlled vocabulary for a disc's technical specifications.

Audio formats, HDR/dynamic-range formats, and languages are scraped from messy
web text (blu-ray.com & friends) by the LLM, which is told to map whatever it
finds onto these canonical sets. Keeping the canonical lists - and their aliases -
in one module is what stops the lookup tables filling with near-duplicate rows
("Dolby Atmos" vs "Atmos" vs "ATMOS"). The seed migration, the LLM prompt, the
serializers, and the admin all read from here so nothing drifts.

Each vocabulary is a list of ``(code, label)`` tuples:
- audio / HDR  : ``code`` is a short slug carried through the API and used as the
  button key in the UI; ``label`` is the brand name shown to the user.
- languages    : ``code`` is the ISO 639-1 code; ``label`` is the English name.
  Languages are carried through the API and stored on the queue entry as their
  *label* (like genres), so the existing comma-list inputs work unchanged.

`ALIASES` maps a lower-cased spelling the LLM might emit (a code, the label, or a
common variant) to the canonical code. `normalize_*` runs scraped values through
it, dropping anything unrecognised - best-effort, never raising.
"""

# ── Audio formats ───────────────────────────────────────────────────────────────
AUDIO_FORMAT_CHOICES = [
    ('atmos', 'Dolby Atmos'),
    ('truehd', 'Dolby TrueHD'),
    ('ddplus', 'Dolby Digital Plus'),
    ('dd', 'Dolby Digital'),
    ('dtsx', 'DTS:X'),
    ('dtshd', 'DTS-HD Master Audio'),
    ('dts', 'DTS'),
    ('lpcm', 'LPCM'),
    ('other', 'Other'),
]

# ── HDR / dynamic-range formats ─────────────────────────────────────────────────
HDR_FORMAT_CHOICES = [
    ('dolbyvision', 'Dolby Vision'),
    ('hdr10plus', 'HDR10+'),
    ('hdr10', 'HDR10'),
    ('hlg', 'HLG'),
    ('sdr', 'SDR'),
]

# ── Languages (ISO 639-1 code, English name) ────────────────────────────────────
LANGUAGE_CHOICES = [
    ('en', 'English'),
    ('es', 'Spanish'),
    ('fr', 'French'),
    ('de', 'German'),
    ('it', 'Italian'),
    ('pt', 'Portuguese'),
    ('ja', 'Japanese'),
    ('ko', 'Korean'),
    ('zh', 'Chinese'),
    ('ru', 'Russian'),
    ('hi', 'Hindi'),
    ('ar', 'Arabic'),
    ('nl', 'Dutch'),
    ('sv', 'Swedish'),
    ('da', 'Danish'),
    ('no', 'Norwegian'),
    ('fi', 'Finnish'),
    ('pl', 'Polish'),
    ('cs', 'Czech'),
    ('hu', 'Hungarian'),
    ('tr', 'Turkish'),
    ('th', 'Thai'),
    ('el', 'Greek'),
    ('he', 'Hebrew'),
    ('id', 'Indonesian'),
    ('uk', 'Ukrainian'),
    ('ro', 'Romanian'),
    ('vi', 'Vietnamese'),
    ('tl', 'Tagalog'),
    ('ca', 'Catalan'),
]

AUDIO_FORMAT_CODES = [code for code, _ in AUDIO_FORMAT_CHOICES]
HDR_FORMAT_CODES = [code for code, _ in HDR_FORMAT_CHOICES]
LANGUAGE_CODES = [code for code, _ in LANGUAGE_CHOICES]
LANGUAGE_NAMES = [label for _, label in LANGUAGE_CHOICES]


def _build_aliases(choices, extra):
    """
    Map every recognised spelling (code, label, and hand-picked variants) to its
    canonical code, all lower-cased for case-insensitive matching.
    """
    aliases = {}
    for code, label in choices:
        aliases[code.lower()] = code
        aliases[label.lower()] = code
    for variant, code in extra.items():
        aliases[variant.lower()] = code
    return aliases


# Common spellings the LLM (or a disc spec sheet) emits for the same format.
_AUDIO_ALIASES = _build_aliases(AUDIO_FORMAT_CHOICES, {
    'dolby atmos': 'atmos',
    'atmos': 'atmos',
    'dolby truehd': 'truehd',
    'truehd': 'truehd',
    'true hd': 'truehd',
    'dolby digital plus': 'ddplus',
    'dd+': 'ddplus',
    'eac3': 'ddplus',
    'e-ac-3': 'ddplus',
    'dolby digital': 'dd',
    'ac3': 'dd',
    'ac-3': 'dd',
    'dts:x': 'dtsx',
    'dts x': 'dtsx',
    'dts-x': 'dtsx',
    'dts-hd master audio': 'dtshd',
    'dts-hd ma': 'dtshd',
    'dts hd master audio': 'dtshd',
    'dtshd': 'dtshd',
    'pcm': 'lpcm',
    'linear pcm': 'lpcm',
})

_HDR_ALIASES = _build_aliases(HDR_FORMAT_CHOICES, {
    'dolby vision': 'dolbyvision',
    'dv': 'dolbyvision',
    'hdr10+': 'hdr10plus',
    'hdr10 plus': 'hdr10plus',
    'hdr 10+': 'hdr10plus',
    'hdr10': 'hdr10',
    'hdr 10': 'hdr10',
    'hdr': 'hdr10',
    'hlg': 'hlg',
    'sdr': 'sdr',
    'standard dynamic range': 'sdr',
})

_LANGUAGE_ALIASES = _build_aliases(LANGUAGE_CHOICES, {
    'mandarin': 'zh',
    'cantonese': 'zh',
    'mandarin chinese': 'zh',
    'castilian': 'es',
    'latin spanish': 'es',
    'brazilian portuguese': 'pt',
    'flemish': 'nl',
})

# code -> canonical English label, used to turn normalized language codes back
# into the names stored on the queue entry / shown in the comma-list inputs.
LANGUAGE_LABELS = dict(LANGUAGE_CHOICES)


def _normalize(values, aliases):
    """Map raw strings to canonical codes via `aliases`, de-duped, order-preserving."""
    seen = []
    for raw in values or []:
        code = aliases.get((raw or '').strip().lower())
        if code and code not in seen:
            seen.append(code)
    return seen


def normalize_audio_formats(values):
    """Canonical audio-format codes for a list of raw strings (unknowns dropped)."""
    return _normalize(values, _AUDIO_ALIASES)


def normalize_hdr_formats(values):
    """Canonical HDR-format codes for a list of raw strings (unknowns dropped)."""
    return _normalize(values, _HDR_ALIASES)


def normalize_language_codes(values):
    """Canonical ISO language codes for a list of raw strings (unknowns dropped)."""
    return _normalize(values, _LANGUAGE_ALIASES)


def normalize_language_names(values):
    """
    Canonical English language names for a list of raw strings.

    Languages are stored/transported as their English label (like genres), so
    the LLM output and the user's comma-list edits both funnel through here to a
    clean, de-duplicated name list.
    """
    return [LANGUAGE_LABELS[code] for code in normalize_language_codes(values)]
