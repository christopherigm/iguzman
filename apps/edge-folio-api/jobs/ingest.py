"""Upsert + cross-provider dedup for fetched postings."""

import logging
from datetime import timedelta

from django.utils import timezone

from .models import JobPosting, compute_dedup_hash
from .providers import NormalizedPosting

logger = logging.getLogger(__name__)

POSTING_TTL = timedelta(days=30)

# Fields copied from a NormalizedPosting onto JobPosting on every upsert.
_CONTENT_FIELDS = (
    'company_name', 'job_title', 'job_description', 'job_url',
    'salary_min', 'salary_max', 'salary_currency',
    'work_type', 'location', 'country', 'category', 'tags',
    'raw',
)


def upsert_postings(
    provider: str,
    postings: list[NormalizedPosting],
    owner=None,
    is_private: bool = False,
) -> dict:
    """Insert or refresh postings; returns counts for logging.

    For the shared catalog, a posting whose ``dedup_hash`` already exists from a
    *different* provider is treated as a duplicate — first-seen wins and we only
    refresh the original's freshness (``fetched_at`` / ``expires_at``).
    """
    now = timezone.now()
    expires_at = now + POSTING_TTL
    created = refreshed = skipped_dup = 0

    for posting in postings:
        if not posting.provider_uid or not posting.job_url:
            continue

        dedup_hash = compute_dedup_hash(
            posting.company_name, posting.job_title, posting.location
        )

        if not is_private:
            duplicate = (
                JobPosting.objects
                .filter(dedup_hash=dedup_hash, is_private=False)
                .exclude(provider=provider)
                .first()
            )
            if duplicate is not None:
                JobPosting.objects.filter(pk=duplicate.pk).update(
                    fetched_at=now, expires_at=expires_at, modified=now
                )
                skipped_dup += 1
                continue

        defaults = {field: getattr(posting, field) for field in _CONTENT_FIELDS}
        defaults.update({
            'dedup_hash': dedup_hash,
            'fetched_at': now,
            'expires_at': expires_at,
            'is_private': is_private,
            'owner': owner,
        })

        _, was_created = JobPosting.objects.update_or_create(
            provider=provider,
            provider_uid=posting.provider_uid,
            owner=owner,
            defaults=defaults,
        )
        if was_created:
            created += 1
        else:
            refreshed += 1

    return {
        'created': created,
        'refreshed': refreshed,
        'skipped_dup': skipped_dup,
        'total': len(postings),
    }
