import hashlib
import re

from django.contrib.auth.models import User
from django.db import models
from django.db.models import Q
from django.utils import timezone

from applications.models import _normalize_company_name
from core.models import Common

from .crypto import decrypt_key, encrypt_key

PROVIDER_CHOICES = [
    ('adzuna', 'Adzuna'),
    ('jsearch', 'JSearch'),
]

# Order providers are tried in: JSearch is the primary because it returns the
# full job description; Adzuna is the breadth fallback (its API only returns a
# truncated description snippet). A fetch tries each in turn, using the first
# that returns results / still has daily quota left.
PROVIDER_PRIORITY = ['jsearch', 'adzuna']

# Adzuna's free tier allows ~250 calls/day; it returns no usage data in its
# responses, so we count BYOK calls ourselves and reset the tally each day.
# Used as the default ``call_limit`` for a new credential per provider.
DEFAULT_DAILY_LIMITS = {
    'adzuna': 250,
    'jsearch': 200,
}

CURRENCY_CHOICES = [
    ('USD', 'USD'),
    ('CAD', 'CAD'),
    ('EUR', 'EUR'),
    ('MXN', 'MXN'),
    ('GBP', 'GBP'),
]

# Countries the catalog targets (USMCA region). Stored on every posting so the
# feed can filter cheaply without re-parsing the location string.
COUNTRY_CHOICES = [
    ('us', 'United States'),
    ('ca', 'Canada'),
    ('mx', 'Mexico'),
]

# Lifecycle of a per-user fetch run. At most one 'running' row exists per user at a
# time (enforced by a partial unique constraint); the UI polls until it leaves
# 'running' and blocks a new fetch while one is active.
JOB_SEARCH_STATUS_CHOICES = [
    ('running', 'Running'),
    ('done', 'Done'),
    ('failed', 'Failed'),
]


def _normalize_simple(value: str) -> str:
    value = (value or '').lower().strip()
    value = re.sub(r'[^\w\s]', '', value)
    value = re.sub(r'\s+', ' ', value).strip()
    return value


def compute_dedup_hash(company_name: str, job_title: str, location: str) -> str:
    """Cross-provider duplicate key: same role at the same company & place.

    Reuses ``applications.models._normalize_company_name`` so a posting and the
    application a user saves from it normalize companies the same way.
    """
    parts = '|'.join([
        _normalize_company_name(company_name or ''),
        _normalize_simple(job_title),
        _normalize_simple(location),
    ])
    return hashlib.sha1(parts.encode()).hexdigest()


class JobPosting(Common):
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    provider_uid = models.CharField(max_length=255)
    dedup_hash = models.CharField(max_length=40, db_index=True)

    company_name = models.CharField(max_length=200)
    job_title = models.CharField(max_length=255)
    job_description = models.TextField(blank=True)
    job_url = models.URLField(max_length=2048)
    salary_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, blank=True)
    work_type = models.JSONField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    country = models.CharField(max_length=2, choices=COUNTRY_CHOICES, blank=True, db_index=True)
    category = models.CharField(max_length=120, blank=True)
    tags = models.JSONField(null=True, blank=True)

    # Lifecycle
    fetched_at = models.DateTimeField()
    expires_at = models.DateTimeField(db_index=True)
    raw = models.JSONField(null=True, blank=True)

    # Per-user LLM match metrics. Only populated for private (owner-scoped) postings,
    # where a single owner makes a per-user score safe to store on the row itself.
    # Mirrors the metric fields on applications.JobApplication.
    search = models.ForeignKey(
        'JobSearch',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='postings',
    )
    overall_match = models.PositiveSmallIntegerField(null=True, blank=True)
    overall_match_explanation = models.TextField(blank=True)
    technical_match = models.PositiveSmallIntegerField(null=True, blank=True)
    technical_match_explanation = models.TextField(blank=True)
    nafta_tn_likelihood = models.PositiveSmallIntegerField(null=True, blank=True)
    nafta_tn_likelihood_explanation = models.TextField(blank=True)
    us_citizen_or_pr_required = models.BooleanField(null=True, blank=True)
    # Hard gate: the JD requires a spoken language the user does not have (see
    # applications.scoring.detect_unmet_language_requirement). Drops to "No Match".
    language_requirement_unmet = models.BooleanField(null=True, blank=True)

    # BYOK private results (option A): postings fetched with a user's own key are
    # owned by that user and excluded from the shared feed for everyone else.
    is_private = models.BooleanField(default=False)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='private_postings',
    )

    class Meta:
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'provider_uid'],
                condition=Q(owner__isnull=True),
                name='unique_shared_posting',
            ),
            models.UniqueConstraint(
                fields=['provider', 'provider_uid', 'owner'],
                condition=Q(owner__isnull=False),
                name='unique_private_posting',
            ),
        ]
        indexes = [
            models.Index(fields=['country', '-created']),
            models.Index(fields=['is_private', 'owner']),
        ]

    def __str__(self):
        scope = f'private:{self.owner_id}' if self.is_private else 'shared'
        return f'{self.job_title} at {self.company_name} ({self.provider}/{scope})'


