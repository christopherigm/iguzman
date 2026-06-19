import datetime
import json
import logging
import re
from pathlib import Path

from django.conf import settings
from pydantic import BaseModel, Field

from edge_folio_api.llm import chat_structured, chat_text
from edge_folio_api.utils import locale_name

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TN profession lookup
# ---------------------------------------------------------------------------

_TN_PROFESSIONS_PATH = Path(__file__).parent / 'tn_professions.json'

with _TN_PROFESSIONS_PATH.open() as _f:
    _tn_raw = json.load(_f)
    _TN_PROFESSION_LOOKUP: dict[str, dict] = {p['name']: p for p in _tn_raw}
    _TN_PROFESSIONS_LIST: list[dict] = _tn_raw

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class _TNSuggestion(BaseModel):
    category: str
    likelihood: int = Field(ge=0, le=100)
    explanation: str


class _TNSuggestionsResponse(BaseModel):
    suggestions: list[_TNSuggestion]


class _TailoredBullet(BaseModel):
    id: int
    tailored_text: str


class _TailoredBulletsResponse(BaseModel):
    bullets: list[_TailoredBullet]


class _TailoredSkillsResponse(BaseModel):
    skill_ids: list[int]


class _TailoredWorkExperience(BaseModel):
    id: int
    tailored_description: str


class _TailoredWorkExperiencesResponse(BaseModel):
    work_experiences: list[_TailoredWorkExperience]


class _TailoredProject(BaseModel):
    id: int
    tailored_description: str


class _TailoredProjectsResponse(BaseModel):
    projects: list[_TailoredProject]


class _ProfessionalSummaryResponse(BaseModel):
    summary: str


class _ScoreResult(BaseModel):
    score: int = Field(ge=1, le=100)
    explanation: str


# ---------------------------------------------------------------------------
# Resume tailoring
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are an expert technical resume tailoring assistant.

Given a job description and a candidate's bullet points, select and rewrite \
the most relevant bullets to match the role.

Rules:
- Use ONLY bullets from the provided list. Never invent new experiences.
- Rewrite each selected bullet to highlight keywords from the job description.
- Select between 4 and 8 of the most relevant bullets.
- Each bullet must start with a strong, specific action verb such as: Designed, Architected, \
  Shipped, Deployed, Migrated, Optimized, Reduced, Led, Mentored, Established, Refactored, \
  Launched, Eliminated, Accelerated, Automated, Negotiated. Never start with: Utilized, \
  Leveraged, Facilitated, Spearheaded, Showcased, Executed, Managed (as a generic opener).
- Target 15-25 words per bullet. Do not exceed two lines.
- If the original bullet contains a precise metric (e.g. "71%", "$183K", "3 of 7 teams"), \
  preserve it exactly as written. If no metric exists, omit the quantity entirely - never \
  invent round numbers like "50%" or "$100K".
- Forbidden words and phrases - do not use any of these: leverage, leveraged, utilize, \
  utilized, spearhead, spearheaded, pivotal, realm, synergize, proven track record, \
  results-driven, dynamic professional, passionate team player, cross-functional stakeholders, \
  facilitating knowledge transfer, intricate, delve, showcase, showcasing.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{"bullets": [{"id": <integer>, "tailored_text": "<string>"}]}
