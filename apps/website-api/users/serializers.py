from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.models import System
from core.serializers import ImageProcessingSerializer


def _get_system(system_id):
    try:
        return System.objects.get(pk=system_id, enabled=True)
    except System.DoesNotExist:
        return None


def build_username(system_id, email):
    # NOTE: Django's username field is max_length=150. Combined length of
    # system_id + '_' + email must not exceed 150 characters.
    return f"{system_id}_{email}"


def run_password_validators(password, user, field="password"):
    """
    Run AUTH_PASSWORD_VALIDATORS against `password` and re-raise any failure as a
    DRF field error.

    `user` must be supplied: UserAttributeSimilarityValidator short-circuits when
    it is None, which is exactly what happens when `validate_password` is used as
    a DRF field validator (DRF calls validators with the value alone). Passing the
    user here is what makes that validator actually run.
    """
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({field: list(exc.messages)})


class SignUpSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    password2 = serializers.CharField(write_only=True, required=True, label="Confirm password")
    system_id = serializers.IntegerField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ("system_id", "email", "password", "password2", "first_name", "last_name")
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
            "email": {"required": True},
        }

    def validate_system_id(self, value):
        system = _get_system(value)
        if system is None:
            raise serializers.ValidationError("Invalid or disabled system.")
        self._system = system
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        system_id = attrs.get("system_id")
        email = attrs.get("email")
        if system_id and email:
            username = build_username(system_id, email)
            if len(username) > 150:
                raise serializers.ValidationError(
                    {"email": "Email address is too long for this system."}
                )
            if User.objects.filter(username=username).exists():
                raise serializers.ValidationError(
                    {"email": "A user with this email already exists for this system."}
                )
            attrs["username"] = username
        # The account does not exist yet, so hand the validators the unsaved user
        # this signup would create - otherwise the password may equal the email.
        prospective_user = User(
            username=attrs.get("username", ""),
            email=email or "",
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        run_password_validators(attrs["password"], prospective_user)
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2")
        validated_data.pop("system_id")
        system = self._system
        user = User.objects.create_user(**validated_data)
        user.is_active = False
        user.save(update_fields=["is_active"])
        user.profile.system = system
        user.profile.save(update_fields=["system"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    system_id = serializers.IntegerField()

    def validate_system_id(self, value):
        if not System.objects.filter(pk=value, enabled=True).exists():
            raise serializers.ValidationError("Invalid or disabled system.")
        return value

    def validate(self, attrs):
        system_id = attrs.get("system_id")
        email = attrs.get("email")
        self._user = None
        if system_id and email:
            username = build_username(system_id, email)
            try:
                self._user = User.objects.get(username=username, is_active=True)
            except User.DoesNotExist:
                self._user = None
        return attrs

    def get_user(self):
        return self._user


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    new_password = serializers.CharField(write_only=True)
    new_password2 = serializers.CharField(write_only=True, label="Confirm new password")

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password": "Passwords do not match."})
        return attrs


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    system_id = serializers.IntegerField()

    def validate_system_id(self, value):
        if not System.objects.filter(pk=value, enabled=True).exists():
            raise serializers.ValidationError("Invalid or disabled system.")
        return value

    def validate(self, attrs):
        system_id = attrs.get("system_id")
        email = attrs.get("email")
        if system_id and email:
            username = build_username(system_id, email)
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                raise serializers.ValidationError({"email": "__not_found__"})
            if user.is_active:
                raise serializers.ValidationError({"email": "This account is already verified."})
            self._user = user
        return attrs

    def get_user(self):
        return self._user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop("username", None)
        self.fields["email"] = serializers.EmailField(required=True)
        self.fields["system_id"] = serializers.IntegerField(required=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["username"] = user.username
        token["email"] = user.email
        # Identity claims let the Next.js server derive the session straight from
        # the cookie it already holds, so a page renders logged-in on first paint
        # instead of flashing logged-out while the browser fetches the profile.
        # SimpleJWT copies these onto the refreshed access token, and the passkey
        # views mint through this same method, so every token carries them.
        token["first_name"] = user.first_name
        token["last_name"] = user.last_name
        try:
            token["is_admin"] = user.profile.is_admin
        except Exception:
            token["is_admin"] = False
        try:
            token["system_id"] = user.profile.system_id
        except Exception:
            token["system_id"] = None
        return token

    def validate(self, attrs):
        system_id = attrs.pop("system_id")
        email = attrs.pop("email")
        attrs["username"] = build_username(system_id, email)
        return super().validate(attrs)


class ProfilePictureSerializer(ImageProcessingSerializer):
    """Accepts a base64-encoded image, resizes it to max 512x512 at 90% JPEG quality."""

    def save(self, user):
        profile = user.profile
        self.save_to_field(profile.profile_picture, f"profile_{user.id}.jpg")
        profile.save(update_fields=["profile_picture"])
        return profile


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Writable serializer for updating email, first_name, and last_name.
    Username is system-managed ({system_id}_{email}) and updated automatically on email change.
    """

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name")
        extra_kwargs = {
            "email": {"required": False},
        }

    def validate_email(self, value):
        user = self.instance
        try:
            system = user.profile.system
        except Exception:
            system = None

        if system is not None:
            new_username = build_username(system.id, value)
        else:
            new_username = value

        if len(new_username) > 150:
            raise serializers.ValidationError("Email address is too long for this system.")
        if User.objects.exclude(pk=user.pk).filter(username=new_username).exists():
            raise serializers.ValidationError("This email is already in use for this system.")
        self._new_username = new_username
        return value

    def update(self, instance, validated_data):
        if "email" in validated_data:
            instance.username = self._new_username
        return super().update(instance, validated_data)


class AdminUserSerializer(serializers.ModelSerializer):
    """Read-only serializer for admin user management."""

    profile_picture = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    system_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "is_active", "date_joined", "profile_picture", "is_admin", "system_id")

    def get_profile_picture(self, obj):
        request = self.context.get("request")
        try:
            picture = obj.profile.profile_picture
            if picture and request:
                return request.build_absolute_uri(picture.url)
            if picture:
                return picture.url
        except Exception:
            pass
        return None

    def get_is_admin(self, obj):
        try:
            return obj.profile.is_admin
        except Exception:
            return False

    def get_system_id(self, obj):
        try:
            return obj.profile.system_id
        except Exception:
            return None


class AdminUserUpdateSerializer(serializers.Serializer):
    """Writable serializer for toggling is_admin and is_active."""

    is_admin = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def save(self, user):
        if "is_active" in self.validated_data:
            user.is_active = self.validated_data["is_active"]
            user.save(update_fields=["is_active"])
        if "is_admin" in self.validated_data:
            try:
                user.profile.is_admin = self.validated_data["is_admin"]
                user.profile.save(update_fields=["is_admin"])
            except Exception:
                pass
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Read-only serializer that returns user data plus the profile picture URL."""

    profile_picture = serializers.SerializerMethodField()
    system_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "profile_picture", "system_id")

    def get_profile_picture(self, obj):
        request = self.context.get("request")
        try:
            picture = obj.profile.profile_picture
            if picture and request:
                return request.build_absolute_uri(picture.url)
            if picture:
                return picture.url
        except Exception:
            pass
        return None

    def get_system_id(self, obj):
        try:
            return obj.profile.system_id
        except Exception:
            return None


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password2 = serializers.CharField(write_only=True, label="Confirm new password")

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password": "Passwords do not match."})
        return attrs


# ── Passkey (WebAuthn) serializers ────────────────────────────────────────────


class PasskeyRegistrationVerifySerializer(serializers.Serializer):
    credential = serializers.JSONField()
    challenge_id = serializers.CharField()
    name = serializers.CharField(max_length=64, required=False, default="My passkey")


class PasskeyAuthenticationOptionsSerializer(serializers.Serializer):
    email = serializers.EmailField()
    system_id = serializers.IntegerField()


class PasskeyAuthenticationVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    system_id = serializers.IntegerField()
    credential = serializers.JSONField()
    challenge_id = serializers.CharField()


# ── Favorites ─────────────────────────────────────────────────────────────────


class FavoriteSerializer(serializers.Serializer):
    """A saved item, flattened to the shape the favorites grid renders.

    `item` carries the full catalog payload so the frontend can reuse the same
    card it uses everywhere else, and `kind` tells it which of the two it got.
    """

    id = serializers.IntegerField(read_only=True)
    kind = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    item = serializers.SerializerMethodField()

    def get_item(self, obj):
        # Imported here: catalog.serializers imports from core, and a module-level
        # import would make users ↔ catalog a cycle at app-load time.
        from catalog.serializers import ProductSerializer, ServiceSerializer, MenuItemSerializer

        serializer = {
            'product': ProductSerializer,
            'service': ServiceSerializer,
            'menu_item': MenuItemSerializer,
        }[obj.kind]
        return serializer(obj.target, context=self.context).data


class FavoriteWriteSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["product", "service", "menu_item"])
    id = serializers.IntegerField()


# ── Cart ──────────────────────────────────────────────────────────────────────


class CartItemSerializer(serializers.Serializer):
    """A cart line, flattened for the cart page.

    Mirrors `FavoriteSerializer` - `item` carries the full catalog payload so the
    frontend reuses its existing card - and adds what a line needs on top: the
    chosen variant, the quantity, and the prices resolved for that variant.

    Prices are strings, matching how DRF renders every other DecimalField in this
    API; the frontend already parses catalog prices the same way.
    """

    id = serializers.IntegerField(read_only=True)
    kind = serializers.CharField(read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    item = serializers.SerializerMethodField()
    variant = serializers.SerializerMethodField()
    customization = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    def get_item(self, obj):
        # Imported here for the same reason as FavoriteSerializer.get_item: a
        # module-level import would make users ↔ catalog a cycle at app-load.
        from catalog.serializers import ProductSerializer, ServiceSerializer, MenuItemSerializer

        serializer = {
            'product': ProductSerializer,
            'service': ServiceSerializer,
            'menu_item': MenuItemSerializer,
        }[obj.kind]
        return serializer(obj.target, context=self.context).data

    def get_variant(self, obj):
        from catalog.serializers import ProductVariantSerializer, ServiceVariantSerializer

        variant = obj.variant
        if variant is None:
            return None
        serializer = ProductVariantSerializer if obj.product_id else ServiceVariantSerializer
        return serializer(variant, context=self.context).data

    def get_customization(self, obj):
        """The chosen ingredients for a menu line, resolved to labels + up-charges
        the cart page can render directly. Empty for products, services, and
        uncustomised menu items."""
        if not obj.menu_item_id or not obj.customization:
            return []
        by_id = {ing.id: ing for ing in obj.menu_item.ingredients.all()}
        rows = []
        for row in obj.customization:
            ingredient = by_id.get(row.get('ingredient'))
            if ingredient is None:
                continue
            qty = int(row.get('quantity', 0))
            rows.append({
                'ingredient': ingredient.id,
                'name': ingredient.name,
                'en_name': ingredient.en_name,
                'quantity': qty,
                'unit_price': str(ingredient.price),
                'line_upcharge': str(ingredient.upcharge_for_quantity(qty)),
                'removed': ingredient.is_default and qty == 0,
            })
        return rows

    def get_unit_price(self, obj):
        return str(obj.unit_price)

    def get_line_total(self, obj):
        return str(obj.line_total)

    def get_currency(self, obj):
        return obj.target.currency

    def get_in_stock(self, obj):
        """Services are always orderable; a menu item follows its availability
        flag; only products carry stock.

        Reported per line so the cart can flag an item that sold out after it was
        added - the variant's own flag wins when the line has one.
        """
        if obj.service_id:
            return True
        if obj.menu_item_id:
            return obj.menu_item.is_available
        if obj.product_variant_id:
            return obj.product_variant.in_stock
        return obj.product.in_stock


class CartCustomizationRowSerializer(serializers.Serializer):
    """One chosen ingredient in an add-to-cart request."""

    ingredient = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=0, max_value=99)


class CartItemWriteSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["product", "service", "menu_item"])
    id = serializers.IntegerField()
    variant_id = serializers.IntegerField(required=False, allow_null=True)
    # Menu items only: the chosen ingredient selection. Ignored for product/service.
    customization = CartCustomizationRowSerializer(many=True, required=False)
    quantity = serializers.IntegerField(required=False, min_value=1, max_value=99, default=1)


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=99)
