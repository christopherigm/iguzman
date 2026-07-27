import uuid

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

from core.tenant_paths import system_id_for, tenant_path


def profile_picture_upload_path(instance, filename):
    """Tenant-prefixed like every other upload - see `core.picture`.

    A customer's avatar belongs to the tenant they signed up with, so it follows
    that tenant to its own R2 bucket. `UserProfile` carries the `system` FK
    directly, so this costs no extra query.
    """
    base = f"profile_pictures/user_{instance.user.id}/{filename}"
    return tenant_path(system_id_for(instance), base)


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
    """A product, service or menu item a user has saved.

    One row per saved item, holding exactly one of `product` / `service` /
    `menu_item` - the CheckConstraint is what keeps a row from meaning "several"
    or "none", so the `kind` the API reports can always be derived from which
    column is set.

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
    menu_item = models.ForeignKey(
        'catalog.MenuItem',
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
            models.UniqueConstraint(
                fields=['user', 'menu_item'],
                condition=models.Q(menu_item__isnull=False),
                name='unique_user_menu_item_favorite',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False, service__isnull=True, menu_item__isnull=True)
                    | models.Q(product__isnull=True, service__isnull=False, menu_item__isnull=True)
                    | models.Q(product__isnull=True, service__isnull=True, menu_item__isnull=False)
                ),
                name='favorite_exactly_one_target',
            ),
        ]

    @property
    def kind(self):
        if self.product_id:
            return 'product'
        if self.service_id:
            return 'service'
        return 'menu_item'

    @property
    def target(self):
        return self.product or self.service or self.menu_item

    def __str__(self):
        return f"{self.user.email} ♥ {self.target}"


class CartItem(models.Model):
    """A line in a user's cart: one buyable and a quantity.

    Shaped like `Favorite` - one row per line, exactly one of `product` /
    `service` / `menu_item`, `system` scoping the row to the tenant - with the
    differences a cart needs:

    * **Nothing here snapshots a price.** There is no checkout yet, so a line
      always reflects today's catalog rather than a frozen number that would go
      stale. (`OrderLine` is where the snapshot happens.)
    * **Quantity.** Adding an item already in the cart increments this rather
      than creating a second row.

    A variant of a product or service is itself a standalone buyable (the
    `variants` M2M only links the family together), so picking one simply means
    this row points at that other Product/Service - there is no separate variant
    column to pair or constrain.
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
    menu_item = models.ForeignKey(
        'catalog.MenuItem',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    # A menu item's chosen ingredient selection, normalised to a sorted list of
    # {"ingredient": <id>, "quantity": <int>} (see catalog.normalize_selection).
    # It is part of a menu line's identity - two of the same dish with different
    # customisation are two lines - which is why, unlike product and service
    # lines, menu lines are not deduped by a database unique constraint (a JSON
    # column cannot express "same selection"); the cart write path merges them
    # instead. Empty list = the dish exactly as listed.
    customization = models.JSONField(default=list, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # One row per (user, buyable). Each constraint is conditional because
            # SQL treats NULLs as distinct, so an unconditional unique over
            # (user, product) would not stop a second "service" row from being
            # inserted any number of times against the same NULL product.
            models.UniqueConstraint(
                fields=['user', 'product'],
                condition=models.Q(product__isnull=False),
                name='unique_user_product_cart_item',
            ),
            models.UniqueConstraint(
                fields=['user', 'service'],
                condition=models.Q(service__isnull=False),
                name='unique_user_service_cart_item',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False, service__isnull=True, menu_item__isnull=True)
                    | models.Q(product__isnull=True, service__isnull=False, menu_item__isnull=True)
                    | models.Q(product__isnull=True, service__isnull=True, menu_item__isnull=False)
                ),
                name='cart_item_exactly_one_target',
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name='cart_item_quantity_positive',
            ),
        ]

    @property
    def kind(self):
        if self.product_id:
            return 'product'
        if self.service_id:
            return 'service'
        return 'menu_item'

    @property
    def target(self):
        return self.product or self.service or self.menu_item

    @property
    def unit_price(self):
        """What one of this line costs today - the menu item's price for its
        chosen ingredients when it is a menu line, else the buyable's own base
        price."""
        if self.menu_item_id:
            return self.menu_item.price_for_selection(self.customization)
        return self.target.price

    @property
    def line_total(self):
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.user.email} 🛒 {self.quantity}× {self.target}"


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