"""

_STOPWORDS = frozenset({
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
    'those', 'i', 'we', 'you', 'he', 'she', 'it', 'they', 'my', 'our',
    'your', 'their', 'as', 'up', 'about', 'into', 'than', 'so', 'if',
    'not', 'no', 'more', 'also', 'its', 'all', 'other',
})

_MAX_BULLETS_TO_LLM = 40


def _with_locale(system_prompt: str, locale: str) -> str:
    """Append a language instruction to the system prompt for the given locale."""
    if not locale or locale == 'en':
        return system_prompt
    lang = locale_name(locale)
    return (
        f'{system_prompt}\n\n'
        f'IMPORTANT: Write your entire response in {lang}. '
        f'All text, explanations, bullet points, and any other content must be in {lang}.'
    )


def _format_custom_instructions(custom_instructions: str) -> str:
    """
    Render the user's free-text tailoring instructions as a clearly-delimited,
    high-priority block to append to a tailoring user message. Returns '' when
    no instructions were provided.
    """
    text = (custom_instructions or '').strip()
    if not text:
        return ''
    return (
        "\n\nADDITIONAL USER INSTRUCTIONS (apply these with high priority, but never "
        "invent experience or break the rules above):\n"
        f"{text[:1000]}\n"
    )


# ---------------------------------------------------------------------------
# TN category suggestion
# ---------------------------------------------------------------------------

def suggest_tn_categories(
    work_experiences: list[dict],
    educations: list[dict],
    locale: str = 'en',
) -> list[dict]:
    """
    Suggest NAFTA/USMCA TN visa categories based on the user's career profile.

    Returns a list of dicts: [{"category": str, "likelihood": int, "explanation": str}]
    sorted by likelihood descending (only categories >= 30 included).
    """
    profession_lines = '\n'.join(
        f"- {p['name']}: {p['description']} Requirements: {p['requirements']}"
        for p in _TN_PROFESSIONS_LIST
    )

    work_section = '\n'.join(
        "{title} at {company} ({start}-{end}){desc}".format(
            title=w.get('title', ''),
            company=w.get('company', ''),
            start=str(w.get('start_date', ''))[:7],
            end='present' if w.get('is_current') else str(w.get('end_date', ''))[:7],
            desc=f": {w['description']}" if w.get('description') else '',
        )
        for w in work_experiences
    ) or 'None provided'

    edu_section = '\n'.join(
        "{degree} in {field} at {institution} ({start}-{end}){desc}".format(
            degree=e.get('degree', ''),
            field=e.get('field_of_study', 'N/A'),
            institution=e.get('institution', ''),
            start=e.get('start_year', ''),
            end=e.get('end_year', 'present'),
            desc=f": {e['description']}" if e.get('description') else '',
        )
        for e in educations
    ) or 'None provided'

    system_prompt = (
        "You are a NAFTA/USMCA TN visa expert. Analyze the candidate's education and work "
        "experience to identify which TN visa profession categories they qualify for.\n\n"
        f"TN Profession Categories:\n{profession_lines}\n\n"
        "Return a JSON object with a 'suggestions' array. "
        "Each item must have: 'category' (exact profession name from the list above), "
        "'likelihood' (integer 0-100), "
        "'explanation' (1-2 sentences). "
        "Only include categories with likelihood >= 30. Sort by likelihood descending."
    )

    result = chat_structured(
        messages=[
            {"role": "system", "content": _with_locale(system_prompt, locale)},
            {"role": "user", "content": f"WORK EXPERIENCE:\n{work_section}\n\nEDUCATION:\n{edu_section}"},
        ],
        response_model=_TNSuggestionsResponse,
        temperature=0.1,
    )
    return [
        s.model_dump()
        for s in result.suggestions
        if s.likelihood >= 30
    ]


def _tokenize(text: str) -> set[str]:
    return {w for w in re.findall(r'[a-z0-9]+', text.lower()) if w not in _STOPWORDS and len(w) > 2}


def _rank_bullets(job_description: str, bullets: list[dict]) -> list[dict]:
    """Return bullets sorted descending by keyword overlap with the job description."""
    jd_tokens = _tokenize(job_description)
    if not jd_tokens:
        return bullets

    def score(b: dict) -> int:
        candidate = _tokenize(b['text']) | _tokenize(' '.join(b.get('skills', [])))
        return len(candidate & jd_tokens)

    return sorted(bullets, key=score, reverse=True)


def tailor_resume(job_description: str, bullets: list[dict], skills: list[dict], locale: str = 'en') -> list[dict]:
    """
    Call Groq LLM to select and rewrite the user's bullet points for a job.

    bullets: [{"id": int, "text": str, "category": str, "skills": [str]}]
    skills:  [{"name": str, "proficiency": int}]

    Returns: [{"id": int, "tailored_text": str}]
    """
    ranked = _rank_bullets(job_description, bullets)[:_MAX_BULLETS_TO_LLM]
    logger.debug('tailor_resume: sending %d/%d bullets to LLM', len(ranked), len(bullets))

    bullet_lines = "\n".join(
        f"[{b['id']}] ({b['category']}) {b['text']}"
        + (f" | skills: {', '.join(b['skills'])}" if b.get('skills') else "")
        + (
            f" | role: {b['work_experience_title']} at {b['work_experience_company']}"
            if b.get('work_experience_title')
            else ""
        )
        for b in ranked
    )
    skill_summary = ", ".join(f"{s['name']} ({s['proficiency']}/5)" for s in skills)

    user_message = (
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE SKILLS: {skill_summary}\n\n"
        f"CANDIDATE BULLET POINTS:\n{bullet_lines}\n\n"
        "Return the tailored bullet selection as JSON."
    )

    result = chat_structured(
        messages=[
            {"role": "system", "content": _with_locale(_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        response_model=_TailoredBulletsResponse,
        temperature=0.3,
    )
    return [b.model_dump() for b in result.bullets]


_SKILLS_SYSTEM_PROMPT = """\
You are a resume tailoring assistant.

Given a job description and a candidate's skill list, select the skills most relevant to the role.

Rules:
- Select between 5 and 15 of the most relevant skills.
- Prioritize skills explicitly mentioned or strongly implied in the job description.
- Include both technical and soft skills if they are relevant to this specific role.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{"skill_ids": [<integer>, ...]}
"""


def tailor_skills(job_description: str, skills: list[dict], locale: str = 'en') -> list[int]:
    """
    Select the most relevant skill IDs from the user's matrix for the given job.

    skills: [{"id": int, "name": str, "proficiency": int}]
    Returns: list of skill IDs (subset of the input IDs)
    """
    if not skills:
        return []

    skill_lines = "\n".join(
        f"[{s['id']}] {s['name']} ({s['proficiency']}/5)" for s in skills
    )
    user_message = (
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE SKILLS:\n{skill_lines}\n\n"
        "Select the most relevant skill IDs as JSON."
    )

    result = chat_structured(
        messages=[
            {"role": "system", "content": _with_locale(_SKILLS_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        response_model=_TailoredSkillsResponse,
        temperature=0.1,
    )
    valid_ids = {s['id'] for s in skills}
    matched = [sid for sid in result.skill_ids if sid in valid_ids]
    if not matched:
        # LLM returned no recognised IDs - fall back to top-15 by proficiency
        sorted_by_prof = sorted(skills, key=lambda s: -s.get('proficiency', 0))
        matched = [s['id'] for s in sorted_by_prof[:15]]
    return matched


# ---------------------------------------------------------------------------
# Work experience tailoring
# ---------------------------------------------------------------------------

_WE_TAILORING_SYSTEM_PROMPT = """\
You are a resume tailoring assistant.

