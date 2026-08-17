"""Transactional order emails to the **customer**.

The counterpart to ``core/services/contact.py``, which emails a tenant's admins:
this emails the person who placed the order - the confirmation the moment the
order becomes real, and a fresh copy every time its status moves afterward.

Two things make this work for guest checkout as much as for a signed-in one:
the recipient is ``order.email`` (the address Stripe captured, or the one the
offline / POS form collected - never an account is required), and the link is
the order's ``public_id`` on the tenant's own domain, which is the only handle a
guest order ever has.

Branding is reused from ``contact._tenant_brand`` so an order email looks like
every other transactional email the platform sends, and ``reply_to`` is the
tenant's admins so a customer's reply about their order reaches the store rather
than the platform mailbox.

**Best-effort by construction.** Every send is wrapped so a mail failure can
never bubble into the caller: an order must not fail to be placed, and - far
worse - the Stripe webhook must not return non-2xx and be retried, because a
missing confirmation email is a nuisance while a re-run payment handler is a
correctness problem. A failure is logged and swallowed; the order stands.
"""

import logging
from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from core.media import absolute_media_url
from core.services.contact import _admin_emails, _tenant_brand

from ..models import Booking
from ..serializers import resolve_line_image
from .qr import order_qr_bytes

logger = logging.getLogger(__name__)

# The Content-ID the QR image is attached under, referenced as `cid:order-qr` in
# the HTML part. **Embedded, not linked**, unlike the logo and the product
# thumbnails in the same email: most clients block remote images by default, and
# a blocked QR is a blank box - which for the one thing the recipient may have to
# hold up at a counter is worse than showing no code at all.
_QR_CID = "order-qr"


# The three flavors of order email, distinguished only by their headline and
# lead sentence - the receipt body underneath is identical.
#  - CONFIRMATION: the order was just placed (or, for an online order, first paid).
#  - STATUS:       its payment status moved afterward (paid, canceled, …).
#  - FULFILLED:    it was handed over - ready for pickup, or on its way.
CONFIRMATION = "confirmation"
STATUS = "status"
FULFILLED = "fulfilled"


# Bilingual status labels, so the es and en halves of the email each read the
# status in their own language. Mirrors `Order.STATUS_CHOICES`.
_STATUS_LABELS = {
    "pending": ("Pendiente", "Pending"),
    "placed": ("Recibido", "Received"),
    "paid": ("Pagado", "Paid"),
    "failed": ("Fallido", "Failed"),
    "canceled": ("Cancelado", "Canceled"),
    "refunded": ("Reembolsado", "Refunded"),
}

# Symbol per currency in `CURRENCY_CHOICES`. The code is always appended too, so
# the amount is unambiguous even where several currencies share the `$` glyph.
_CURRENCY_SYMBOLS = {
    "USD": "$", "EUR": "€", "MXN": "$", "GBP": "£", "CAD": "$",
    "ARS": "$", "COP": "$", "CLP": "$", "BRL": "R$",
}


def _money(amount, currency):
    symbol = _CURRENCY_SYMBOLS.get(currency)
    if symbol:
        return f"{symbol}{amount:,.2f} {currency}"
    return f"{amount:,.2f} {currency}"


def _line_image(line):
    """Absolute image URL for one order line, or None.

    `resolve_line_image` without a request returns whatever the storage backend
    gives: a relative media path on the local filesystem, an absolute CDN URL on
    R2. An email client has no request to resolve the first against, so it is
    made absolute exactly as the branded logo is.
    """
    return absolute_media_url(resolve_line_image(line)) or None


def _booking_location(order):
    """The map block for an order that is an appointment at a location, or None.

    Three things have to line up before an email shows a map, and each absence
    is ordinary rather than an error:

    * the order is a **booking** - a shipped product has a delivery address, not
      a place the customer travels to;
    * that booking is fulfilled **at the branch**. An `on_premises` booking is
      still scheduled against a branch's calendar (the staff going out are the
      staff who would be in the shop), so it *has* a branch - but the venue is
      the customer's own address, and a map of the shop on the very message
      confirming someone will come to them points at the wrong place; and
    * the branch was **pinned**. Coordinates are optional on a Branch, and the
      picture is optional even with them (`Branch.map_image` is rendered by the
      CMS's map picker, so a location saved before anyone opened it has none).

    The picture and the directions link are therefore independent: a pinned
    location with no screenshot still gets its "Directions" button, which is the
    half that actually does something.
    """
    booking = getattr(order, "booking", None)
    if booking is None or booking.fulfillment != Booking.FULFILLMENT_BRANCH:
        return None
    branch = booking.branch
    if branch is None or branch.latitude is None or branch.longitude is None:
        return None

    return {
        "name": booking.branch_name or branch.name or "",
        "address": (branch.address or "").strip(),
        # The "once you are there" half of the location - the landmark, the
        # gate, the floor. Read live off the Branch rather than snapshotted onto
        # the Booking (as `branch_name` is): a correction to how the entrance is
        # described is a correction the *next* email should carry, and unlike a
        # price it is not part of what was agreed.
        "location_details": (branch.location_details or "").strip(),
        # Absolute, exactly as the product thumbnails and the tenant logo in the
        # same message are - a mail client has no request to resolve a media
        # path against. Remote rather than a `cid:` attachment (which is what the
        # QR gets): a blocked map costs the reader nothing, because the button
        # under it is a plain link that always renders, while a blocked QR is the
        # one thing they may have to hold up at a counter.
        "map_image": absolute_media_url(branch.map_image) or None,
        # Google Maps' universal directions URL, the same one the contact page's
        # "Get directions" button builds. Coordinates rather than the address, so
        # it lands on the pin the tenant actually placed rather than on whatever
        # a geocoder makes of a free-text address.
        "directions_url": (
            "https://www.google.com/maps/dir/?api=1"
            f"&destination={branch.latitude},{branch.longitude}"
        ),
    }


