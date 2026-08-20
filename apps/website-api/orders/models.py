import os
import uuid
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth.models import User
from django.db import models
from django.db.models.functions import Upper

from core.models import CURRENCY_CHOICES, System
from core.tenant_paths import tenant_path


def coupon_qr_upload_path(instance, filename):
    """Where a coupon's QR code image is stored.

    Tenant-prefixed like every other file (see `core.tenant_paths`) and named
    after the coupon's `public_id` rather than its `code`. The code is the thing
    a tenant renames - fixing a typo in "SUMER20" would otherwise orphan the PNG
    that is already on a printed flyer, and leave the bucket holding a file named
    after an offer that no longer exists.

    ⚠ Unlike an order's QR, this file is **meant** to be public: it goes on
    posters and social posts, and the code it encodes is one a tenant is handing
    out on purpose. There is nothing here to guess your way into.
    """
    ext = os.path.splitext(filename)[1].lstrip(".") or "png"
    return tenant_path(instance.system_id, f"coupons/qr/{instance.public_id}.{ext}")


class Coupon(models.Model):
    """A discount code a tenant hands out, redeemable a limited number of times.

    **One coupon is one code.** "SUMMER20", 20% off, redeemable 50 times, expiring
    on the 31st - not a batch of single-use codes. That is what makes the QR on a
    poster meaningful: everyone who scans it gets the same offer, and `max_redemptions`
    is what stops it from running forever. A per-customer single-use code would be a
    different model (a child row per issued code), and this one is deliberately not
    pretending to be both.

    **The discount is one amount off the basket, and `scope_kind` decides which
    part of the basket it is measured against.** Order-wide by default (a
    percentage or a fixed amount off the whole subtotal); with a scope set, off
    the lines matching one product, service, dish, or category of them. Either
    way what comes out is a single figure, which is what keeps it mappable onto
    one session-level Stripe discount without inventing per-line rounding - it
    is still not a per-item rule, it is an order-level discount with a narrower
    base.

    Nothing here is ever trusted from a browser: `orders.services.coupons` re-reads
    the row and re-computes the discount at checkout, and `times_redeemed` is moved
    with an F() expression so two customers checking out at once cannot both take
    the last redemption.
    """

    KIND_PERCENT = "percent"
    KIND_FIXED = "fixed"
    KIND_CHOICES = [
        (KIND_PERCENT, "Percentage off"),
        (KIND_FIXED, "Fixed amount off"),
    ]

    # ── What the discount is allowed to touch ─────────────────────────────────
    # A coupon is either order-wide (the historical and default behaviour) or
    # aimed at **one** catalog target: a single buyable, or a whole category of
    # them. Six kinds rather than two, because "category" is three different
    # tables here and an id alone cannot say which one it is in - the same
    # reason `SocialPost.related_kind` exists beside `related_id`.
    SCOPE_ORDER = ""
    SCOPE_PRODUCT = "product"
    SCOPE_SERVICE = "service"
    SCOPE_MENU_ITEM = "menu_item"
    SCOPE_PRODUCT_CATEGORY = "product_category"
    SCOPE_SERVICE_CATEGORY = "service_category"
    SCOPE_MENU_CATEGORY = "menu_category"
    SCOPE_CHOICES = [
        (SCOPE_ORDER, "The whole order"),
        (SCOPE_PRODUCT, "One product"),
        (SCOPE_SERVICE, "One service"),
        (SCOPE_MENU_ITEM, "One menu item"),
        (SCOPE_PRODUCT_CATEGORY, "A product category"),
        (SCOPE_SERVICE_CATEGORY, "A service category"),
        (SCOPE_MENU_CATEGORY, "A menu category"),
    ]
    # Which buyable family each scope kind selects, so `orders.services.coupons`
    # can match a cart line without a chain of ifs. A category kind matches the
    # same family as its item kind - it is the same line, judged by its
    # `category_id` instead of its own.
    SCOPE_ITEM_KINDS = {
        SCOPE_PRODUCT: "product",
        SCOPE_SERVICE: "service",
        SCOPE_MENU_ITEM: "menu_item",
    }
    SCOPE_CATEGORY_KINDS = {
        SCOPE_PRODUCT_CATEGORY: "product",
        SCOPE_SERVICE_CATEGORY: "service",
        SCOPE_MENU_CATEGORY: "menu_item",
    }

    # The coupon's stable handle, used for the QR file name and the CMS detail
    # URL. `code` is the customer-facing key but a tenant may edit it (a typo, a
    # re-run of last year's campaign), and anything keyed on it would break the
    # moment they did.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    system = models.ForeignKey(
        "core.System", on_delete=models.CASCADE, related_name="coupons",
    )

    # Stored exactly as the tenant typed it, so a flyer prints "SummerSale" the
    # way it was written - but matched case-insensitively at redemption, because
    # a customer reading it off a poster will type whatever they type. The unique
    # constraint below is on the *upper-cased* form so "summer20" and "SUMMER20"
    # cannot coexist and race for the same redemptions.
    code = models.CharField(max_length=64)
    # Internal label for the CMS list ("Black Friday, in-store flyers"). Never
    # shown to a customer.
    name = models.CharField(max_length=255, blank=True, default="")
    # Shown to the customer on the /coupon/<code> landing the QR points at.
    description = models.TextField(blank=True, default="")

    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default=KIND_PERCENT)
    # Percent (1-100) when `kind` is percent, else an amount in `currency`. One
    # column rather than two nullable ones: a coupon has exactly one value, and
    # two fields would let a row carry a contradiction.
    value = models.DecimalField(max_digits=12, decimal_places=2)
    # Only meaningful for a fixed-amount coupon, and it is what makes it refusable
    # against a cart in another currency - discounting 100 MXN off a USD order
    # would be inventing an exchange rate, which is exactly what checkout refuses
    # to do for a mixed-currency cart.
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="USD")

    # 0 means unlimited. A nullable column would say the same thing, but every
    # comparison would then need a None branch; this way the check is one `>`.
    max_redemptions = models.PositiveIntegerField(default=0)
    times_redeemed = models.PositiveIntegerField(default=0)

    # Both optional and both inclusive of the instant they name. Null `starts_at`
    # means "live now", null `expires_at` means "until the redemptions run out".
    starts_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    # A floor on the subtotal, in the coupon's own currency. Zero disables it.
    min_order_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
    )

    # ── The coupon's target ───────────────────────────────────────────────────
    # Blank `scope_kind` means the whole order, which is what every coupon
    # written before these columns existed is - so nothing moved when they
    # landed. Anything else names exactly one target, and the discount is then
    # computed off *only* the matching cart lines (`orders.services.coupons.
    # eligible_subtotal`); a basket containing none of them is refused outright
    # rather than quietly discounted in full.
    #
    # `scope_id` is a plain integer, not one of six nullable FKs, for the reason
    # `SocialPost.related_id` is: it can point at any of six models, and six
    # columns plus a check constraint to keep five of them null is a lot of
    # schema for one reference. The cost is no referential integrity - a deleted
    # product leaves a coupon pointing at nothing.
    #
    # ⚠ **That dangling state is the safe failure, and it must stay that way.**
    # A scope that resolves to nothing matches no cart line, so the coupon is
    # refused (`COUPON_NOT_APPLICABLE`) instead of falling back to an order-wide
    # discount - which is the one wrong answer here that costs the tenant money
    # on every basket. Never "repair" an unresolvable scope by ignoring it.
    scope_kind = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        blank=True,
        default=SCOPE_ORDER,
        help_text="What the discount applies to. Blank means the whole order.",
    )
    scope_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="The id of the targeted item or category, within `scope_kind`'s own table.",
    )

    # The tenant's off switch, matching every other content model. Separate from
    # the date window on purpose: pulling a live campaign should not require
    # rewriting the dates it is supposed to have run for.
    enabled = models.BooleanField(default=True)

    # A PNG of the coupon's public landing URL, written by
    # `orders.services.coupons.attach_coupon_qr` on create and re-written when
    # the code changes (the URL is derived from it). Blank if the write failed -
    # best-effort like the order QR, since a coupon with no PNG is still a
    # working coupon.
    qr_code = models.ImageField(
        upload_to=coupon_qr_upload_path, max_length=255, blank=True, null=True,
    )

    # The flyer the CMS renders for this coupon, from the code-defined template
    # registry in the frontend. Only the id is stored - adding a template is a
    # component plus a registry entry, never a migration. Same contract as
    # `SocialPost.template_id`.
    template_id = models.CharField(max_length=32, default="ticket")

    # ── Brand-logo badge ──────────────────────────────────────────────────────
    # A plate behind the tenant's logo on the flyer, in every template. Same
    # shape vocabulary and the same two-scale relationship as `SocialPost`'s own
    # trio (and the hero's `System.hero_logo_background*`), so a tenant tunes it
    # with the controls they already know and a flyer stays recognisably the
    # same brand as a social post. Defaults to "none" - no plate - so every
    # coupon written before these columns existed renders exactly as it did.
    #
    # These are stored while the flyer's *background image* deliberately is not:
    # a backdrop only decorates one exported JPG, but the logo lockup is part of
    # how the coupon looks every time it is re-downloaded - the same reason
    # `template_id` is a column.
    brand_logo_background = models.CharField(
        max_length=16,
        choices=System.HERO_LOGO_BACKGROUND_CHOICES,
        default=System.HERO_LOGO_BG_NONE,
        help_text="Shape of the plate behind the brand logo. 'None' draws the logo bare.",
    )
    # The drawn size of the plate (shape and logo together), as a whole percent
    # of the template's default logo height.
    brand_logo_background_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Logo-with-background size as a whole percent (30-100).",
    )
    # The drawn size of the logo inside the plate, as a whole percent of it;
    # below 100 the logo shrinks about the centre and a ring of plate shows.
    brand_logo_scale = models.PositiveSmallIntegerField(
        default=100,
        help_text="Logo size inside its background, as a whole percent (30-100).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Upper-cased so the tenant cannot create two coupons that a
            # case-insensitive redemption lookup would both match - whichever one
            # the query happened to return would silently own the redemptions.
            models.UniqueConstraint(
                Upper("code"), "system", name="coupon_code_unique_per_system",
            ),
            models.CheckConstraint(
                condition=models.Q(value__gt=0), name="coupon_value_positive",
            ),
            # The two scope columns are one value and must move together. A kind
            # with no id names a table and no row (it would match every line in
            # that family, discounting far more than intended); an id with no
            # kind names a number in no table at all. Both halves are enforced
            # in the serializer too - this is what stops a shell or a data
            # migration writing the contradiction.
            models.CheckConstraint(
                condition=(
                    models.Q(scope_kind="", scope_id__isnull=True)
                    | (~models.Q(scope_kind="") & models.Q(scope_id__isnull=False))
                ),
                name="coupon_scope_kind_and_id_together",
            ),
        ]
        indexes = [
            models.Index(fields=["system", "enabled"]),
        ]

    def __str__(self):
        worth = f"{self.value}%" if self.kind == self.KIND_PERCENT else f"{self.value} {self.currency}"
        return f"{self.code} ({worth})"

    @property
    def redemptions_left(self):
        """How many redemptions remain, or None when the coupon is unlimited."""
        if not self.max_redemptions:
            return None
        return max(0, self.max_redemptions - self.times_redeemed)

    @property
    def is_exhausted(self):
        return bool(self.max_redemptions) and self.times_redeemed >= self.max_redemptions

    @property
    def is_scoped(self):
        """Whether this coupon is aimed at one catalog target rather than the order."""
        return bool(self.scope_kind)

    @property
    def scope_family(self):
        """Which buyable family this coupon's scope selects, or None when order-wide.

        `"product"` / `"service"` / `"menu_item"` - the same three strings
        `CartItem.kind` and `OrderLine.kind` speak, so a caller can compare them
        directly instead of translating between two vocabularies.
        """
        return self.SCOPE_ITEM_KINDS.get(self.scope_kind) or self.SCOPE_CATEGORY_KINDS.get(
            self.scope_kind
        )

    @property
    def scopes_a_category(self):
        """Whether the target is a category (judged by the line's `category_id`)."""
        return self.scope_kind in self.SCOPE_CATEGORY_KINDS