Given a job description and a candidate's work experience entries, rewrite every entry's \
description to highlight alignment with the target role.

Rules:
- Include ALL provided work experience entries in your response - do not omit any.
- Rewrite each description to mirror 2-3 keywords from the job description.
- Preserve any concrete metrics exactly as written - never invent or round numbers.
- Keep each rewritten description concise: 2-4 sentences.
- Do not invent duties or achievements not implied by the original description.
- Forbidden words: leverage, leveraged, utilize, utilized, spearhead, spearheaded, pivotal, \
  synergize, proven track record, results-driven, dynamic professional, passionate team player.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{"work_experiences": [{"id": <integer>, "tailored_description": "<string>"}]}
"""


def tailor_work_experiences(job_description: str, work_experiences: list[dict], locale: str = 'en') -> list[dict]:
    """
    Select and rewrite the most relevant work experience descriptions for a job.

    work_experiences: [{"id": int, "title": str, "company": str, "start_date", "end_date",
                        "is_current": bool, "description": str}]
    Returns: [{"id": int, "tailored_description": str}]
    """
    if not work_experiences:
        return []

    we_lines = "\n".join(
        "[{id}] {title} at {company} ({start}-{end}): {desc}".format(
            id=we['id'],
            title=we.get('title', ''),
            company=we.get('company', ''),
            start=str(we.get('start_date', ''))[:7],
            end='present' if we.get('is_current') else str(we.get('end_date', ''))[:7],
            desc=we.get('description', '') or 'No description provided',
        )
        for we in work_experiences
    )
    user_message = (
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE WORK EXPERIENCES:\n{we_lines}\n\n"
        "Select and rewrite the most relevant work experiences as JSON."
    )

    result = chat_structured(
        messages=[
            {"role": "system", "content": _with_locale(_WE_TAILORING_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        response_model=_TailoredWorkExperiencesResponse,
        temperature=0.3,
    )
    valid_ids = {we['id'] for we in work_experiences}
    return [we.model_dump() for we in result.work_experiences if we.id in valid_ids]


# ---------------------------------------------------------------------------
# Project tailoring
# ---------------------------------------------------------------------------

_PROJECTS_TAILORING_SYSTEM_PROMPT = """\
You are a resume tailoring assistant.

Given a job description and a candidate's project list, select the most relevant projects \
and rewrite each description to highlight alignment with the target role.

Rules:
- Select between 1 and 4 of the most relevant projects.
- Rewrite each description to mirror keywords from the job description.
- Emphasize technologies from the tech stack that appear in the job description.
- Keep each rewritten description to 1-3 sentences.
- Do not invent features or outcomes not implied by the original description.
- Forbidden words: leverage, leveraged, utilize, utilized, spearhead, spearheaded, pivotal, \
  synergize, proven track record, results-driven, dynamic professional, passionate team player.
- Return ONLY valid JSON - no markdown, no explanation, no extra text.

