import hashlib
import re

from django.contrib.auth.models import User
from django.db import models
from django.db.models import Q

from applications.models import _normalize_company_name
from core.models import Common

from .crypto import decrypt_key, encrypt_key

PROVIDER_CHOICES = [
    ('adzuna', 'Adzuna'),
    ('jsearch', 'JSearch'),
]

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


class UserApiCredential(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_credentials')
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    encrypted_key = models.TextField()
    label = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['provider']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'provider'],
                name='unique_credential_per_user_provider',
            ),
        ]

    def set_key(self, plaintext: str) -> None:
        self.encrypted_key = encrypt_key(plaintext)

    def get_key(self) -> str:
        return decrypt_key(self.encrypted_key)

    def __str__(self):
        return f'{self.provider} credential ({self.user.email})'