def _order_items(order):
    """The order's lines as plain dicts ready for the template.

    Amounts are pre-formatted (Django templates have no money filter) and the
    frozen `customization` is unpacked into a simple add-on list the template
    renders without knowing its shape.
    """
    items = []
    for line in order.lines.all():
        addons = [
            {
                "name": c.get("name") or "",
                "quantity": int(c.get("quantity") or 0),
                "removed": bool(c.get("removed")),
            }
            for c in (line.customization or [])
        ]
        items.append({
            "name": line.name,
            # The size the dish was sold in, from the line's own snapshot - a
            # receipt for a large pizza has to keep saying "large" after the
            # tenant renames or retires that size.
            "size": line.size_name,
            "quantity": line.quantity,
            "image": _line_image(line),
            "unit_price": _money(line.unit_price, line.currency),
            "line_total": _money(line.line_total, line.currency),
            "addons": addons,
        })
    return items


def send_order_email(order, *, kind):
    """Email the customer about `order`. `kind` is CONFIRMATION, STATUS or FULFILLED.

    All three carry the same receipt; they differ only in the headline and lead
    sentence (placement vs. a status move vs. being handed over). A FULFILLED
    email reads "on its way" for an order with a delivery address and "ready for
    pickup" for one without - the two ways an order is handed over.

    A no-op with nothing sent when the order has no email (an anonymous online
    checkout that was abandoned before Stripe collected one, or a counter sale
    rung up without a receipt address). Never raises: see the module docstring.
    """
    email = (order.email or "").strip()
    if not email:
        return

    try:
        system = order.system
        brand = _tenant_brand(system)
        status_es, status_en = _STATUS_LABELS.get(
            order.status, (order.status, order.status),
        )
        order_ref = str(order.public_id)[:8].upper()
        # A delivery order (online or pay-on-delivery) carries an address; a
        # pickup / counter order does not. It decides the "on its way" vs "ready
        # for pickup" wording of a fulfillment email.
        is_delivery = bool((order.shipping_line1 or "").strip())

        # Read once, up front: it decides both whether the template renders the
        # QR block and whether there is an attachment to hang it on. None on an
        # order that predates the field or whose write failed, and the email then
        # simply goes out without a code.
        qr_png = order_qr_bytes(order)

        ctx = {
            "order_ref": order_ref,
            "kind": kind,
            "is_delivery": is_delivery,
            "status": order.status,
            "status_label_es": status_es,
            "status_label_en": status_en,
            "created_at": order.created_at,
            "customer_name": (order.shipping_name or "").strip(),
            "items": _order_items(order),
            "item_count": order.item_count,
            "subtotal_display": _money(order.subtotal, order.currency),
            "total_display": _money(order.total, order.currency),
            # The order detail page on the tenant's own domain. Unprefixed by
            # locale on purpose - the storefront middleware redirects to the
            # default locale, exactly as the account emails' links do - because
            # an order carries no locale of its own (an online one is emailed
            # from the webhook, which never saw the checkout request).
            "action_url": f"{brand['base_url']}/orders/{order.public_id}",
            # Where an appointment happens, when that is a place the customer
            # travels to. None for everything else, and the whole block is then
            # skipped - see `_booking_location`.
            "location": _booking_location(order),
            # `cid:` reference for the inline attachment below, or None so the
            # template skips the whole block rather than rendering a broken image.
            "qr_cid": _QR_CID if qr_png else None,
            "preheader": (
                f"Pedido {order_ref} · {status_es} / Order {order_ref} · {status_en}"
            ),
            **brand,
        }

        if kind == CONFIRMATION:
            subject = f"Pedido {order_ref} recibido / Order {order_ref} received"
        elif kind == FULFILLED:
            if is_delivery:
                subject = f"Pedido {order_ref} en camino / Order {order_ref} on its way"
            else:
                subject = f"Pedido {order_ref} listo / Order {order_ref} ready"
        else:
            subject = (
                f"Pedido {order_ref}: {status_es} / Order {order_ref}: {status_en}"
            )

        text_body = render_to_string("orders/order_email.txt", ctx)
        html_body = render_to_string("orders/order_email.html", ctx)

        message = EmailMultiAlternatives(
            subject,
            text_body,
            brand["from_email"],
            [email],
            # A reply about the order should reach the store, not the platform
            # mailbox; fall back to the from-address if the tenant has no admins.
            reply_to=_admin_emails(system) or [brand["from_email"]],
        )
        message.attach_alternative(html_body, "text/html")

        if qr_png:
            image = MIMEImage(qr_png, "png")
            image.add_header("Content-ID", f"<{_QR_CID}>")
            # `inline`, so a client that understands the cid renders it in place
            # instead of listing it as a download the reader has to go find.
            image.add_header(
                "Content-Disposition", "inline", filename=f"order-{order_ref}.png",
            )
            message.attach(image)
            # Django nests the text/html alternatives inside a `multipart/mixed`
            # by default, which leaves the image a sibling of the whole body and
            # lets several clients (Outlook worst of all) refuse to resolve the
            # cid. `related` is the subtype that says "this part belongs to that
            # HTML" - without this line the block above renders as a broken image.
            message.mixed_subtype = "related"

        message.send(fail_silently=False)
    except Exception:
        # Best-effort: a mail failure must never fail the order or the webhook.
        logger.exception("Failed to send order email for order %s", order.pk)
