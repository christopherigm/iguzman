import logging
from datetime import date, timedelta

import requests
from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from pydantic import BaseModel

from edge_folio_api.llm import chat_structured

logger = logging.getLogger(__name__)

_MAX_PARTIAL_RETRIES = 3
_STALE_TTL = timedelta(days=7)
_PARTIAL_FAILURE_TTL = timedelta(hours=1)
_MAX_PARTIAL_FAILURE_TTL = timedelta(hours=24)
_STUCK_TIMEOUT = timedelta(minutes=10)


# ── Pydantic models ────────────────────────────────────────────────────────────

class _PickURLResult(BaseModel):
    url: str


class _ExtractAboutResult(BaseModel):
    canonical_name: str
    about: str


class _CompanyIntelItem(BaseModel):
    title: str
    summary: str
    url: str
    source: str = ""


class _CompanyIntelResult(BaseModel):
    items: list[_CompanyIntelItem]


class _SignalItem(BaseModel):
    level: str
    explanation: str


class _CompanyAnalysisResult(BaseModel):
    summary: str
    job_security: _SignalItem
    financial_health: _SignalItem
    leadership_stability: _SignalItem
    work_culture: _SignalItem
    growth_trajectory: _SignalItem


# ── System prompts ─────────────────────────────────────────────────────────────

_PICK_URL_SYSTEM_PROMPT = """\
You are a research assistant. Given web search results for a company, pick the single best URL \
that is the company's official website homepage or about page. Prefer the company's own domain \
over third-party sources (LinkedIn, Crunchbase, news articles, etc.).

Return ONLY valid JSON — no markdown, no explanation: {"url": "<chosen url>"}
"""

_EXTRACT_ABOUT_SYSTEM_PROMPT = """\
You are a research assistant. From the provided webpage content, extract:
1. The company's canonical official name (e.g. "Stripe, Inc." not "Stripe Jobs" or a misspelling).
2. A concise company description (2-4 sentences): what the company does, mission, products/services, \
industry. Write in third-person present tense suitable for a formal letter.

Return ONLY valid JSON — no markdown, no explanation:
{"canonical_name": "<official company name>", "about": "<extracted description>"}
"""

_INTEL_SYSTEM_PROMPT = """\
You are a research assistant. Given web search results about a company, extract up to 3 of the \
most relevant and informative items. For each item provide: a concise title, a 1-2 sentence \
summary of the content, the exact URL, and the source domain (e.g. "techcrunch.com").

Only include items that are clearly relevant and informative. Return fewer than 3 if quality \
results are limited. Return an empty list if nothing is relevant.

Return ONLY valid JSON — no markdown, no explanation:
{"items": [{"title": "...", "summary": "...", "url": "...", "source": "..."}]}
"""

_COMPANY_ANALYSIS_SYSTEM_PROMPT = """\
You are a senior career advisor analyzing company data to help a job seeker make an informed decision.

Given a company description and recent intel across several categories (news, hiring, layoffs, \
reputation, funding, leadership changes, acquisitions, engineering culture), produce:

1. A concise overall summary (3-5 sentences) capturing the company's current state and whether \
it's a good time to join. Be honest — if data is limited, say so.

2. Five categorical signals, each rated as one of: "positive", "mixed", or "concerning". \
Base each rating only on available evidence. If a category has no data, default to "mixed" \
and note limited data availability in the explanation.

Signals:
- job_security: Risk of layoffs, workforce stability, recent reductions vs hiring momentum
- financial_health: Funding runway, investment activity, revenue signals, financial stability
- leadership_stability: C-suite churn, notable departures or new appointments, org stability
- work_culture: Employee sentiment from reviews, Glassdoor signals, engineering blog activity
- growth_trajectory: Hiring pace, expansion signals, market position, M&A as growth vs distress

Return ONLY valid JSON — no markdown, no explanation:
{"summary": "...", "job_security": {"level": "positive|mixed|concerning", "explanation": "1-2 sentences"}, \
"financial_health": {"level": "...", "explanation": "..."}, \
"leadership_stability": {"level": "...", "explanation": "..."}, \
"work_culture": {"level": "...", "explanation": "..."}, \
"growth_trajectory": {"level": "...", "explanation": "..."}}
"""

