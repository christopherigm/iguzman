from django.contrib.auth.models import User
from django.db import models

import secrets
import uuid
from datetime import timedelta

# Human-typed TV pairing code: an unambiguous alphabet (no 0/O/1/I/etc.) so a
# code read off a 10-foot screen and typed in the web app is hard to misread.
TV_USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
TV_USER_CODE_LENGTH = 8


def generate_tv_user_code():
    return ''.join(secrets.choice(TV_USER_CODE_ALPHABET) for _ in range(TV_USER_CODE_LENGTH))


def profile_picture_upload_path(instance, filename):
    return f'profile_pictures/{filename}'


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    profile_picture = models.ImageField(
        upload_to=profile_picture_upload_path,
        null=True,
        blank=True,
    )

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


class TvDeviceCode(models.Model):
    """
    A Smart-TV pairing request (OAuth 2.0 device-authorization style).

    The TV creates one of these, shows the short `user_code` on screen, and polls
    with the long secret `device_code`. The user, signed in on the web app, types
    the `user_code` at /tv which links their account (`status` -> authorized). The
    TV's next poll then redeems long-lived JWTs and the entry is consumed.
    """

    STATUS_PENDING = 'pending'
    STATUS_AUTHORIZED = 'authorized'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_AUTHORIZED, 'Authorized'),
    ]

    # Shown on the TV and typed by the user in the web app.
    user_code = models.CharField(max_length=12, unique=True, db_index=True)
    # Opaque secret the TV polls with - the short user_code alone can't redeem tokens.
    device_code = models.CharField(max_length=64, unique=True, db_index=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    # Set when the user authorizes the pairing; the redeemed tokens are minted for them.
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True, related_name='tv_device_codes'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

    def __str__(self):
        return f'TvDeviceCode {self.user_code} ({self.status})'


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