Response schema:
{"projects": [{"id": <integer>, "tailored_description": "<string>"}]}
"""


def tailor_projects(job_description: str, projects: list[dict], locale: str = 'en') -> list[dict]:
    """
    Select and rewrite the most relevant project descriptions for a job.

    projects: [{"id": int, "name": str, "description": str, "tech_stack": [str]}]
    Returns: [{"id": int, "tailored_description": str}]
    """
    if not projects:
        return []

    project_lines = "\n".join(
        "[{id}] {name}{tech}: {desc}".format(
            id=p['id'],
            name=p.get('name', ''),
            tech=f" | stack: {', '.join(p['tech_stack'])}" if p.get('tech_stack') else '',
            desc=p.get('description', '') or 'No description provided',
        )
        for p in projects
    )
    user_message = (
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE PROJECTS:\n{project_lines}\n\n"
        "Select and rewrite the most relevant projects as JSON."
    )

    result = chat_structured(
        messages=[
            {"role": "system", "content": _with_locale(_PROJECTS_TAILORING_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        response_model=_TailoredProjectsResponse,
        temperature=0.3,
    )
    valid_ids = {p['id'] for p in projects}
    return [p.model_dump() for p in result.projects if p.id in valid_ids]


# ---------------------------------------------------------------------------
# Full resume tailoring orchestrator
# ---------------------------------------------------------------------------


def tailor_full_resume(
    job_title: str,
    company_name: str,
    job_description: str,
    bullets: list[dict],
    skills: list[dict],
    work_experiences: list[dict],
    projects: list[dict],
    profile_job_title: str = '',
    locale: str = 'en',
) -> dict:
    """
    Orchestrate complete resume tailoring across all sections.

    bullets: [{"id": int, "text": str, "category": str, "skills": [str],
               "work_experience_title"?: str, "work_experience_company"?: str}]
    skills:  [{"id": int, "name": str, "proficiency": int}]
    work_experiences: [{"id": int, "title": str, "company": str, "start_date", "end_date",
                        "is_current": bool, "description": str}]
    projects: [{"id": int, "name": str, "description": str, "tech_stack": [str]}]

    Returns:
    {
        "bullets": [{"id": int, "tailored_text": str}],
        "skill_ids": [int],
        "work_experiences": [{"id": int, "tailored_description": str}],
        "projects": [{"id": int, "tailored_description": str}],
        "summary": str,
    }
    """
    tailored_bullets = tailor_resume(job_description, bullets, skills, locale=locale)
    tailored_skill_ids = tailor_skills(job_description, skills, locale=locale)
    tailored_work_experiences = tailor_work_experiences(job_description, work_experiences, locale=locale)
    tailored_projects = tailor_projects(job_description, projects, locale=locale)
    summary = generate_professional_summary(
        job_title=job_title,
        company_name=company_name,
        job_description=job_description,
        tailored_bullets=tailored_bullets,
        skills=skills,
        work_experiences=work_experiences,
        profile_job_title=profile_job_title,
        locale=locale,
    )
    return {
        "bullets": tailored_bullets,
        "skill_ids": tailored_skill_ids,
        "work_experiences": tailored_work_experiences,
        "projects": tailored_projects,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Professional summary
# ---------------------------------------------------------------------------

_PROFESSIONAL_SUMMARY_SYSTEM_PROMPT = """\
You are a professional resume writer specializing in the tech industry.

Write a professional summary (3-5 sentences, 50-100 words total) for a candidate \
applying to a specific role. The summary is the first thing a recruiter reads.

Rules:
- Open with: [Most recent job title] with [X] years of experience [core domain / stack].
- Include at least one concrete achievement drawn from the provided bullet points. \
  Use the exact metric - never invent or round numbers.
- Close with what the candidate brings to this specific company or type of role.
- Naturally mirror 2-3 keywords from the job description.
- Total length: 50-100 words. Maximum 5 sentences.
- No first-person pronouns (I, my, me, we).
- Forbidden words and phrases - do not use any: leverage, leveraged, utilize, utilized, \
  spearhead, spearheaded, pivotal, realm, synergize, proven track record, results-driven, \
  dynamic professional, passionate team player, passionate about, cross-functional, \
  intricate, delve, showcase, showcasing, facilitating.
- Write in confident, direct, third-person professional prose.
- Return the summary paragraph as plain text only. No labels, no JSON, no markdown.
"""


def _compute_years_experience(work_experiences: list[dict]) -> str:
    """Return a human-readable years-of-experience string from WE start dates."""
    if not work_experiences:
        return 'several'
    earliest: datetime.date | None = None
    for we in work_experiences:
        start = we.get('start_date')
        if not start:
            continue
        try:
            start_date = (
                start if isinstance(start, datetime.date)
                else datetime.date.fromisoformat(str(start)[:10])
            )
            if earliest is None or start_date < earliest:
                earliest = start_date
        except (ValueError, TypeError):
            pass
    if not earliest:
        return 'several'
    years = (datetime.date.today() - earliest).days // 365
    return str(max(years, 1))


def generate_professional_summary(
    job_title: str,
    company_name: str,
    job_description: str,
    tailored_bullets: list[dict],
    skills: list[dict],
    work_experiences: list[dict],
    profile_job_title: str = '',
    locale: str = 'en',
) -> str:
    """
    Generate a 50-100 word professional summary grounded in tailored bullets.

    work_experiences: [{"title", "company", "start_date", "end_date", "is_current"}]
    tailored_bullets: [{"id", "tailored_text"}]
    skills: [{"name", "proficiency"}]
    """
    years_str = _compute_years_experience(work_experiences)
    current_title = (
        profile_job_title
        or (work_experiences[0].get('title', '') if work_experiences else job_title)
    )
    bullet_lines = "\n".join(f"- {b['tailored_text']}" for b in tailored_bullets)
    top_skills = ", ".join(
        s['name'] for s in sorted(skills, key=lambda x: -x.get('proficiency', 0))[:10]
    )

    user_message = (
        f"TARGET ROLE: {job_title} at {company_name}\n\n"
        f"JOB DESCRIPTION (extract 2-3 keywords from this):\n{job_description[:2000]}\n\n"
        f"CANDIDATE'S MOST RECENT TITLE: {current_title}\n"
        f"YEARS OF PROFESSIONAL EXPERIENCE: {years_str}\n"
        f"TOP SKILLS: {top_skills or 'Not provided'}\n\n"
        f"TAILORED ACHIEVEMENTS (use the best metric from these):\n{bullet_lines}\n\n"
        "Write the professional summary now."
    )

    return chat_text(
        messages=[
            {"role": "system", "content": _with_locale(_PROFESSIONAL_SUMMARY_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        temperature=0.4,
    ).strip()


# ---------------------------------------------------------------------------
# Cover letter
# ---------------------------------------------------------------------------

_COVER_LETTER_SYSTEM_PROMPT = """\
You are an expert technical cover letter writer for software engineers.

