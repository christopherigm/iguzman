import logging

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .ingest import upsert_postings
from .providers import ProviderError, get_client

logger = logging.getLogger(__name__)

_COUNTRY_TOKENS = {
    'ca': ('canada', 'ontario', 'quebec', 'toronto', 'vancouver', 'montreal', 'alberta'),
    'mx': ('mexico', 'méxico', 'cdmx', 'guadalajara', 'monterrey', 'jalisco'),
}

_YEARS_QUERY: dict[int, str] = {
    0: 'entry level',
    1: '1-2 years experience',
    3: '3-5 years experience',
    6: '6-9 years experience',
    10: '10+ years experience',
    15: '15+ years experience',
}


def _detect_country(location: str) -> str:
    blob = (location or '').lower()
    for country, tokens in _COUNTRY_TOKENS.items():
        if any(tok in blob for tok in tokens):
            return country
    return 'us'


def _build_query_parts(profile) -> list[str]:
    """Build query terms from a UserProfile according to its job search preferences."""
    from career.models import Education, Language

    user_id = profile.user_id
    parts: list[str] = []

    if profile.job_search_include_title and profile.job_title.strip():
        parts.append(profile.job_title.strip())

    if profile.job_search_include_stack:
        top_stack = profile.preferred_stack.first()
        if top_stack:
            parts.append(top_stack.name)

    if profile.job_search_include_tn_profession and profile.tn_profession:
        parts.append(profile.tn_profession)

    if profile.job_search_include_years and profile.years_of_experience is not None:
        label = _YEARS_QUERY.get(profile.years_of_experience, f'{profile.years_of_experience}+ years experience')
        parts.append(label)

    if profile.job_search_bilingual:
        if Language.objects.filter(user_id=user_id).count() >= 2:
            parts.append('bilingual')

    if profile.job_search_include_education:
        edu = Education.objects.filter(user_id=user_id).order_by('-start_year').first()
        if edu:
            parts.append(edu.get_degree_display())

    if profile.job_search_extra_text.strip():
        parts.append(profile.job_search_extra_text.strip())

    return parts or [profile.job_title.strip()]


def _resolve_query(profile) -> str:
    """The search query for a profile.

    Prefers the LLM-generated single-sentence query when the user has one;
    otherwise falls back to joining the individual preference-derived parts.
    """
    generated = (profile.job_search_generated_query or '').strip()
    if generated:
        return generated
    return ' '.join(_build_query_parts(profile))


def _build_queries(budget: int) -> list[dict]:
    """Deduplicated search queries derived from active users' profiles.

    Each query is built from the user's job search preferences.
    Capped at ``budget`` to respect Adzuna's free-tier daily ceiling.
    """
    from users.models import UserProfile

    seen: set[tuple[str, str]] = set()
    queries: list[dict] = []

    profiles = (
        UserProfile.objects
        .exclude(job_title='')
        .prefetch_related('preferred_stack')
        .select_related('user')
    )
    for profile in profiles:
        if not profile.job_title.strip():
            continue

        query = _resolve_query(profile)

        if profile.job_search_include_location:
            location = profile.location.strip()
            country = _detect_country(profile.location)
        else:
            location = ''
            country = 'us'

        key = (query.lower(), country)
        if key in seen:
            continue
        seen.add(key)
        queries.append({'query': query, 'location': location, 'country': country})
        if len(queries) >= budget:
            break

    return queries


