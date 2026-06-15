import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .ingest import upsert_postings
from .providers import ProviderError, get_client

logger = logging.getLogger(__name__)

# Map free-text profile locations onto the catalog's supported countries.
_COUNTRY_TOKENS = {
    'ca': ('canada', 'ontario', 'quebec', 'toronto', 'vancouver', 'montreal', 'alberta'),
    'mx': ('mexico', 'méxico', 'cdmx', 'guadalajara', 'monterrey', 'jalisco'),
}


def _detect_country(location: str) -> str:
    blob = (location or '').lower()
    for country, tokens in _COUNTRY_TOKENS.items():
        if any(tok in blob for tok in tokens):
            return country
    return 'us'


def _build_queries(budget: int) -> list[dict]:
    """Deduplicated search queries derived from active users' profiles.

    Each query combines the user's job title with their top preferred stack and
    is scoped to a country/location. Capped at ``budget`` to respect Adzuna's
    free-tier daily ceiling.
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
        job_title = profile.job_title.strip()
        if not job_title:
            continue
        top_stack = profile.preferred_stack.first()
        query = f'{job_title} {top_stack.name}'.strip() if top_stack else job_title
        country = _detect_country(profile.location)
        key = (query.lower(), country)
        if key in seen:
            continue
        seen.add(key)
        queries.append({
            'query': query,
            'location': profile.location.strip(),
            'country': country,
        })
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

    try:
        client = get_client('adzuna')
    except ProviderError as exc:
        logger.warning('ingest_shared_catalog: %s', exc)
        return

    totals = {'created': 0, 'refreshed': 0, 'skipped_dup': 0}
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
        for key in totals:
            totals[key] += result[key]

    logger.info(
        'ingest_shared_catalog: queries=%d created=%d refreshed=%d skipped_dup=%d',
        len(queries), totals['created'], totals['refreshed'], totals['skipped_dup'],
    )


@shared_task
def prune_expired_postings() -> None:
    from .models import JobPosting

    deleted, _ = JobPosting.objects.filter(expires_at__lt=timezone.now()).delete()
    logger.info('prune_expired_postings: deleted=%d', deleted)


@shared_task
def ingest_user_feed(user_id: int) -> None:
    """Fetch a private feed for a BYOK user using their own decrypted keys.

    Results are stored as private, owner-scoped postings (option A) and never
    enter the shared catalog.
    """
    from .models import UserApiCredential

    credentials = UserApiCredential.objects.filter(user_id=user_id, is_active=True).select_related('user')
    if not credentials:
        logger.info('ingest_user_feed: no active credentials for user=%s', user_id)
        return

    from users.models import UserProfile

    profile = UserProfile.objects.filter(user_id=user_id).prefetch_related('preferred_stack').first()
    if profile is None or not profile.job_title.strip():
        logger.info('ingest_user_feed: user=%s has no job title to search with', user_id)
        return

    top_stack = profile.preferred_stack.first()
    query = f'{profile.job_title} {top_stack.name}'.strip() if top_stack else profile.job_title.strip()
    location = profile.location.strip()
    country = _detect_country(profile.location)

    for credential in credentials:
        try:
            client = get_client(credential.provider, api_key=credential.get_key())
            postings = client.search(query=query, location=location, country=country)
        except ProviderError as exc:
            logger.warning('ingest_user_feed: %s search failed for user=%s: %s',
                           credential.provider, user_id, exc)
            continue
        result = upsert_postings(
            credential.provider, postings,
            owner=credential.user, is_private=True,
        )
        logger.info(
            'ingest_user_feed: user=%s provider=%s created=%d refreshed=%d',
            user_id, credential.provider, result['created'], result['refreshed'],
        )