Write a concise, professional cover letter (3-4 paragraphs, plain text, no markdown) \
for the candidate applying to the role described below.

Critical rules:
- Reference ONLY the achievement facts listed in "SELECTED BULLETS". Do not invent or \
  infer any experience not present in those bullets.
- Do not use bullet-point formatting - write in flowing prose.
- Keep the tone confident and specific; avoid generic filler phrases.
- Do not include a salutation header (e.g. "Dear Hiring Manager,") or closing signature - \
  return only the body paragraphs.
- Return plain text only. No markdown, no extra commentary.
"""


def generate_cover_letter(
    job_title: str,
    company_name: str,
    job_description: str,
    tailored_bullets: list[dict],
    locale: str = 'en',
) -> str:
    """
    Generate a cover letter grounded strictly in the provided tailored bullets.

    tailored_bullets: [{"id": int, "tailored_text": str}]

    Returns: plain-text cover letter body (no salutation / closing).
    """
    bullet_lines = "\n".join(f"- {b['tailored_text']}" for b in tailored_bullets)

    user_message = (
        f"ROLE: {job_title} at {company_name}\n\n"
        f"JOB DESCRIPTION EXCERPT:\n{job_description[:5000]}\n\n"
        f"SELECTED BULLETS (the ONLY facts you may reference):\n{bullet_lines}\n\n"
        "Write the cover letter body now."
    )

    return chat_text(
        messages=[
            {"role": "system", "content": _with_locale(_COVER_LETTER_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        temperature=0.5,
    ).strip()


# ---------------------------------------------------------------------------
# Match metrics
# ---------------------------------------------------------------------------

_OVERALL_MATCH_SYSTEM_PROMPT = """\
You are an expert technical recruiter evaluating a candidate's fit for a specific role.

Analyze the candidate's skills, work experience bullet points, and the job description.
Provide an overall match score from 1 to 100 representing how well the candidate's complete \
profile fits the role - considering technical alignment, soft skill signals, seniority level \
match, domain experience, and spoken-language requirements. When the posting calls for a \
specific language or bilingual/multilingual ability (e.g. a bilingual customer-facing or HR \
role), credit the candidate when their listed spoken languages satisfy it, and treat an unmet \
language requirement as a meaningful gap.

Scoring guide:
- 80-100: Exceptional fit; meets or exceeds nearly all requirements
- 60-79: Strong fit; meets most key requirements with minor gaps
- 40-59: Moderate fit; meets some requirements but has notable gaps
- 20-39: Weak fit; meets few requirements; significant development needed
- 1-19: Poor fit; profile does not align with the role

Return ONLY valid JSON - no markdown, no extra text: {"score": <integer 1-100>, "explanation": "<2-3 sentence plain-text explanation of the score, citing specific strengths or gaps>"}
"""

_TECHNICAL_MATCH_SYSTEM_PROMPT = """\
You are an expert hiring manager evaluating a candidate's technical and job-specific \
skills against a job's stated requirements.

Analyze the job description's hard requirements (programming languages, frameworks, tools, \
cloud platforms, methodologies, and any role-specific software or systems) against the \
candidate's declared skills (with proficiency levels 1-5) and technical bullet points from \
their work history.

When the posting requires a specific spoken language or bilingual/multilingual ability (e.g. a \
bilingual customer-facing or HR role), treat it as a required job skill: credit the candidate \
when their listed spoken languages satisfy it, and treat an unmet language requirement as a \
genuine gap. Never penalize the candidate for a bilingual or spoken-language requirement when \
their listed spoken languages already meet it. Here "programming languages" and "spoken \
languages" are distinct - do not conflate them.

Scoring guide:
- 80-100: Covers nearly all required technical skills at appropriate proficiency
- 60-79: Covers most core technical requirements; minor gaps in secondary skills
- 40-59: Covers fundamental technologies but lacks key specialized requirements
- 20-39: Has foundational skills but missing most required technologies
- 1-19: Technical profile does not align with job requirements

Return ONLY valid JSON - no markdown, no extra text: {"score": <integer 1-100>, "explanation": "<2-3 sentence plain-text explanation of the score, citing specific skills matched or missing>"}
"""

_NAFTA_LIKELIHOOD_SYSTEM_PROMPT = """\
You are an expert U.S. immigration attorney specializing in TN NAFTA/USMCA visas.

Evaluate the likelihood of TN visa approval for a candidate applying for this position.
TN eligibility requires:
1. The position must fall within a NAFTA/USMCA approved profession (e.g. Engineer, \
Computer Systems Analyst, Scientist, Accountant, etc.)
2. The candidate must hold the required educational degree or equivalent professional \
credentials for that TN profession category
3. The position must be employer-sponsored (not self-employment)
4. The role duties must primarily match the TN profession description

Consider:
- Whether the job title and duties align with a recognized TN profession category
- Whether the candidate's highest degree and field of study qualify for that TN category
- Years of relevant work experience as a credential supplement where degree is missing
- Technical depth and specificity of the role (stronger technical match = stronger TN case)

