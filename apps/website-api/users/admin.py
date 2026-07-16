from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import (
    CartItem,
    EmailVerificationToken,
    Favorite,
    PasskeyCredential,
    PasswordResetToken,
    UserProfile,
)
from .cache import invalidate_cart, invalidate_favorites


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = "Profile"
    fields = ("system", "is_admin", "profile_picture")


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "system", "is_admin", "profile_picture")
    list_filter = ("system", "is_admin")
    search_fields = ("user__username", "user__email")
    raw_id_fields = ("user",)


@admin.register(EmailVerificationToken)
class EmailVerificationTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "token", "created_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("token", "created_at")


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "token", "created_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("token", "created_at")


@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ("user", "system", "name", "created_at")
    list_filter = ("system",)
    search_fields = ("user__username", "user__email", "name")
    readonly_fields = ("credential_id", "public_key", "sign_count", "transports", "created_at")
    raw_id_fields = ("user",)


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "target", "system", "created_at")
    list_filter = ("system", "created_at")
    search_fields = ("user__username", "user__email", "product__name", "service__name")
    raw_id_fields = ("user", "product", "service")
    readonly_fields = ("created_at",)

    @admin.display(description="Kind")
    def kind(self, obj):
        return obj.kind

    @admin.display(description="Item")
    def target(self, obj):
        return obj.target

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        invalidate_favorites(obj.user_id, obj.system_id or 0)

    def delete_model(self, request, obj):
        invalidate_favorites(obj.user_id, obj.system_id or 0)
        super().delete_model(request, obj)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "target", "variant", "quantity", "system", "updated_at")
    list_filter = ("system", "created_at")
    search_fields = ("user__username", "user__email", "product__name", "service__name")
    raw_id_fields = ("user", "product", "service", "product_variant", "service_variant")
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Kind")
    def kind(self, obj):
        return obj.kind

    @admin.display(description="Item")
    def target(self, obj):
        return obj.target

    @admin.display(description="Variant")
    def variant(self, obj):
        return obj.variant

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        invalidate_cart(obj.user_id, obj.system_id or 0)

    def delete_model(self, request, obj):
        invalidate_cart(obj.user_id, obj.system_id or 0)
        super().delete_model(request, obj)
