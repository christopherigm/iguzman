import uuid

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


def profile_picture_upload_path(instance, filename):
    return f"profile_pictures/user_{instance.user.id}/{filename}"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='users',
    )
    is_admin = models.BooleanField(default=False)
    profile_picture = models.ImageField(
        upload_to=profile_picture_upload_path,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"Profile of {self.user.username}"


class Favorite(models.Model):
    """A product or service a user has saved.

    One row per saved item, holding exactly one of `product` / `service` - the
    CheckConstraint is what keeps a row from meaning "both" or "neither", so the
    `kind` the API reports can always be derived from which column is set.

    `system` scopes the row to the tenant the user saved it from: the catalog is
    per-System, so listing favorites without this filter would surface another
    customer's items on a shared account.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='favorites',
    )
    product = models.ForeignKey(
        'catalog.Product',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='favorites',
    )
    service = models.ForeignKey(
        'catalog.Service',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='favorites',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'product'],
                condition=models.Q(product__isnull=False),
                name='unique_user_product_favorite',
            ),
            models.UniqueConstraint(
                fields=['user', 'service'],
                condition=models.Q(service__isnull=False),
                name='unique_user_service_favorite',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False, service__isnull=True)
                    | models.Q(product__isnull=True, service__isnull=False)
                ),
                name='favorite_exactly_one_target',
            ),
        ]

    @property
    def kind(self):
        return 'product' if self.product_id else 'service'

    @property
    def target(self):
        return self.product or self.service

    def __str__(self):
        return f"{self.user.email} ♥ {self.target}"


class EmailVerificationToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="email_verification_token")
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        hours = getattr(settings, 'EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS', 24)
        return timezone.now() > self.created_at + timezone.timedelta(hours=hours)


class PasswordResetToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="password_reset_token")
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        hours = getattr(settings, 'PASSWORD_RESET_TOKEN_EXPIRY_HOURS', 1)
        return timezone.now() > self.created_at + timezone.timedelta(hours=hours)


class PasskeyCredential(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="passkey_credentials")
    system = models.ForeignKey(
        'core.System',
        on_delete=models.CASCADE,
        related_name='passkey_credentials',
    )
    credential_id = models.CharField(max_length=512)
    public_key = models.BinaryField()
    sign_count = models.PositiveIntegerField(default=0)
    transports = models.JSONField(default=list, blank=True)
    name = models.CharField(max_length=64, default="My passkey")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("system", "credential_id")

    def __str__(self):
        return f"Passkey '{self.name}' for {self.user.email}"