IMPORTANT - visa sponsorship statements:
A TN visa is NOT employer-sponsored in the H-1B sense. Unlike an H-1B petition (a long, \
expensive, bureaucratic process the employer must file and fund), a TN only requires the \
employer to provide a job offer / support letter; the candidate applies for TN status on \
their own at the border or via USCIS. Therefore a posting that says it "does not offer visa \
sponsorship", "no sponsorship available", "unable to sponsor", or similar MUST NOT lower the \
TN likelihood score - such statements refer to costly petition-based sponsorship (H-1B, green \
card) and are irrelevant to TN eligibility. Do NOT treat them as a negative factor. The only \
work-authorization condition that genuinely defeats a TN case is an explicit requirement of \
U.S. citizenship (or permanent residency / security clearance requiring citizenship), which is \
handled separately - judge TN likelihood purely on profession mapping and credentials.

Scoring guide:
- 80-100: Strong TN case; role clearly maps to TN category; candidate credentials meet requirements
- 60-79: Good TN case; minor concerns (e.g., title mismatch) but overall approvable
- 40-59: Moderate; eligibility risk present; role partially maps to TN category
- 20-39: Weak; significant concerns about profession mapping or credential gaps
- 1-19: Poor TN eligibility; role likely does not qualify under NAFTA/USMCA

Return ONLY valid JSON - no markdown, no extra text: {"score": <integer 1-100>, "explanation": "<2-3 sentence plain-text explanation of the score, citing specific profession mapping or credential factors>"}
"""


def _call_score(system_prompt: str, user_message: str) -> tuple[int, str]:
    result = chat_structured(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_model=_ScoreResult,
        temperature=0.1,
    )
    return result.score, result.explanation


def calculate_overall_match(
    job_description: str,
    job_title: str,
    company_name: str,
    bullets: list[dict],
    skills: list[dict],
    languages: list[dict] | None = None,
    locale: str = 'en',
) -> tuple[int, str]:
    """Return (score, explanation) for overall candidate-job fit."""
    skill_summary = ", ".join(f"{s['name']} ({s['proficiency']}/5)" for s in skills)
    language_summary = ", ".join(
        f"{lang['name']} ({lang['proficiency']})" if lang.get('proficiency') else lang['name']
        for lang in (languages or [])
    )
    bullet_lines = "\n".join(
        f"[{b['category']}] {b['text']}" + (f" | skills: {', '.join(b['skills'])}" if b.get('skills') else "")
        for b in bullets[:30]
    )
    user_message = (
        f"ROLE: {job_title} at {company_name}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE SKILLS: {skill_summary or 'None listed'}\n\n"
        f"CANDIDATE SPOKEN LANGUAGES: {language_summary or 'None listed'}\n\n"
        f"CANDIDATE EXPERIENCE BULLETS:\n{bullet_lines or 'None listed'}\n\n"
        "Return the overall match score and explanation as JSON."
    )
    return _call_score(_with_locale(_OVERALL_MATCH_SYSTEM_PROMPT, locale), user_message)


def calculate_technical_match(
    job_description: str,
    job_title: str,
    company_name: str,
    bullets: list[dict],
    skills: list[dict],
    languages: list[dict] | None = None,
    locale: str = 'en',
) -> tuple[int, str]:
    """Return (score, explanation) for technical skills match."""
    skill_summary = ", ".join(f"{s['name']} ({s['proficiency']}/5)" for s in skills)
    language_summary = ", ".join(
        f"{lang['name']} ({lang['proficiency']})" if lang.get('proficiency') else lang['name']
        for lang in (languages or [])
    )
    technical_bullets = [b for b in bullets if b.get('category') in ('technical', 'impact')]
    bullet_lines = "\n".join(
        f"{b['text']}" + (f" | technologies: {', '.join(b['skills'])}" if b.get('skills') else "")
        for b in technical_bullets[:20]
    )
    user_message = (
        f"ROLE: {job_title} at {company_name}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE TECHNICAL SKILLS: {skill_summary or 'None listed'}\n\n"
        f"CANDIDATE SPOKEN LANGUAGES: {language_summary or 'None listed'}\n\n"
        f"CANDIDATE TECHNICAL BULLETS:\n{bullet_lines or 'None listed'}\n\n"
        "Return the technical match score and explanation as JSON."
    )
    return _call_score(_with_locale(_TECHNICAL_MATCH_SYSTEM_PROMPT, locale), user_message)


def calculate_nafta_likelihood(
    job_description: str,
    job_title: str,
    skills: list[dict],
    work_experiences: list[dict],
    educations: list[dict],
    tn_profession: str = '',
    locale: str = 'en',
) -> tuple[int, str]:
    """Return (score, explanation) for TN NAFTA approval likelihood."""
    skill_summary = ", ".join(s['name'] for s in skills)

    edu_lines = "\n".join(
        f"- {e.get('degree', '')} in {e.get('field_of_study', '') or 'N/A'} "
        f"from {e.get('institution', '')} "
        f"({e.get('start_year', '')}-{e.get('end_year', '') or 'present'})"
        for e in educations
    ) or "None listed"

    we_lines = "\n".join(
        f"- {e.get('title', '')} at {e.get('company', '')} "
        f"({str(e.get('start_date', ''))[:7]}-"
        f"{'present' if e.get('is_current') else str(e.get('end_date', ''))[:7]})"
        for e in work_experiences
    ) or "None listed"

    # Build optional TN profession context from the lookup table.
    tn_profession_block = ''
    if tn_profession:
        prof_data = _TN_PROFESSION_LOOKUP.get(tn_profession, {})
        tn_official_name = prof_data.get('tn_official_name', tn_profession) or tn_profession
        tn_description = prof_data.get('description', '')
        tn_requirements = prof_data.get('requirements', '')
        tn_profession_block = (
            f"CANDIDATE'S SELF-IDENTIFIED TN PROFESSION CATEGORY: {tn_official_name}\n"
            + (f"Category description: {tn_description}\n" if tn_description else '')
            + (f"Category requirements: {tn_requirements}\n" if tn_requirements else '')
            + "Use this as the primary TN profession lens when evaluating the role and credentials.\n\n"
        )

    user_message = (
        f"POSITION TITLE: {job_title}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        + tn_profession_block
        + f"CANDIDATE EDUCATION:\n{edu_lines}\n\n"
        f"CANDIDATE WORK EXPERIENCE:\n{we_lines}\n\n"
        f"CANDIDATE SKILLS: {skill_summary or 'None listed'}\n\n"
        "Return the TN visa approval likelihood score and explanation as JSON."
    )
    return _call_score(_with_locale(_NAFTA_LIKELIHOOD_SYSTEM_PROMPT, locale), user_message)


# ---------------------------------------------------------------------------
# NAFTA TN Visa Letter
# ---------------------------------------------------------------------------

_DEGREE_LABELS = {
    'bachelor': "Bachelor's degree",
    'master': "Master's degree",
    'phd': 'PhD / Doctorate',
    'associate': 'Associate degree',
    'certificate': 'Certificate',
    'bootcamp': 'Bootcamp certificate',
    'other': 'Degree',
}

_NAFTA_SYSTEM_PROMPT = """\
You are a professional immigration attorney specializing in TN NAFTA/USMCA visa applications.

