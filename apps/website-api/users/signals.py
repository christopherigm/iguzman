from django.contrib.auth.models import User
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .cache import invalidate_cart, invalidate_favorites
from .models import CartItem, Favorite, UserProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, "profile"):
        instance.profile.save()


@receiver(post_delete, sender=CartItem)
def invalidate_cart_on_item_delete(sender, instance, **kwargs):
    """Clear the owner's cached cart when any cart line is deleted.

    The cart's payload/count/ids are cached per (user, system) and the navbar
    reads the count on every page. Direct cart mutations invalidate it in the
    view, but a line can also vanish underneath the user when the catalog item it
    points to is deleted (the FKs are CASCADE): the row goes but the cache would
    keep serving a stale "cart (2)" until its TTL. Firing on post_delete catches
    every path - cascade from a catalog delete, direct removal, or account
    deletion alike. Connecting this receiver also stops Django fast-deleting
    CartItem rows, so the signal reliably fires per row during a cascade.
    """
    invalidate_cart(instance.user_id, instance.system_id or 0)


@receiver(post_delete, sender=Favorite)
def invalidate_favorites_on_delete(sender, instance, **kwargs):
    """Clear the owner's cached favorites when any favorite row is deleted.

    Same reasoning as the cart above: the favorites list and the favorites-ids
    the catalog cards read are cached per (user, system), and a favorite's
    product/service FK is CASCADE - so deleting a catalog item removes the row
    underneath the user without the catalog delete path knowing to invalidate.
    post_delete covers cascade, direct un-favoriting, and account deletion alike.
    """
    invalidate_favorites(instance.user_id, instance.system_id or 0)