def order_qr_upload_path(instance, filename):
    """Where an order's QR code image is stored.

    Tenant-prefixed like every other file (see `core.tenant_paths`), so it
    follows a customer to its own R2 account when it connects one, and named
    after the order's `public_id` - the same handle the code encodes - so a file
    in the bucket is traceable to its order with no database lookup.

    ⚠ **The `public_id` in the name is the order's only lock, exactly as it is in
    the URL.** The bucket is served by a Cloudflare custom domain with no notion
    of an ACL, so this file is public to anyone who can guess its path - which is
    no weaker than the link it encodes, since that link is in the customer's
    inbox and on the receipt they carry out of the shop. What must not happen is
    someone "tidying" this to a sequential id: that would put every other order's
    code one guess away from the last.
    """
    ext = os.path.splitext(filename)[1].lstrip(".") or "png"
    return tenant_path(instance.system_id, f"orders/qr/{instance.public_id}.{ext}")


class Order(models.Model):
    """A cart turned into a purchase, and the Stripe payment behind it.

    Created `pending` when checkout starts and moved to `paid` by the webhook -
    never by the browser coming back to the success URL, which is only a
    redirect the user can forge, replay, or never follow. The webhook is the
    single source of truth about money.

    `system` is the tenant, and it is what decides *which Stripe account* this
    order belongs to: each System connects its own, so an order can only ever be
    reconciled against the credentials of the System that created it.

    Unlike `CartItem`, everything price-shaped here is a **snapshot** (see
    `OrderLine`). A cart deliberately reflects today's catalog; an order must
    reflect what was actually charged, forever, even after the item is re-priced,
    renamed, or deleted.
    """

    STATUS_PENDING = "pending"
    STATUS_PLACED = "placed"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"
    STATUS_CANCELED = "canceled"
    STATUS_REFUNDED = "refunded"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        # An offline order (pay-in-store / pay-on-delivery) is born here rather
        # than `pending`: `pending` means "a Stripe session exists and we are
        # waiting on the webhook", which an offline order never has. Keeping them
        # apart is what stops an abandoned online checkout and a real placed
        # offline order from sharing a bucket in the tenant's order list.
        (STATUS_PLACED, "Placed"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELED, "Canceled"),
        (STATUS_REFUNDED, "Refunded"),
    ]

    # How the customer is paying. `online` is Stripe (the historical default and
    # what every existing row is). The two offline methods create the order
    # directly with no Stripe session and no webhook - which is why an offline
    # order clears the cart and draws down stock at checkout time, the work the
    # webhook does for an online one.
    PAYMENT_ONLINE = "online"
    PAYMENT_IN_STORE = "in_store"
    PAYMENT_ON_DELIVERY = "on_delivery"

    # The two counter methods, taken by a store associate on the POS screen
    # rather than by a customer on the site. They are **not** variants of
    # `in_store`, which is a promise to pay at pickup: these are sales that
    # happen at the counter with the customer standing there, so the order is
    # born and settled within a minute of itself.
    #
    # `terminal` is the tenant's own card reader. Nothing here talks to it yet -
    # the associate confirms the payment by hand - but the method is recorded
    # from day one so that wiring a provider (Mercado Pago Point and friends)
    # later is a matter of filling in a reference, not migrating every counter
    # sale out of a bucket it never belonged in.
    PAYMENT_TERMINAL = "terminal"
    PAYMENT_CASH = "cash"

    # Every counter sale, whatever it settles with. The POS may only create
    # orders in this set, and `AdminOrderActionSerializer.COMPLETE` may only be
    # applied to one - see `orders/views.py`.
    POS_METHODS = frozenset({PAYMENT_TERMINAL, PAYMENT_CASH})

    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_ONLINE, "Online (Stripe)"),
        (PAYMENT_IN_STORE, "Pay in store"),
        (PAYMENT_ON_DELIVERY, "Pay on delivery"),
        (PAYMENT_TERMINAL, "Card terminal (POS)"),
        (PAYMENT_CASH, "Cash (POS)"),
    ]

    # The order's public handle: what the confirmation URL, the order-history
    # links and the detail API path all address it by. The integer pk stays the
    # internal key (every OrderLine FK and the admin hang off it), but it never
    # leaves the database - a sequential id in a URL would leak how many orders
    # the tenant has taken and let anyone walk the neighbours' order numbers.
    # Generated the moment the row is created, so it exists for a `pending`
    # order too, unlike any Stripe id, which is only set once payment moves.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # A PNG of the order's public detail URL, written once at checkout by
    # `orders.services.qr.attach_order_qr`. It exists so a store admin can scan
    # the emailed or printed code at the counter and land straight on the order
    # to validate it; the customer's own copy of the same code is how they pull
    # their order up on their phone.
    #
    # Stored rather than regenerated per render because the payload is derived
    # only from `public_id` and the tenant's host, neither of which moves in an
    # order's lifetime - and a code printed on paper that later regenerated
    # differently would stop matching the receipt it is on. Blank on an order
    # placed before this landed, or one whose write failed; `backfill_order_qr`
    # fills those in.
    qr_code = models.ImageField(
        upload_to=order_qr_upload_path, max_length=255, blank=True, null=True,
    )

    system = models.ForeignKey(
        "core.System",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )
    # PROTECT, unlike Favorite/CartItem's CASCADE: deleting a user must not
    # silently erase the record of money they paid. Orders are financial history
    # and outlive the account.
    #
    # Nullable because checkout does not require an account. A guest order is a
    # real order with no owner: its only handle is `public_id` in the URL the
    # customer was redirected to, which is why that id is a random UUID rather
    # than anything guessable. It stops being ownerless if the customer later
    # verifies an account on the same email (`claim_guest_orders`).
    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="orders",
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    payment_method = models.CharField(
        max_length=16, choices=PAYMENT_METHOD_CHOICES, default=PAYMENT_ONLINE,
    )

    # Fulfillment is a **separate axis** from payment: a pay-on-delivery order is
    # handed over (fulfilled) at the same moment it is paid, but a pay-in-store
    # order may be picked up (fulfilled) before or after the money is recorded,
    # and an online order is paid long before it ships. So the tenant marks
    # "paid" (which moves `status`) and "fulfilled" (this flag) independently.
    fulfilled = models.BooleanField(default=False)
    fulfilled_at = models.DateTimeField(null=True, blank=True)

    # One currency per order by construction: a Stripe Checkout Session is
    # single-currency, and Buyable.currency is per item, so checkout refuses a
    # mixed-currency cart rather than inventing a conversion.
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="USD")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # The coupon this order was placed with, if any. SET_NULL for the same reason
    # OrderLine's catalog FKs are: deleting a finished campaign must not erase the
    # record that its discount was given, and the order still reads back in full
    # without it - which is what `coupon_code` and `discount_amount` are for.
    coupon = models.ForeignKey(
        "orders.Coupon",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )
    # Snapshotted at checkout, exactly like `OrderLine.name` and `unit_price`: what
    # the customer typed and was honoured, frozen. Re-reading it through the FK
    # would rewrite history the first time a tenant renamed a code, and would show
    # nothing at all once the coupon was deleted.
    coupon_code = models.CharField(max_length=64, blank=True, default="")
    # What the coupon actually took off, in the order's own currency - never the
    # coupon's percentage. A percent re-applied to today's subtotal would drift
    # from what was charged, and this is the number that has to reconcile against
    # Stripe forever.
    discount_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
    )

    # Stripe's ids. `stripe_session_id` is unique so a replayed webhook cannot
    # produce a second paid order, and it is how the confirmation page proves the
    # session it was redirected with belongs to this order.
    stripe_session_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, default="")

    # Captured by Stripe Checkout and copied here by the webhook - our own
    # record, so it stays correct if the customer later edits their profile.
    email = models.EmailField(blank=True, default="")
    # Collected by our own checkout form for offline orders (an online order gets
    # its contact from Stripe's page instead), so the tenant can reach the
    # customer about a pickup or a delivery. Blank on historical online orders.
    phone = models.CharField(max_length=32, blank=True, default="")
    shipping_name = models.CharField(max_length=255, blank=True, default="")
    shipping_line1 = models.CharField(max_length=255, blank=True, default="")
    shipping_line2 = models.CharField(max_length=255, blank=True, default="")
    shipping_city = models.CharField(max_length=128, blank=True, default="")
    shipping_state = models.CharField(max_length=128, blank=True, default="")
    shipping_postal_code = models.CharField(max_length=32, blank=True, default="")
    shipping_country = models.CharField(max_length=2, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["system", "status"]),
            # Claiming looks up unowned orders by the email Stripe captured, on
            # every email verification and login. Without this it is a table scan
            # of every order the tenant has ever taken.
            models.Index(fields=["email", "user"]),
        ]

    def __str__(self):
        who = self.user.email if self.user_id else f"guest <{self.email or 'no email'}>"
        return f"Order #{self.pk} ({self.status}) for {who}"

    @property
    def item_count(self):
        """Total quantity, matching how the cart counts - not the number of lines."""
        return sum(line.quantity for line in self.lines.all())


