import json
import logging
import re
from pathlib import Path

import groq as _groq_module
from django.conf import settings
from groq import Groq
from openai import OpenAI as _OllamaClient

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
- Return ONLY valid JSON — no markdown, no explanation, no extra text.

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


def _chat_completion(
    messages: list[dict],
    temperature: float = 0.3,
    response_format: dict | None = None,
) -> str:
    """Call Groq, fall back to Ollama on rate-limit (429)."""
    kwargs: dict = dict(model=settings.GROQ_MODEL, messages=messages, temperature=temperature)
    if response_format:
        kwargs['response_format'] = response_format

    try:
        response = Groq(api_key=settings.GROQ_API_KEY).chat.completions.create(**kwargs)
        return response.choices[0].message.content
    except _groq_module.RateLimitError:
        logger.warning('Groq rate limit reached; falling back to Ollama at %s', settings.OLLAMA_URL)

    ollama = _OllamaClient(base_url=f"{settings.OLLAMA_URL}/v1/", api_key="ollama")
    ollama_kwargs: dict = dict(model=settings.OLLAMA_MODEL, messages=messages, temperature=temperature,
                               extra_body={"options": {"num_ctx": 8192}})
    if response_format:
        ollama_kwargs['response_format'] = response_format
    response = ollama.chat.completions.create(**ollama_kwargs)
    return response.choices[0].message.content


# ---------------------------------------------------------------------------
# TN category suggestion
# ---------------------------------------------------------------------------

def suggest_tn_categories(
    work_experiences: list[dict],
    educations: list[dict],
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
        "{title} at {company} ({start}–{end}){desc}".format(
            title=w.get('title', ''),
            company=w.get('company', ''),
            start=str(w.get('start_date', ''))[:7],
            end='present' if w.get('is_current') else str(w.get('end_date', ''))[:7],
            desc=f": {w['description']}" if w.get('description') else '',
        )
        for w in work_experiences
    ) or 'None provided'

    edu_section = '\n'.join(
        "{degree} in {field} at {institution} ({start}–{end}){desc}".format(
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
        "Respond ONLY with a valid JSON array — no markdown, no explanation, no extra text. "
        'Each item must have: "category" (exact profession name), '
        '"likelihood" (integer 0–100), '
        '"explanation" (1–2 sentences). '
        "Only include categories with likelihood >= 30. Sort by likelihood descending."
    )

    raw = _chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"WORK EXPERIENCE:\n{work_section}\n\nEDUCATION:\n{edu_section}"},
        ],
        temperature=0.1,
    )

    cleaned = raw.strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.split('\n', 1)[1].rsplit('```', 1)[0].strip()

    return json.loads(cleaned)


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