@shared_task
def ingest_shared_catalog() -> None:
    """Fetch the shared catalog from the platform Adzuna account."""
    if not settings.ADZUNA_APP_ID or not settings.ADZUNA_APP_KEY:
        logger.info('ingest_shared_catalog: Adzuna not configured, skipping.')
        return

    budget = settings.JOBS_ADZUNA_DAILY_BUDGET
    queries = _build_queries(budget)
    if not queries:
        logger.info('ingest_shared_catalog: no active-user queries to run.')
        return

    logger.info(
        'ingest_shared_catalog: running %d queries: %s',
        len(queries),
        [f"{spec['query']!r}@{spec['country']}/{spec['location']!r}" for spec in queries],
    )

    try:
        client = get_client('adzuna')
    except ProviderError as exc:
        logger.warning('ingest_shared_catalog: %s', exc)
        return

    totals = {'created': 0, 'refreshed': 0, 'skipped_dup': 0, 'total': 0}
    for spec in queries:
        try:
            postings = client.search(
                query=spec['query'],
                location=spec['location'],
                country=spec['country'],
            )
        except ProviderError as exc:
            logger.warning('Adzuna search failed for %r: %s', spec['query'], exc)
            continue
        result = upsert_postings('adzuna', postings)
        logger.info(
            'ingest_shared_catalog query=%r country=%s location=%r '
            'fetched=%d created=%d refreshed=%d skipped_dup=%d',
            spec['query'], spec['country'], spec['location'],
            result['total'], result['created'], result['refreshed'], result['skipped_dup'],
        )
        for key in totals:
            totals[key] += result[key]

    logger.info(
        'ingest_shared_catalog: queries=%d fetched=%d created=%d refreshed=%d skipped_dup=%d',
        len(queries), totals['total'], totals['created'], totals['refreshed'], totals['skipped_dup'],
    )


@shared_task
def prune_expired_postings() -> None:
    from .models import JobPosting

    deleted, _ = JobPosting.objects.filter(expires_at__lt=timezone.now()).delete()
    logger.info('prune_expired_postings: deleted=%d', deleted)


def select_user_credential(user_id: int):
    """Pick the BYOK credential to spend on a single on-demand fetch.

    Tries providers in :data:`PROVIDER_PRIORITY` order (Adzuna, then JSearch) and
    returns the first active credential that still has daily quota left, so the
    fallback provider is only used once the primary's limit is reached. Returns
    ``None`` when the user has no active credential with calls remaining.
    """
    from .models import PROVIDER_PRIORITY, UserApiCredential

    by_provider = {
        cred.provider: cred
        for cred in UserApiCredential.objects.filter(user_id=user_id, is_active=True).select_related('user')
    }
    for provider in PROVIDER_PRIORITY:
        cred = by_provider.get(provider)
        if cred is not None and cred.calls_remaining > 0:
            return cred
    return None


@shared_task
def ingest_user_feed(user_id: int) -> None:
    """Fetch a private feed for a BYOK user using their own decrypted key.

    Spends exactly one provider call per run — Adzuna first, falling back to
    JSearch once Adzuna's daily limit is reached. Results are stored as private,
    owner-scoped postings (option A) and never enter the shared catalog.
    """
    credential = select_user_credential(user_id)
    if credential is None:
        logger.info('ingest_user_feed: no active credential with remaining quota for user=%s', user_id)
        return

    from users.models import UserProfile

    profile = UserProfile.objects.filter(user_id=user_id).prefetch_related('preferred_stack').first()
    if profile is None or not profile.job_title.strip():
        logger.info('ingest_user_feed: user=%s has no job title to search with', user_id)
        return

    query = _resolve_query(profile)

    if profile.job_search_include_location:
        location = profile.location.strip()
        country = _detect_country(profile.location)
    else:
        location = ''
        country = 'us'

    try:
        client = get_client(credential.provider, api_key=credential.get_key())
        postings = client.search(query=query, location=location, country=country)
    except ProviderError as exc:
        logger.warning('ingest_user_feed: %s search failed for user=%s: %s',
                       credential.provider, user_id, exc)
        return

    # The provider exposes no usage data, so deduct the call we just made.
    credential.record_call()
    cache.delete(f'jobs:credentials:{user_id}')
    result = upsert_postings(
        credential.provider, postings,
        owner=credential.user, is_private=True,
    )
    # New private postings must appear in this user's ranked feed immediately.
    cache.delete(f'jobs:feed:{user_id}')
    logger.info(
        'ingest_user_feed: user=%s provider=%s created=%d refreshed=%d',
        user_id, credential.provider, result['created'], result['refreshed'],
    )