Write a formal TN Visa Support Letter on behalf of a U.S. employer addressed to U.S. Customs \
and Border Protection.

USCIS requirements this letter must satisfy (per NAFTA Appendix 1603.D.1):
1. Professional capacity in which the employee will work
2. Purpose of the employment
3. Anticipated length of stay
4. Employee's educational qualifications or credentials
5. Confirmation of a prearranged full-time or part-time position (not self-employment)

Required structure - follow exactly:
1. Date line (today's date, formatted as Month DD, YYYY)
2. Addressee block - write these three lines consecutively with NO blank lines between them:
     U.S. Department of Homeland Security
     Customs and Border Protection
     United States
3. RE line - copy exactly from "RE LINE TO USE" in the input. Immediately below the RE line \
(no blank line), write:
     Employer: [Company Name]
     Applicant: [Employee Full Name]
4. One blank line
5. Salutation: Dear Sir or Madam:
6. Opening paragraph - base on APPLICATION TYPE:
   - NEW TN APPLICATION: Write as employer formally requesting admission for an employee. \
Example: "[Company] respectfully submits this letter in support of [full name]'s application \
for a TN nonimmigrant visa under the United States-Mexico-Canada Agreement (USMCA). [Full name] \
is a citizen of [citizenship], born [date of birth]. Contingent upon your approval, we wish to \
employ [name] in the TN occupation of [TN NAFTA OFFICIAL CATEGORY] for a period of [duration]. \
[He/She/They] will be solely under the control and supervision of [Company]."
   - CONTINUATION / EXTENSION: Write as employer supporting renewal. Example: "I am writing on \
behalf of [Company] to support the TN nonimmigrant visa entry of [full name], a citizen of \
[citizenship] (passport number [passport], born [date of birth]). [Full name] is currently \
employed by [Company] in the NAFTA profession category of [TN NAFTA OFFICIAL CATEGORY]. This \
letter supports [his/her/their] continued TN nonimmigrant status for an additional period of \
[duration]."
7. Employment paragraph: reference the WORK EXPERIENCE HISTORY to describe tenure, current \
position title, hours per week, annual compensation ([To be provided] if absent), and direct \
supervisor ([To be provided] if absent). For CONTINUATION, explicitly note this extends existing \
TN status.
8. About the Company - write this text exactly as the heading on its own line, then 2-3 sentences \
about the company. Use ADDITIONAL COMPANY INFO if provided.
9. Offered Position: ([TN NAFTA OFFICIAL CATEGORY]) - write this text exactly as the heading on \
its own line using the TN NAFTA OFFICIAL CATEGORY (not the internal job title). Then an \
introductory sentence followed by 6-10 specific duty bullet points (• character) derived \
strictly from the JOB DESCRIPTION.
10. Qualifications - write as the heading on its own line. Then 1-2 sentences stating the \
employee's academic credentials from EDUCATION HISTORY and why they qualify for the \
TN NAFTA OFFICIAL CATEGORY. Use TN PROFESSION REQUIREMENTS as reference for what qualifies.
11. Employment Terms - write as the heading on its own line. Confirm: full-time or part-time, \
duration per CONTRACT DURATION, U.S. employer is the sole employer with full direction and control.
12. Closing paragraph: respectfully request approval, provide contact information for questions.
13. Thank you for your consideration.
14. Sincerely,
15. Signatory block: [Signatory Name] / [Title] / [Company] / [Email]

Critical rules:
- Copy the RE LINE TO USE verbatim from the input - do not alter it.
- Use [To be provided] for every data point not explicitly supplied in the input.
- Do NOT add blank lines between the addressee block lines (DHS / CBP / United States).
- Do NOT add blank lines between the RE line and the Employer / Applicant sub-lines.
- Section headings (About the Company, Offered Position, Qualifications, Employment Terms) appear \
on their own lines without extra blank lines before or after them.
- Derive job duties ONLY from the JOB DESCRIPTION - never invent duties.
- Write in formal legal-correspondence prose. No casual language.
- Return plain text only - absolutely no markdown, no asterisks (*), no bold markers (**), \
no underscores, no extra formatting characters of any kind.
- Use the bullet character • exclusively for duty list items in the Offered Position section.
"""


def _format_work_experiences(work_experiences: list[dict] | None) -> str:
    if not work_experiences:
        return '[To be provided]'
    lines = []
    for we in work_experiences:
        start = str(we.get('start_date', ''))[:7]
        end_date = we.get('end_date')
        end = 'Present' if we.get('is_current') else (str(end_date)[:7] if end_date else '')
        date_range = f"{start}-{end}" if end else start
        line = f"- {we.get('title', '')} at {we.get('company', '')}"
        if date_range:
            line += f" ({date_range})"
        if we.get('location'):
            line += f", {we['location']}"
        lines.append(line)
    return "\n".join(lines)


def generate_nafta_letter(
    job_title: str,
    company_name: str,
    job_description: str,
    full_name: str,
    current_job_title: str,
    degree: str,
    institution: str,
    field_of_study: str,
    tn_profession: str = '',
    is_continuation: bool = False,
    company_description: str = '',
    hours_per_week: int = 40,
    duration: str = '3 years',
    passport_number: str = '',
    date_of_birth: str = '',
    citizenship: str = '',
    work_experiences: list | None = None,
    locale: str = 'en',
) -> str:
    """
    Generate a TN NAFTA Visa Support Letter grounded in the provided job application and
    profile data. Missing fields are left as [To be provided] placeholders.
    """
    # Education summary line
    degree_label = _DEGREE_LABELS.get(degree, degree) if degree else '[To be provided]'
    edu_line = (
        f"{degree_label} in {field_of_study} from {institution}"
        if field_of_study and institution
        else (f"{degree_label} from {institution}" if institution else '[To be provided]')
    )

    # TN profession context from the JSON lookup
    prof_data = _TN_PROFESSION_LOOKUP.get(tn_profession, {})
    tn_official_name = prof_data.get('tn_official_name', tn_profession) or tn_profession
    tn_description = prof_data.get('description', '')
    tn_requirements = prof_data.get('requirements', '')

    # RE line and application type
    re_line = (
        "RE: TN Visa Entry"
        if is_continuation
        else "RE: TN Visa Application"
    )
    application_type = (
        'CONTINUATION / EXTENSION of existing TN status'
        if is_continuation
        else 'NEW TN APPLICATION'
    )

    work_exp_str = _format_work_experiences(work_experiences)

    user_message = (
        f"EMPLOYEE FULL NAME: {full_name or '[To be provided]'}\n"
        f"CITIZENSHIP: {citizenship or '[To be provided]'}\n"
        f"DATE OF BIRTH: {date_of_birth or '[To be provided]'}\n"
        f"PASSPORT NUMBER: {passport_number or '[To be provided]'}\n"
        f"CURRENT POSITION AT COMPANY: {current_job_title or '[To be provided]'}\n"
        f"HIRING COMPANY: {company_name}\n"
        f"INTERNAL JOB TITLE: {job_title}\n"
        f"TN NAFTA OFFICIAL CATEGORY (use in all immigration text and headings): {tn_official_name or '[To be provided]'}\n"
        f"TN PROFESSION DESCRIPTION: {tn_description or '[To be provided]'}\n"
        f"TN PROFESSION REQUIREMENTS: {tn_requirements or '[To be provided]'}\n"
        f"APPLICATION TYPE: {application_type}\n"
        f"RE LINE TO USE (copy verbatim): {re_line}\n"
        f"HOURS PER WEEK: {hours_per_week}\n"
        f"CONTRACT DURATION: {duration or '3 years'}\n"
        f"EMPLOYEE EDUCATION: {edu_line}\n"
        f"WORK EXPERIENCE HISTORY:\n{work_exp_str}\n"
        + (f"ADDITIONAL COMPANY INFO: {company_description}\n" if company_description else '')
        + f"\nJOB DESCRIPTION (extract duties from this):\n{job_description[:5000]}\n\n"
        "Write the complete TN Visa Support Letter now."
    )

    return chat_text(
        messages=[
            {"role": "system", "content": _with_locale(_NAFTA_SYSTEM_PROMPT, locale)},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    ).strip()
