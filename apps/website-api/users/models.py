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


class CartItem(models.Model):
    """A line in a user's cart: one buyable, optionally one of its variants, and a quantity.

    Shaped like `Favorite` - one row per line, exactly one of `product` /
    `service`, `system` scoping the row to the tenant - with the two differences
    a cart needs:

    * **The variant is part of the line's identity.** Size-Small and Size-Large
      are two lines of the same product, priced independently, so the variant FK
      is what `effective_price` is read from at render time. Nothing here
      snapshots a price: there is no checkout yet, so a line always reflects
      today's catalog rather than a frozen number that would go stale.
    * **Quantity.** Adding an item already in the cart increments this rather
      than creating a second row.

    The variant columns pair with their own parent (`product_variant` only when
    `product` is set), but that a variant actually *belongs* to that parent is a
    cross-table fact a CheckConstraint cannot see - the write path enforces it.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="cart_items")
    system = models.ForeignKey(
        'core.System',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='cart_items',
    )
    product = models.ForeignKey(
        'catalog.Product',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    service = models.ForeignKey(
        'catalog.Service',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    product_variant = models.ForeignKey(
        'catalog.ProductVariant',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    service_variant = models.ForeignKey(
        'catalog.ServiceVariant',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # Uniqueness is split in two per target because SQL treats NULLs as
            # distinct: a single UniqueConstraint over (user, product, variant)
            # would let "product with no variant" be inserted any number of
            # times. The variant-null case therefore needs its own constraint.
            models.UniqueConstraint(
                fields=['user', 'product', 'product_variant'],
                condition=models.Q(product__isnull=False, product_variant__isnull=False),
                name='unique_user_product_variant_cart_item',
            ),
            models.UniqueConstraint(
                fields=['user', 'product'],
                condition=models.Q(product__isnull=False, product_variant__isnull=True),
                name='unique_user_product_cart_item',
            ),
            models.UniqueConstraint(
                fields=['user', 'service', 'service_variant'],
                condition=models.Q(service__isnull=False, service_variant__isnull=False),
                name='unique_user_service_variant_cart_item',
            ),
            models.UniqueConstraint(
                fields=['user', 'service'],
                condition=models.Q(service__isnull=False, service_variant__isnull=True),
                name='unique_user_service_cart_item',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False, service__isnull=True)
                    | models.Q(product__isnull=True, service__isnull=False)
                ),
                name='cart_item_exactly_one_target',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False, service_variant__isnull=True)
                    | models.Q(service__isnull=False, product_variant__isnull=True)
                ),
                name='cart_item_variant_matches_target',
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name='cart_item_quantity_positive',
            ),
        ]

    @property
    def kind(self):
        return 'product' if self.product_id else 'service'

    @property
    def target(self):
        return self.product or self.service

    @property
    def variant(self):
        return self.product_variant or self.service_variant

    @property
    def unit_price(self):
        """What one of this line costs today - the variant's price when it
        overrides, else the buyable's own."""
        variant = self.variant
        return variant.effective_price if variant else self.target.price

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def __str__(self):
        label = str(self.variant) if self.variant else str(self.target)
        return f"{self.user.email} 🛒 {self.quantity}× {label}"


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