def tailor_resume(job_description: str, bullets: list[dict], skills: list[dict]) -> list[dict]:
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
        + (f" | skills: {', '.join(b['skills'])}" if b['skills'] else "")
        for b in ranked
    )
    skill_summary = ", ".join(f"{s['name']} ({s['proficiency']}/5)" for s in skills)

    user_message = (
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE SKILLS: {skill_summary}\n\n"
        f"CANDIDATE BULLET POINTS:\n{bullet_lines}\n\n"
        "Return the tailored bullet selection as JSON."
    )

    content = _chat_completion(
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    data = json.loads(content)
    return data.get("bullets", [])


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
- Do not use bullet-point formatting — write in flowing prose.
- Keep the tone confident and specific; avoid generic filler phrases.
- Do not include a salutation header (e.g. "Dear Hiring Manager,") or closing signature — \
  return only the body paragraphs.
- Return plain text only. No markdown, no extra commentary.
"""


def generate_cover_letter(
    job_title: str,
    company_name: str,
    job_description: str,
    tailored_bullets: list[dict],
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

    return _chat_completion(
        messages=[
            {"role": "system", "content": _COVER_LETTER_SYSTEM_PROMPT},
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
profile fits the role — considering technical alignment, soft skill signals, seniority level \
match, and domain experience.

Scoring guide:
- 80-100: Exceptional fit; meets or exceeds nearly all requirements
- 60-79: Strong fit; meets most key requirements with minor gaps
- 40-59: Moderate fit; meets some requirements but has notable gaps
- 20-39: Weak fit; meets few requirements; significant development needed
- 1-19: Poor fit; profile does not align with the role

Return ONLY valid JSON — no markdown, no extra text: {"score": <integer 1-100>, "explanation": "<2-3 sentence plain-text explanation of the score, citing specific strengths or gaps>"}
"""

_TECHNICAL_MATCH_SYSTEM_PROMPT = """\
You are an expert software engineering hiring manager evaluating a candidate's technical \
skills against a job's technical requirements.

Analyze the job description's technical requirements (languages, frameworks, tools, cloud \
platforms, methodologies) against the candidate's declared skills (with proficiency levels 1-5) \
and technical bullet points from their work history.

Scoring guide:
- 80-100: Covers nearly all required technical skills at appropriate proficiency
- 60-79: Covers most core technical requirements; minor gaps in secondary skills
- 40-59: Covers fundamental technologies but lacks key specialized requirements
- 20-39: Has foundational skills but missing most required technologies
- 1-19: Technical profile does not align with job requirements

Return ONLY valid JSON — no markdown, no extra text: {"score": <integer 1-100>, "explanation": "<2-3 sentence plain-text explanation of the score, citing specific skills matched or missing>"}
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

Scoring guide:
- 80-100: Strong TN case; role clearly maps to TN category; candidate credentials meet requirements
- 60-79: Good TN case; minor concerns (e.g., title mismatch) but overall approvable
- 40-59: Moderate; eligibility risk present; role partially maps to TN category
- 20-39: Weak; significant concerns about profession mapping or credential gaps
- 1-19: Poor TN eligibility; role likely does not qualify under NAFTA/USMCA

Return ONLY valid JSON — no markdown, no extra text: {"score": <integer 1-100>, "explanation": "<2-3 sentence plain-text explanation of the score, citing specific profession mapping or credential factors>"}
"""


def _call_score(system_prompt: str, user_message: str) -> tuple[int, str]:
    content = _chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    data = json.loads(content)
    score = int(data.get("score", 50))
    explanation = str(data.get("explanation", ""))
    return max(1, min(100, score)), explanation


def calculate_overall_match(
    job_description: str,
    job_title: str,
    company_name: str,
    bullets: list[dict],
    skills: list[dict],
) -> tuple[int, str]:
    """Return (score, explanation) for overall candidate-job fit."""
    skill_summary = ", ".join(f"{s['name']} ({s['proficiency']}/5)" for s in skills)
    bullet_lines = "\n".join(
        f"[{b['category']}] {b['text']}" + (f" | skills: {', '.join(b['skills'])}" if b.get('skills') else "")
        for b in bullets[:30]
    )
    user_message = (
        f"ROLE: {job_title} at {company_name}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE SKILLS: {skill_summary or 'None listed'}\n\n"
        f"CANDIDATE EXPERIENCE BULLETS:\n{bullet_lines or 'None listed'}\n\n"
        "Return the overall match score and explanation as JSON."
    )
    return _call_score(_OVERALL_MATCH_SYSTEM_PROMPT, user_message)


def calculate_technical_match(
    job_description: str,
    job_title: str,
    company_name: str,
    bullets: list[dict],
    skills: list[dict],
) -> tuple[int, str]:
    """Return (score, explanation) for technical skills match."""
    skill_summary = ", ".join(f"{s['name']} ({s['proficiency']}/5)" for s in skills)
    technical_bullets = [b for b in bullets if b.get('category') in ('technical', 'impact')]
    bullet_lines = "\n".join(
        f"{b['text']}" + (f" | technologies: {', '.join(b['skills'])}" if b.get('skills') else "")
        for b in technical_bullets[:20]
    )
    user_message = (
        f"ROLE: {job_title} at {company_name}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE TECHNICAL SKILLS: {skill_summary or 'None listed'}\n\n"
        f"CANDIDATE TECHNICAL BULLETS:\n{bullet_lines or 'None listed'}\n\n"
        "Return the technical match score and explanation as JSON."
    )
    return _call_score(_TECHNICAL_MATCH_SYSTEM_PROMPT, user_message)


def calculate_nafta_likelihood(
    job_description: str,
    job_title: str,
    skills: list[dict],
    work_experiences: list[dict],
    educations: list[dict],
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

    user_message = (
        f"POSITION TITLE: {job_title}\n\n"
        f"JOB DESCRIPTION:\n{job_description[:5000]}\n\n"
        f"CANDIDATE EDUCATION:\n{edu_lines}\n\n"
        f"CANDIDATE WORK EXPERIENCE:\n{we_lines}\n\n"
        f"CANDIDATE SKILLS: {skill_summary or 'None listed'}\n\n"
        "Return the TN visa approval likelihood score and explanation as JSON."
    )
    return _call_score(_NAFTA_LIKELIHOOD_SYSTEM_PROMPT, user_message)


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

Required structure — follow exactly:
1. Date line (today's date, formatted as Month DD, YYYY)
2. Addressee block — write these three lines consecutively with NO blank lines between them:
     U.S. Department of Homeland Security
     Customs and Border Protection
     United States
3. RE line — copy exactly from "RE LINE TO USE" in the input. Immediately below the RE line \
(no blank line), write:
     Employer: [Company Name]
     Applicant: [Employee Full Name]
4. One blank line
5. Salutation: Dear Sir or Madam:
6. Opening paragraph — base on APPLICATION TYPE:
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
8. About the Company — write this text exactly as the heading on its own line, then 2-3 sentences \
about the company. Use ADDITIONAL COMPANY INFO if provided.
9. Offered Position: ([TN NAFTA OFFICIAL CATEGORY]) — write this text exactly as the heading on \
its own line using the TN NAFTA OFFICIAL CATEGORY (not the internal job title). Then an \
introductory sentence followed by 6-10 specific duty bullet points (• character) derived \
strictly from the JOB DESCRIPTION.
10. Qualifications — write as the heading on its own line. Then 1-2 sentences stating the \
employee's academic credentials from EDUCATION HISTORY and why they qualify for the \
TN NAFTA OFFICIAL CATEGORY. Use TN PROFESSION REQUIREMENTS as reference for what qualifies.
11. Employment Terms — write as the heading on its own line. Confirm: full-time or part-time, \
duration per CONTRACT DURATION, U.S. employer is the sole employer with full direction and control.
12. Closing paragraph: respectfully request approval, provide contact information for questions.
13. Thank you for your consideration.
14. Sincerely,
15. Signatory block: [Signatory Name] / [Title] / [Company] / [Email]

Critical rules:
- Copy the RE LINE TO USE verbatim from the input — do not alter it.
- Use [To be provided] for every data point not explicitly supplied in the input.
- Do NOT add blank lines between the addressee block lines (DHS / CBP / United States).
- Do NOT add blank lines between the RE line and the Employer / Applicant sub-lines.
- Section headings (About the Company, Offered Position, Qualifications, Employment Terms) appear \
on their own lines without extra blank lines before or after them.
- Derive job duties ONLY from the JOB DESCRIPTION — never invent duties.
- Write in formal legal-correspondence prose. No casual language.
- Return plain text only — absolutely no markdown, no asterisks (*), no bold markers (**), \
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
        f"RE: TN Visa Entry - {full_name or '[To be provided]'}"
        if is_continuation
        else f"RE: TN Visa Application - {full_name or '[To be provided]'}"
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

    return _chat_completion(
        messages=[
            {"role": "system", "content": _NAFTA_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    ).strip()
