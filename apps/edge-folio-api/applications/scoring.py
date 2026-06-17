"""Reusable per-user match scoring.

Gathers a user's profile (approved bullets, skills, work experience, education)
and runs the LLM match metrics defined in :mod:`applications.tailoring`. Shared by
``RefreshMetricsView`` (job applications) and the jobs ingest task (private postings)
so both compute the score the same way.
"""

import logging
import re

from .tailoring import (
    calculate_nafta_likelihood,
    calculate_overall_match,
    calculate_technical_match,
)

logger = logging.getLogger(__name__)

# Citizenship / residency terms, and the requirement language that turns a mere
# mention ("green card holders welcome") into a hard gate ("must be a US citizen").
# A detected requirement forces the posting into the "No Match" bucket regardless of
# the LLM score.
_CITIZEN_TERM_RE = re.compile(
    r'(u\.?\s?s\.?\s?citizen|united states citizen|\bus citizen|permanent resident|green card)',
    re.IGNORECASE,
)
_REQUIREMENT_RE = re.compile(
    r'(require|required|must be|must have|only|need to be|eligible)',
    re.IGNORECASE,
)
# Direct phrasings that are unambiguous on their own.
_DIRECT_CITIZEN_RE = re.compile(
    r'(must be (?:a |an )?(?:u\.?\s?s\.?\s?|united states )?citizen'
    r'|citizenship\s+(?:is\s+)?required'
    r'|requires?\s+(?:u\.?\s?s\.?\s?)?citizenship)',
    re.IGNORECASE,
)

# How close (in characters) a citizenship term and requirement word must sit to count.
_PROXIMITY = 60


def detect_us_citizen_required(job_description: str) -> bool:
    """True when the JD explicitly requires U.S. citizenship / permanent residency.

    Requires requirement-context language ("required", "must be", ...) within
    :data:`_PROXIMITY` characters of a citizenship/residency term, so a mere mention
    ("green card holders welcome") does not flag the posting.
    """
    text = job_description or ''
    if _DIRECT_CITIZEN_RE.search(text):
        return True
    for term in _CITIZEN_TERM_RE.finditer(text):
        window = text[max(0, term.start() - _PROXIMITY):term.end() + _PROXIMITY]
        if _REQUIREMENT_RE.search(window):
            return True
    return False


# ---------------------------------------------------------------------------
# Spoken-language requirements
# ---------------------------------------------------------------------------
# A posting that demands fluency in a spoken language the user does not have is a hard
# gate, mirroring citizenship: it drops to the "No Match" bucket regardless of the LLM
# score. English is always assumed (it is the baseline working language for these roles
# and EdgeFolio's own UI), so an "English required" JD never gates on its own. The gate
# fires for a *named* non-English language the user hasn't listed, or for a
# "bilingual"/"multilingual" requirement the user's language count cannot satisfy.

# Spoken-language names recognised by name in a JD.
_LANGUAGE_NAMES = (
    'english', 'spanish', 'french', 'german', 'mandarin', 'cantonese', 'chinese',
    'portuguese', 'italian', 'japanese', 'korean', 'arabic', 'russian', 'hindi',
    'dutch', 'swedish', 'norwegian', 'danish', 'finnish', 'polish', 'turkish',
    'vietnamese', 'thai', 'indonesian', 'tagalog', 'filipino', 'hebrew', 'greek',
    'czech', 'romanian', 'hungarian', 'ukrainian', 'farsi', 'persian', 'urdu',
    'bengali', 'punjabi', 'tamil', 'malay',
)
# Synonyms folded onto a canonical name so "Chinese" satisfies a "Mandarin"
# requirement (and vice versa), etc.
_LANGUAGE_SYNONYMS = {
    'mandarin': 'chinese',
    'cantonese': 'chinese',
    'farsi': 'persian',
    'filipino': 'tagalog',
}
_LANGUAGE_NAME_RE = re.compile(r'\b(' + '|'.join(_LANGUAGE_NAMES) + r')\b', re.IGNORECASE)
_BILINGUAL_RE = re.compile(r'\bbi-?lingual\b', re.IGNORECASE)
_MULTILINGUAL_RE = re.compile(r'\bmulti-?lingual\b', re.IGNORECASE)
# Requirement context that turns a language mention into a requirement: "Spanish
# required", "fluent in French", "must speak German", "native Italian", "verbal and
# written communication in Portuguese".
_LANG_REQUIREMENT_RE = re.compile(
    r'(require|must|fluen|proficien|native|speak|bilingual|multilingual'
    r'|verbal|written|communicat)',
    re.IGNORECASE,
)


