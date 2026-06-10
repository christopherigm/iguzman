import json
import logging
import re
from pathlib import Path

from django.conf import settings
from groq import Groq

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TN profession lookup
# ---------------------------------------------------------------------------

_TN_PROFESSIONS_PATH = Path(__file__).parent / 'tn_professions.json'

with _TN_PROFESSIONS_PATH.open() as _f:
    _TN_PROFESSION_LOOKUP: dict[str, dict] = {p['name']: p for p in json.load(_f)}

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
        f"JOB DESCRIPTION:\n{job_description}\n\n"
        f"CANDIDATE SKILLS: {skill_summary}\n\n"
        f"CANDIDATE BULLET POINTS:\n{bullet_lines}\n\n"
        "Return the tailored bullet selection as JSON."
    )

    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    data = json.loads(content)
    return data.get("bullets", [])


# ---------------------------------------------------------------------------
# Cover letter
# ---------------------------------------------------------------------------

_COVER_LETTER_SYSTEM_PROMPT = """\
You are an expert technical cover letter writer for software engineers.

Write a concise, professional cover letter (3–4 paragraphs, plain text, no markdown) \
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
        f"JOB DESCRIPTION EXCERPT:\n{job_description[:2000]}\n\n"
        f"SELECTED BULLETS (the ONLY facts you may reference):\n{bullet_lines}\n\n"
        "Write the cover letter body now."
    )

    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": _COVER_LETTER_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.5,
    )

    return response.choices[0].message.content.strip()


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
8. About the Company — write this text exactly as the heading on its own line, then 2–3 sentences \
about the company. Use ADDITIONAL COMPANY INFO if provided.
9. Offered Position: ([TN NAFTA OFFICIAL CATEGORY]) — write this text exactly as the heading on \
its own line using the TN NAFTA OFFICIAL CATEGORY (not the internal job title). Then an \
introductory sentence followed by 6–10 specific duty bullet points (• character) derived \
strictly from the JOB DESCRIPTION.
10. Qualifications — write as the heading on its own line. Then 1–2 sentences stating the \
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
        date_range = f"{start}–{end}" if end else start
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
        f"RE: TN Visa Entry – {full_name or '[To be provided]'}"
        if is_continuation
        else f"RE: TN Visa Application – {full_name or '[To be provided]'}"
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
        + f"\nJOB DESCRIPTION (extract duties from this):\n{job_description[:3000]}\n\n"
        "Write the complete TN Visa Support Letter now."
    )

    client = Groq(api_key=settings.GROQ_API_KEY)
    response = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": _NAFTA_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
    )

    return response.choices[0].message.content.strip()
