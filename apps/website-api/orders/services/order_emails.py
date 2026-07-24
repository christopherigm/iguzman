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

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from core.services.contact import _admin_emails, _tenant_brand

from ..serializers import resolve_line_image

logger = logging.getLogger(__name__)


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

    `resolve_line_image` without a request returns the stored (relative) media
    path; an email client has no request to resolve it against, so it is made
    absolute with `MEDIA_BASE_URL` exactly as the branded logo is.
    """
    url = resolve_line_image(line)
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"{settings.MEDIA_BASE_URL}{url}"


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
        message.send(fail_silently=False)
    except Exception:
        # Best-effort: a mail failure must never fail the order or the webhook.
        logger.exception("Failed to send order email for order %s", order.pk)
