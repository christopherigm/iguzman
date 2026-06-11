import os
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


def _application_image_upload(instance, filename):
    ext = os.path.splitext(filename)[1].lstrip('.') or 'jpg'
    return f'applications/images/{uuid.uuid4().hex}.{ext}'


class JobApplication(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='job_applications')
    company_name = models.CharField(max_length=200)
    job_title = models.CharField(max_length=200)
    job_description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    job_url = models.URLField(max_length=2048, blank=True)
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
    company_description = models.TextField(blank=True)
    salary_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, blank=True)
    work_type = models.JSONField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    us_citizen_or_pr_required = models.BooleanField(null=True, blank=True)
    company_image = ResizedImageField(
        upload_to=_application_image_upload,
        null=True,
        blank=True,
        max_size=[256, None],
    )
    tailored_skills = models.ManyToManyField(
        'matrix.Skill',
        blank=True,
        related_name='job_applications',
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
