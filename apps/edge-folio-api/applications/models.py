import os
import uuid

from django.contrib.auth.models import User
from django.db import models

from core.fields import ResizedImageField
from core.models import Common

STATUS_CHOICES = [
    ('draft', 'Draft'),
    ('applied', 'Applied'),
    ('interview', 'Interview'),
    ('offer', 'Offer'),
    ('rejected', 'Rejected'),
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
    cover_letter = models.TextField(blank=True)
    company_image = ResizedImageField(
        upload_to=_application_image_upload,
        null=True,
        blank=True,
        max_size=[256, None],
    )

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return f'{self.job_title} at {self.company_name} ({self.user.email})'
