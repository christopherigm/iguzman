from django.core.cache import cache
from django.utils import timezone

# Metric fields mirrored from a JobApplication onto the JobPosting it was saved
# from, so the jobs feed and recent-searches tallies reflect the same scores.
# The jobs page buckets postings client-side from ``overall_match`` +
# ``us_citizen_or_pr_required``, and the per-search strong/possible/low tallies
# are aggregated from ``overall_match`` at query time, so syncing these fields
# keeps both the bucket placement and the tallies consistent with the application.
_MIRRORED_FIELDS = (
    'overall_match',
    'overall_match_explanation',
    'technical_match',
    'technical_match_explanation',
    'nafta_tn_likelihood',
    'nafta_tn_likelihood_explanation',
    'us_citizen_or_pr_required',
)


def sync_posting_metrics(application) -> None:
    """Mirror an application's match metrics onto the JobPosting it was saved from.

    No-op when the application was not saved from a posting. Busts the owner's
    jobs-feed and recent-searches caches so the next load reflects the new bucket
    and per-search tally.
    """
    posting_id = application.source_posting_id
    if not posting_id:
        return

    # Lazy import: jobs.models imports from applications.models, so a top-level
    # import here would be circular.
    from jobs.models import JobPosting

    updates = {field: getattr(application, field) for field in _MIRRORED_FIELDS}
    JobPosting.objects.filter(pk=posting_id).update(modified=timezone.now(), **updates)

    cache.delete(f'jobs:feed:{application.user_id}')
    cache.delete(f'jobs:searches:{application.user_id}')