class OrderLine(models.Model):
    """One purchased item, frozen at the moment of checkout.

    Every displayable fact is copied here rather than read through the FKs:
    `name` and `unit_price` are what the customer saw and agreed to pay, and
    re-deriving them from the catalog later would rewrite history the first time
    a price changes. The FKs are kept only as provenance - which is why they are
    SET_NULL: deleting a product must not delete the record that it was once
    sold, and the line still renders in full without it.
    """

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")

    product = models.ForeignKey(
        "catalog.Product", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    service = models.ForeignKey(
        "catalog.Service", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    menu_item = models.ForeignKey(
        "catalog.MenuItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_lines",
    )
    # `kind` is stored rather than derived from which FK is set, because all may
    # be NULL once the catalog item is gone - and a line that can no longer say
    # whether it sold a product, a service, or a menu item is not much of a record.
    kind = models.CharField(
        max_length=9,
        choices=[("product", "Product"), ("service", "Service"), ("menu_item", "Menu Item")],
    )
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=128, blank=True, default="")
    # The chosen size, snapshotted like every other displayable fact on this
    # row - not read back through a FK. A tenant renames "Grande" or retires it
    # entirely; the receipt must keep saying what was sold. Blank for products,
    # services, and dishes sold in one size. `size_price_delta` is already folded
    # into `unit_price`; it is kept so the line can be read back as
    # "Pizza 200.00 + Grande 40.00" rather than as one number that does not
    # reconcile against the catalog.
    size_name = models.CharField(max_length=255, blank=True, default="")
    size_en_name = models.CharField(max_length=255, blank=True, default="")
    size_price_delta = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
    )
    # A menu line's chosen customisation, snapshotted as a human-readable list of
    # {"name", "quantity", "unit_price", "line_upcharge", "removed"} at checkout,
    # so the order still reads back in full after the ingredient rows are gone.
    # Empty for products, services, and uncustomised menu items.
    customization = models.JSONField(default=list, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="USD")

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="order_line_quantity_positive",
            ),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.name} (order #{self.order_id})"

    @property
    def target(self):
        """The catalog row this line sold, or None once it has been deleted.

        Mirrors `users.CartItem.target` so both can be handed to
        `orders.services.coupons.eligible_subtotal` - a cart and a written order
        must price a scoped coupon identically, and one function over one
        interface is what guarantees that.

        ⚠ **Nullable here in a way a cart line's never is.** These FKs are
        SET_NULL provenance, so a line whose product was deleted still reads back
        in full but can no longer say which product it was. A coupon scoped to
        that product simply stops matching the line - the safe direction, and the
        same one an unresolvable `scope_id` already fails in.
        """
        return self.product or self.service or self.menu_item


class Booking(models.Model):
    """The appointment behind an Order that sold a bookable Service.

    **A booking is not a parallel kind of purchase.** It hangs off a perfectly
    ordinary Order carrying one service line, which is what lets it inherit the
    whole existing machine for free: Stripe sessions and the signed webhook,
    guest orders addressed by `public_id`, `claim_guest_orders`, the confirmation
    emails, `/orders` history and `/orders/<public_id>`. A standalone booking
    aggregate would have needed a second implementation of every one of those,
    and the second one is the one that goes wrong.

    So `status` here is about the *appointment*, never about the money - that
    stays on `Order.status`, where the webhook writes it. A booking can be
    `confirmed` on an order that is still `pending` (an in-person-payment
    booking is never paid online at all), and marking a booking `completed` says
    the work was done, not that it was paid for. Keeping the two axes apart is
    the same split `Order.fulfilled` already makes against `Order.status`.

    Everything a booking needs to *read back* is snapshotted (`branch_name`,
    `timezone`, `duration_minutes`, the amounts), for exactly the reason
    `OrderLine` snapshots its price: the branch may be renamed, moved to another
    timezone or deleted, and an appointment record that then re-renders at a
    different hour is worse than useless.
    """

    FULFILLMENT_BRANCH = "branch"
    FULFILLMENT_ON_PREMISES = "on_premises"
    FULFILLMENT_CHOICES = [
        (FULFILLMENT_BRANCH, "At the business location"),
        (FULFILLMENT_ON_PREMISES, "At the customer's address"),
    ]

    # `pending` is a booking the tenant has not looked at yet - including one
    # whose online payment is still in flight. The webhook does not touch this
    # field; the tenant confirms from the CMS.
    STATUS_PENDING = "pending"
    STATUS_CONFIRMED = "confirmed"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELED = "canceled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELED, "Canceled"),
    ]

    # The statuses that still occupy their slot. A canceled booking must free the
    # time immediately - it is the only way a customer who cancels gives the hour
    # back - and a completed one is in the past, so neither can block a new
    # booking. `orders.services.booking` counts against exactly this set.
    ACTIVE_STATUSES = (STATUS_PENDING, STATUS_CONFIRMED)

    PAYMENT_FULL = "full"
    PAYMENT_DEPOSIT = "deposit"
    PAYMENT_IN_PERSON = "in_person"
    PAYMENT_OPTION_CHOICES = [
        (PAYMENT_FULL, "Paid in full on booking"),
        (PAYMENT_DEPOSIT, "Deposit on booking"),
        (PAYMENT_IN_PERSON, "Paid in person"),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="booking")

    # Provenance, like OrderLine's FKs - SET_NULL, because deleting a service
    # must not delete the record that it was booked. Everything displayable is
    # snapshotted here or on the order line.
    service = models.ForeignKey(
        "catalog.Service", null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings",
    )
    branch = models.ForeignKey(
        "core.Branch", null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings",
    )
    # Null branch is two different things, told apart by `fulfillment`: an
    # on-premises booking never had one, and a branch booking whose location was
    # deleted still reads back through `branch_name`.
    branch_name = models.CharField(max_length=255, blank=True, default="")

    fulfillment = models.CharField(
        max_length=16, choices=FULFILLMENT_CHOICES, default=FULFILLMENT_BRANCH,
    )
    # Where the customer wants the work done. Only ever set for an on-premises
    # booking; a branch booking's address is the branch's own.
    address = models.TextField(blank=True, default="")

    # Stored in UTC like every other datetime here. `timezone` is the branch's
    # IANA name at the time of booking and is what these must be rendered back
    # in - not the reader's browser zone, which would show a customer in Madrid a
    # Mexico City appointment at the wrong hour and call it 09:00 either way.
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    timezone = models.CharField(max_length=64, default="UTC")
    duration_minutes = models.PositiveIntegerField(default=0)

    # How many people this one booking covers. **This is the unit capacity is
    # counted in** - a party of four consumes four seats of the resource it is
    # assigned to, and the order line's quantity is the same number, which is
    # what makes the price multiply.
    #
    # `default=1` is what makes the migration a no-op in meaning as well as in
    # schema: summing `party_size` over rows written before this field existed
    # reproduces the old "count the bookings" number exactly.
    party_size = models.PositiveSmallIntegerField(default=1)

    # Which boat / guide / room this party was put on. Null is the ordinary case
    # for a tenant with no resource pools - the branch is then one implicit
    # resource and there is nothing to name. SET_NULL for the same reason
    # `service` and `branch` are: deleting a boat must not delete the record that
    # someone booked it.
    resource = models.ForeignKey(
        "core.BookingResource", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="bookings",
    )
    # Snapshot, exactly like `branch_name`: the boat may be renamed or retired,
    # and an appointment record that then reads back as blank is worse than one
    # that reads back as what was agreed.
    resource_name = models.CharField(max_length=255, blank=True, default="")

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)

    payment_option = models.CharField(
        max_length=16, choices=PAYMENT_OPTION_CHOICES, default=PAYMENT_IN_PERSON,
    )
    # 0 for anything but a deposit booking. Snapshotted because the tenant may
    # change the service's percentage tomorrow, and this one was agreed today.
    deposit_percent = models.PositiveSmallIntegerField(default=0)
    # `amount_due_now` is what Stripe was asked to charge (0 for pay-in-person),
    # `amount_due_later` the remainder the customer settles with the tenant.
    # Both are derived at checkout and never recomputed: `order.total` is the
    # full price of the service, and the split between the two is the agreement.
    amount_due_now = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    amount_due_later = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # What the customer typed in the "booking details" box - allergies, gate
    # codes, "the dog is friendly". Free text, shown to the tenant verbatim.
    notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at"]
        indexes = [
            # The availability query: overlapping active bookings at one branch.
            models.Index(fields=["branch", "starts_at"]),
            # The same query once pools exist: occupancy is summed per resource,
            # so the seat arithmetic reads rows by the resource they sit on.
            models.Index(fields=["resource", "starts_at"]),
            # The CMS list: a tenant's upcoming bookings, soonest first.
            models.Index(fields=["status", "starts_at"]),
        ]

    def __str__(self):
        return f"Booking {self.starts_at:%Y-%m-%d %H:%M} ({self.status}) for order #{self.order_id}"

    @property
    def tzinfo(self):
        """The zone this booking's times mean, falling back to UTC.

        Read off the snapshot, not off `self.branch`: the branch may since have
        moved zones, and re-rendering a past appointment an hour out because of
        that would be rewriting history.
        """
        try:
            return ZoneInfo(self.timezone or "UTC")
        except (ZoneInfoNotFoundError, ValueError):
            return ZoneInfo("UTC")

    @property
    def local_starts_at(self):
        return self.starts_at.astimezone(self.tzinfo)
