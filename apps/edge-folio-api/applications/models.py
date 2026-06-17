import os
import re
import uuid

from django.contrib.auth.models import User
from django.db import models
from django.db.models import Q

from core.fields import ResizedImageField
from core.models import Common

STATUS_CHOICES = [
    ('draft', 'Draft'),
    ('applied', 'Applied'),
    ('interview', 'Interview'),
    ('offer', 'Offer'),
    ('rejected', 'Rejected'),
]

CURRENCY_CHOICES = [
    ('USD', 'USD'),
    ('CAD', 'CAD'),
    ('EUR', 'EUR'),
    ('MXN', 'MXN'),
    ('GBP', 'GBP'),
]

COMPANY_STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('processing', 'Processing'),
    ('complete', 'Complete'),
    ('failed', 'Failed'),
]

TAILOR_STATUS_CHOICES = [
    ('processing', 'Processing'),
    ('complete', 'Complete'),
    ('failed', 'Failed'),
]

INTEL_SCORE_CHOICES = [
    ('positive', 'Positive'),
    ('mixed', 'Mixed'),
    ('concerning', 'Concerning'),
]

_LEGAL_SUFFIXES_RE = re.compile(
    r'\b(incorporated|corporation|limited|inc|llc|ltd|corp|co|gmbh|plc|ag|nv|bv|sa|sas|sarl'
    r'|group|holdings|international|enterprises|solutions|technologies|services|systems)\.?\b',
    re.IGNORECASE,
)


def _normalize_company_name(name: str) -> str:
    name = name.lower().strip()
    name = _LEGAL_SUFFIXES_RE.sub('', name)
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def _company_image_upload(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'companies/images/{uuid.uuid4().hex}.{ext}'


def _application_image_upload(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'applications/images/{uuid.uuid4().hex}.{ext}'


class Company(Common):
    name = models.CharField(max_length=200)
    normalized_name = models.CharField(max_length=200, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=COMPANY_STATUS_CHOICES, default='pending')
    intel_score = models.CharField(max_length=20, choices=INTEL_SCORE_CHOICES, blank=True)
    is_refreshing = models.BooleanField(default=False)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    last_refreshed = models.DateTimeField(null=True, blank=True)
    retry_count = models.PositiveSmallIntegerField(default=0)
    description = models.TextField(blank=True)
    intel = models.JSONField(null=True, blank=True)
    analysis = models.JSONField(null=True, blank=True)
    image = ResizedImageField(
        upload_to=_company_image_upload,
        null=True,
        blank=True,
        max_size=[256, None],
    )

    class Meta:
        ordering = ['-created']
        verbose_name_plural = 'companies'

    def __str__(self):
        return f'{self.name} ({self.status})'


class JobApplication(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='job_applications')
    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='job_applications',
    )
    company_name = models.CharField(max_length=200)
    job_title = models.CharField(max_length=200)
    job_description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    job_url = models.URLField(max_length=2048, blank=True)
    tailor_status = models.CharField(max_length=20, choices=TAILOR_STATUS_CHOICES, blank=True)
    tailor_started_at = models.DateTimeField(null=True, blank=True)
    tailored_bullets = models.JSONField(null=True, blank=True)
    tailored_work_experiences = models.JSONField(null=True, blank=True)
    tailored_projects = models.JSONField(null=True, blank=True)
    professional_summary = models.TextField(blank=True)
    cover_letter = models.TextField(blank=True)
    nafta_letter = models.TextField(blank=True)
    overall_match = models.PositiveSmallIntegerField(null=True, blank=True)
    overall_match_explanation = models.TextField(blank=True)
    technical_match = models.PositiveSmallIntegerField(null=True, blank=True)
    technical_match_explanation = models.TextField(blank=True)
    nafta_tn_likelihood = models.PositiveSmallIntegerField(null=True, blank=True)
    nafta_tn_likelihood_explanation = models.TextField(blank=True)
    salary_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, blank=True)
    work_type = models.JSONField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    us_citizen_or_pr_required = models.BooleanField(null=True, blank=True)
    # Computed hard gate: the JD requires a spoken language the user does not have.
    # Mirrored onto the source JobPosting so the jobs-page bucket stays in sync.
    language_requirement_unmet = models.BooleanField(null=True, blank=True)
    tailored_skills = models.ManyToManyField(
        'matrix.Skill',
        blank=True,
        related_name='job_applications',
    )
    source_posting = models.ForeignKey(
        'jobs.JobPosting',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='applications',
    )

    class Meta:
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'job_url'],
                condition=~Q(job_url=''),
                name='unique_job_application_url_per_user',
            ),
        ]

    def __str__(self):
        return f'{self.job_title} at {self.company_name} ({self.user.email})'
