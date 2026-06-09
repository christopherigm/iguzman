from django.contrib.auth.models import User
from django.db import models

from core.models import Common

STATUS_CHOICES = [
    ('draft', 'Draft'),
    ('applied', 'Applied'),
    ('interview', 'Interview'),
    ('offer', 'Offer'),
    ('rejected', 'Rejected'),
]


class JobApplication(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='job_applications')
    company_name = models.CharField(max_length=200)
    job_title = models.CharField(max_length=200)
    job_description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return f'{self.job_title} at {self.company_name} ({self.user.email})'