class JobSearch(Common):
    """One per-user BYOK fetch run.

    ``created`` (from :class:`core.models.Common`) records when the search started.
    ``jobs_found`` is the number of postings stored; ``metrics_completed`` counts how
    many have finished LLM scoring. The partial unique constraint guarantees at most
    one ``running`` search per user, which gates concurrent fetches.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='job_searches')
    query = models.TextField(blank=True)
    # The location term used for the search (empty when the user opted out of
    # location filtering); surfaced beside the query in the recent-searches card.
    location = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=JOB_SEARCH_STATUS_CHOICES, default='running')
    jobs_found = models.PositiveIntegerField(default=0)
    metrics_completed = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created']
        verbose_name_plural = 'job searches'
        constraints = [
            models.UniqueConstraint(
                fields=['user'],
                condition=Q(status='running'),
                name='unique_running_search_per_user',
            ),
        ]

    def __str__(self):
        return f'JobSearch({self.user_id}, {self.status}, {self.metrics_completed}/{self.jobs_found})'


class UserApiCredential(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_credentials')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    encrypted_key = models.TextField()
    label = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)

    # Usage tracking. Providers like Adzuna do not report consumed/remaining
    # quota, so we count each search() call against a daily limit ourselves.
    # ``calls_used`` applies to ``usage_date``; it auto-resets on a new day.
    call_limit = models.PositiveIntegerField(default=0)
    calls_used = models.PositiveIntegerField(default=0)
    usage_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['provider']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'provider'],
                name='unique_credential_per_user_provider',
            ),
        ]

    def save(self, *args, **kwargs):
        # Seed the per-provider default limit on first save; admins may edit it.
        if not self.pk and not self.call_limit:
            self.call_limit = DEFAULT_DAILY_LIMITS.get(self.provider, 250)
        super().save(*args, **kwargs)

    @property
    def calls_used_today(self) -> int:
        """Calls consumed today, treating a stale ``usage_date`` as a fresh day."""
        if self.usage_date != timezone.localdate():
            return 0
        return self.calls_used

    @property
    def calls_remaining(self) -> int:
        return max(0, self.call_limit - self.calls_used_today)

    def record_call(self, count: int = 1) -> None:
        """Deduct ``count`` API calls from today's allowance, resetting on a new day."""
        today = timezone.localdate()
        if self.usage_date != today:
            self.usage_date = today
            self.calls_used = 0
        self.calls_used += count
        self.save(update_fields=['usage_date', 'calls_used', 'modified'])

    def set_key(self, plaintext: str) -> None:
        self.encrypted_key = encrypt_key(plaintext)

    def get_key(self) -> str:
        return decrypt_key(self.encrypted_key)

    def __str__(self):
        return f'{self.provider} credential ({self.user.email})'
