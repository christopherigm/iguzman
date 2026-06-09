import json
import logging
import re

from django.conf import settings
from groq import Groq

logger = logging.getLogger(__name__)

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
    print("bullet_lines", bullet_lines)

    user_message = (
        f"JOB DESCRIPTION:\n{job_description}\n\n"
        f"CANDIDATE SKILLS: {skill_summary}\n\n"
        f"CANDIDATE BULLET POINTS:\n{bullet_lines}\n\n"
        "Return the tailored bullet selection as JSON."
    )
    print("user_message", user_message)

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
