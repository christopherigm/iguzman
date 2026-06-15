from django.contrib.auth.models import User
from django.db import models

import uuid
from datetime import timedelta


def profile_picture_upload_path(instance, filename):
    return f'profile_pictures/{filename}'


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    profile_picture = models.ImageField(
        upload_to=profile_picture_upload_path,
        null=True,
        blank=True,
    )
    job_title = models.CharField(max_length=150, blank=True, default='')
    years_of_experience = models.PositiveSmallIntegerField(null=True, blank=True)
    preferred_stack = models.ManyToManyField(
        'career.TechStack',
        blank=True,
        related_name='user_profiles',
    )
    phone = models.CharField(max_length=30, blank=True, default='')
    location = models.CharField(max_length=200, blank=True, default='')
    github_url = models.URLField(max_length=200, blank=True, default='')
    linkedin_url = models.URLField(max_length=200, blank=True, default='')
    summary = models.TextField(blank=True, default='')
    tn_profession = models.CharField(max_length=200, blank=True, default='')
    citizenship = models.CharField(max_length=50, blank=True, default='')

    # ── Job search preferences ────────────────────────────────────────────────
    job_search_include_title = models.BooleanField(default=True)
    job_search_extra_text = models.CharField(max_length=200, blank=True, default='')
    job_search_bilingual = models.BooleanField(default=False)
    job_search_include_tn_profession = models.BooleanField(default=False)
    job_search_include_education = models.BooleanField(default=False)
    job_search_include_years = models.BooleanField(default=False)
    job_search_include_stack = models.BooleanField(default=False)
    job_search_include_location = models.BooleanField(default=False)
    # LLM-generated single-sentence search query, composed from the preferences
    # above. When set, the jobs worker uses it verbatim instead of joining the
    # individual query parts.
    job_search_generated_query = models.CharField(max_length=300, blank=True, default='')

    def __str__(self):
        return f'Profile of {self.user.username}'


class EmailVerificationToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='email_verification_token')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        from django.conf import settings
        from django.utils import timezone
        expiry_hours = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS', 24)
        return timezone.now() > self.created_at + timedelta(hours=expiry_hours)

    def __str__(self):
        return f'EmailVerificationToken for {self.user.username}'


class PasswordResetToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='password_reset_token')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        from django.conf import settings
        from django.utils import timezone
        expiry_hours = getattr(settings, 'PASSWORD_RESET_TOKEN_EXPIRY_HOURS', 1)
        return timezone.now() > self.created_at + timedelta(hours=expiry_hours)

    def __str__(self):
        return f'PasswordResetToken for {self.user.username}'


class PasskeyCredential(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='passkey_credentials')
    credential_id = models.CharField(max_length=512, unique=True)
    public_key = models.BinaryField()
    sign_count = models.PositiveIntegerField(default=0)
    transports = models.JSONField(default=list, blank=True)
    name = models.CharField(max_length=64, default='My passkey')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Passkey '{self.name}' for {self.user.email}"
