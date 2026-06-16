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


def compute_match_metrics(user, job_description: str, job_title: str, company_name: str) -> dict:
    """Compute the three LLM match metrics for ``user`` against a job description.

    Returns a dict with ``overall_match`` / ``technical_match`` /
    ``nafta_tn_likelihood`` integers and their ``*_explanation`` strings. Raises if
    the LLM is unavailable - callers decide how to surface that.
    """
    from career.models import Education, WorkExperience
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
    }