def _canonical_language(name: str) -> str:
    name = (name or '').strip().lower()
    return _LANGUAGE_SYNONYMS.get(name, name)


def _spoken_languages(languages) -> set:
    """Canonical set of languages the user speaks. English is always assumed."""
    spoken = {
        _canonical_language(lang['name'] if isinstance(lang, dict) else lang)
        for lang in (languages or [])
    }
    spoken.discard('')
    spoken.add('english')
    return spoken


def detect_unmet_language_requirement(job_description: str, languages) -> bool:
    """True when the JD requires a spoken language the user does not have.

    ``languages`` is the user's spoken languages (dicts with a ``name`` key, or plain
    name strings). English is assumed satisfied. Fires for a named non-English language
    that sits within :data:`_PROXIMITY` characters of requirement-context language, or
    for a "bilingual"/"multilingual" requirement the user's language count cannot meet
    (>= 2 / >= 3 languages, English included).
    """
    text = job_description or ''
    spoken = _spoken_languages(languages)

    for term in _LANGUAGE_NAME_RE.finditer(text):
        if _canonical_language(term.group(1)) in spoken:
            continue
        window = text[max(0, term.start() - _PROXIMITY):term.end() + _PROXIMITY]
        if _LANG_REQUIREMENT_RE.search(window):
            return True

    if _BILINGUAL_RE.search(text) and len(spoken) < 2:
        return True
    if _MULTILINGUAL_RE.search(text) and len(spoken) < 3:
        return True
    return False


def compute_match_metrics(user, job_description: str, job_title: str, company_name: str) -> dict:
    """Compute the three LLM match metrics for ``user`` against a job description.

    Returns a dict with ``overall_match`` / ``technical_match`` /
    ``nafta_tn_likelihood`` integers, their ``*_explanation`` strings, and the
    ``language_requirement_unmet`` hard-gate flag. Raises if the LLM is unavailable -
    callers decide how to surface that.
    """
    from career.models import Education, Language, WorkExperience
    from matrix.models import BulletPoint, Skill

    bullets_qs = list(
        BulletPoint.objects.filter(user=user, is_approved=True).prefetch_related('skills')
    )
    bullets_payload = [
        {
            'id': b.id,
            'text': b.text,
            'category': b.category,
            'skills': [s.name for s in b.skills.all()],
        }
        for b in bullets_qs
    ]
    skills = list(Skill.objects.filter(user=user).values('name', 'proficiency'))
    languages = list(Language.objects.filter(user=user).values('name', 'proficiency'))
    work_experiences = list(
        WorkExperience.objects.filter(user=user)
        .order_by('-start_date')
        .values('company', 'title', 'start_date', 'end_date', 'is_current', 'location')
    )
    educations = list(
        Education.objects.filter(user=user)
        .order_by('-start_year')
        .values('institution', 'degree', 'field_of_study', 'start_year', 'end_year')
    )

    overall, overall_explanation = calculate_overall_match(
        job_description=job_description,
        job_title=job_title,
        company_name=company_name,
        bullets=bullets_payload,
        skills=skills,
        languages=languages,
    )
    technical, technical_explanation = calculate_technical_match(
        job_description=job_description,
        job_title=job_title,
        company_name=company_name,
        bullets=bullets_payload,
        skills=skills,
    )
    nafta, nafta_explanation = calculate_nafta_likelihood(
        job_description=job_description,
        job_title=job_title,
        skills=skills,
        work_experiences=work_experiences,
        educations=educations,
    )

    return {
        'overall_match': overall,
        'overall_match_explanation': overall_explanation,
        'technical_match': technical,
        'technical_match_explanation': technical_explanation,
        'nafta_tn_likelihood': nafta,
        'nafta_tn_likelihood_explanation': nafta_explanation,
        'language_requirement_unmet': detect_unmet_language_requirement(job_description, languages),
    }