_INTEL_LABEL_MAP = {
    'company_news': 'RECENT NEWS',
    'hiring_news': 'HIRING ACTIVITY',
    'layoff_news': 'LAYOFFS & WORKFORCE CHANGES',
    'reputation': 'REPUTATION & REVIEWS',
    'funding_news': 'FUNDING & INVESTMENT',
    'leadership_news': 'LEADERSHIP CHANGES',
    'acquisition_news': 'ACQUISITIONS & M&A',
    'engineering_culture': 'ENGINEERING CULTURE',
}

_INTEL_CATEGORIES = {
    'news': {
        'db_key': 'company_news',
        'query': '{name} news latest {month_year}, {this_year}, {last_year}',
    },
    'hiring': {
        'db_key': 'hiring_news',
        'query': '{name} hiring jobs {month_year}, {this_year}, {last_year}',
    },
    'layoffs': {
        'db_key': 'layoff_news',
        'query': '{name} layoffs workforce reduction {month_year}, {this_year}, {last_year}',
    },
    'reputation': {
        'db_key': 'reputation',
        'query': '{name} employee reviews reputation glassdoor {this_year}',
    },
    'funding': {
        'db_key': 'funding_news',
        'query': '{name} funding investment venture capital IPO Series {month_year}, {this_year}, {last_year}',
    },
    'leadership': {
        'db_key': 'leadership_news',
        'query': '{name} CEO CTO VP Engineering leadership new appointment departure {month_year}, {this_year}, {last_year}',
    },
    'acquisitions': {
        'db_key': 'acquisition_news',
        'query': '{name} acquisition merger acquired {month_year}, {this_year}, {last_year}',
    },
    'engineering_culture': {
        'db_key': 'engineering_culture',
        'query': '{name} engineering blog tech stack developer culture engineering team {this_year}',
    },
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_intel_score(analysis: _CompanyAnalysisResult) -> str:
    signals = [
        analysis.job_security.level,
        analysis.financial_health.level,
        analysis.leadership_stability.level,
        analysis.work_culture.level,
        analysis.growth_trajectory.level,
    ]
    counts: dict[str, int] = {'positive': 0, 'mixed': 0, 'concerning': 0}
    for s in signals:
        if s in counts:
            counts[s] += 1
    # Majority vote; ties favour positive > mixed > concerning
    order = ['positive', 'mixed', 'concerning']
    return sorted(order, key=lambda k: (-counts[k], order.index(k)))[0]


def _scraper_post(endpoint: str, payload: dict) -> dict:
    url = f"{settings.SCRAPER_URL.rstrip('/')}/{endpoint.lstrip('/')}"
    headers = {'Content-Type': 'application/json'}
    if settings.SCRAPER_API_KEY:
        headers['X-API-Key'] = settings.SCRAPER_API_KEY
    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _invalidate_applications_for_company(company_id: int) -> None:
    from .models import JobApplication
    pairs = list(
        JobApplication.objects.filter(company_id=company_id).values_list('user_id', 'pk')
    )
    for user_id, pk in pairs:
        cache.delete(f'applications:applications:{user_id}')
        cache.delete(f'applications:application:{user_id}:{pk}')


# ── Main pipeline task ─────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_company_pipeline(self, company_id: int) -> None:
    from .models import Company

    try:
        company = Company.objects.get(pk=company_id)
    except Company.DoesNotExist:
        return

    Company.objects.filter(pk=company_id).update(
        status='processing',
        processing_started_at=timezone.now(),
    )

    failed_categories: list[str] = []

    try:
        _execute_pipeline(company_id, company.name, failed_categories)
    except Exception as exc:
        logger.error('Company pipeline error for id=%s: %s', company_id, exc)
        try:
            raise self.retry(exc=exc)
        except self.MaxRetriesExceededError:
            Company.objects.filter(pk=company_id).update(
                status='failed',
                is_refreshing=False,
                processing_started_at=None,
            )
            _invalidate_applications_for_company(company_id)
            return

    now = timezone.now()
    company.refresh_from_db()

    if failed_categories:
        retry_count = company.retry_count + 1
        ttl_offset = _MAX_PARTIAL_FAILURE_TTL if retry_count >= _MAX_PARTIAL_RETRIES else _PARTIAL_FAILURE_TTL
        # Set last_refreshed so cron picks it up after the desired TTL.
        backdated = now - _STALE_TTL + ttl_offset
        Company.objects.filter(pk=company_id).update(
            status='complete',
            is_refreshing=False,
            processing_started_at=None,
            last_refreshed=backdated,
            retry_count=retry_count,
        )
    else:
        Company.objects.filter(pk=company_id).update(
            status='complete',
            is_refreshing=False,
            processing_started_at=None,
            last_refreshed=now,
            retry_count=0,
        )

    _invalidate_applications_for_company(company_id)


def _execute_pipeline(company_id: int, company_name: str, failed_categories: list[str]) -> None:
    from .models import Company

    # Step 1: Search for company
    search_results = _scraper_post('/search', {
        'query': f'{company_name} official website about company',
        'maxResults': 5,
    })
    results = search_results if isinstance(search_results, list) else search_results.get('results', [])
    if not results:
        raise Exception(f'No search results for: {company_name}')

    # Step 2: Pick best URL via LLM
    results_text = '\n'.join(
        f"- {r.get('title', '')} | {r.get('url', '')} | {r.get('snippet', '')}"
        for r in results
    )
    try:
        pick_result = chat_structured(
            messages=[
                {'role': 'system', 'content': _PICK_URL_SYSTEM_PROMPT},
                {'role': 'user', 'content': f'COMPANY: {company_name}\n\nSEARCH RESULTS:\n{results_text}\n\nPick the best URL.'},
            ],
            response_model=_PickURLResult,
            temperature=0.1,
        )
        chosen_url = pick_result.url
    except Exception as exc:
        logger.warning('LLM URL pick failed for %s: %s', company_name, exc)
        chosen_url = results[0].get('url', '')

    if not chosen_url:
        raise Exception(f'Could not determine URL for: {company_name}')

    # Step 3: Extract page content
    extract_result = _scraper_post('/extract', {'url': chosen_url})
    content = extract_result.get('content', '')
    og_image = extract_result.get('og_image')

    # Step 4: LLM extract canonical name + description
    canonical_name = company_name
    description = ''
    try:
        about_result = chat_structured(
            messages=[
                {'role': 'system', 'content': _EXTRACT_ABOUT_SYSTEM_PROMPT},
                {'role': 'user', 'content': f'COMPANY: {company_name}\n\nPAGE CONTENT:\n{content[:4000]}'},
            ],
            response_model=_ExtractAboutResult,
            temperature=0.2,
        )
        canonical_name = about_result.canonical_name or company_name
        description = about_result.about
    except Exception as exc:
        logger.error('LLM about extraction failed for %s: %s', company_name, exc)
        failed_categories.append('description')

    Company.objects.filter(pk=company_id).update(name=canonical_name, description=description)
    _invalidate_applications_for_company(company_id)

    # Step 5: Download og_image
    if og_image:
        try:
            _download_company_image(company_id, og_image)
        except Exception as exc:
            logger.warning('Failed to download company image for %s: %s', company_name, exc)

    # Step 6: Intel categories
    _today = date.today()
    date_vars = {
        'name': canonical_name,
        'month_year': _today.strftime('%B %Y'),
        'this_year': _today.year,
        'last_year': _today.year - 1,
    }

    for category, config in _INTEL_CATEGORIES.items():
        db_key = config['db_key']
        query = config['query'].format(**date_vars)
        items: list[dict] = []
        try:
            intel_search = _scraper_post('/search', {'query': query, 'maxResults': 5})
            intel_results = intel_search if isinstance(intel_search, list) else intel_search.get('results', [])
            if intel_results:
                res_text = '\n'.join(
                    f"- Title: {r.get('title', '')} | URL: {r.get('url', '')} | Snippet: {r.get('snippet', '')}"
                    for r in intel_results[:5]
                )
                intel_result = chat_structured(
                    messages=[
                        {'role': 'system', 'content': _INTEL_SYSTEM_PROMPT},
                        {'role': 'user', 'content': f'COMPANY: {canonical_name}\n\nSEARCH RESULTS:\n{res_text}'},
                    ],
                    response_model=_CompanyIntelResult,
                    temperature=0.1,
                )
                items = [i.model_dump() for i in intel_result.items]
        except Exception as exc:
            logger.warning('Intel search failed for %s (%s): %s', category, company_name, exc)
            failed_categories.append(db_key)

        # Write this category to DB immediately (progressive rendering)
        company_obj = Company.objects.get(pk=company_id)
        current_intel = dict(company_obj.intel or {})
        current_intel[db_key] = items
        Company.objects.filter(pk=company_id).update(intel=current_intel)
        _invalidate_applications_for_company(company_id)

    # Step 7: Company analysis
    company_obj = Company.objects.get(pk=company_id)
    intel = company_obj.intel or {}
    sections = []
    if company_obj.description:
        sections.append(f'COMPANY DESCRIPTION:\n{company_obj.description}')
    for key, label in _INTEL_LABEL_MAP.items():
        items_list = intel.get(key, [])
        if items_list:
            item_text = '\n'.join(
                f"  - {item.get('title', '')}: {item.get('summary', '')}"
                for item in items_list
            )
            sections.append(f'{label}:\n{item_text}')

    if sections:
        try:
            analysis_result = chat_structured(
                messages=[
                    {'role': 'system', 'content': _COMPANY_ANALYSIS_SYSTEM_PROMPT},
                    {'role': 'user', 'content': f'COMPANY: {canonical_name}\n\n' + '\n\n'.join(sections)},
                ],
                response_model=_CompanyAnalysisResult,
                temperature=0.2,
            )
            Company.objects.filter(pk=company_id).update(
                analysis=analysis_result.model_dump(),
                intel_score=_compute_intel_score(analysis_result),
            )
        except Exception as exc:
            logger.error('Company analysis LLM failed for %s: %s', company_name, exc)
            failed_categories.append('analysis')


def _download_company_image(company_id: int, og_image: str) -> None:
    from .models import Company

    img_resp = requests.get(og_image, timeout=15)
    img_resp.raise_for_status()
    content_type = img_resp.headers.get('Content-Type', 'image/jpeg')
    if 'svg' in content_type:
        return
    ext = 'jpg'
    if 'png' in content_type:
        ext = 'png'
    elif 'webp' in content_type:
        ext = 'webp'
    elif 'gif' in content_type:
        ext = 'gif'
    company = Company.objects.get(pk=company_id)
    company.image.save(f'company.{ext}', ContentFile(img_resp.content), save=True)


# ── Periodic cron task ─────────────────────────────────────────────────────────

@shared_task
def refresh_stale_companies() -> None:
    from .models import Company

    now = timezone.now()

    # Recover stuck processing tasks
    Company.objects.filter(
        status='processing',
        processing_started_at__lt=now - _STUCK_TIMEOUT,
    ).update(status='failed', processing_started_at=None)

    # Atomically claim stale companies to refresh
    stale_threshold = now - _STALE_TTL
    with transaction.atomic():
        stale = list(
            Company.objects.select_for_update(skip_locked=True).filter(
                status='complete',
                is_refreshing=False,
                last_refreshed__lt=stale_threshold,
            )
        )
        if stale:
            Company.objects.filter(pk__in=[c.pk for c in stale]).update(
                status='processing',
                is_refreshing=True,
            )

    for company in stale:
        run_company_pipeline.delay(company.pk)

    logger.info('refresh_stale_companies: recovered stuck=%d, queued_refresh=%d', 0, len(stale))
