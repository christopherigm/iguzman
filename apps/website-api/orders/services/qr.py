"""The QR code every order carries.

One PNG per order, encoding the **public** order-detail URL
(``https://<tenant host>/orders/<public_id>``) - the same address the
confirmation email already links to. A customer scanning it off their receipt
lands on their own order; a store admin scanning the same code lands on the same
page, which offers them a "See in admin" jump to the management view.

**The code deliberately points at the customer page, not at
``/admin/orders/<public_id>``.** A QR carries exactly one URL and it is printed
on paper the customer keeps, so it has to be the address that works for whoever
holds it. Admin validation is a *permission* on that page, not a second code -
which is why `orders.views._may_read` lets a tenant's admin read any order of
their own System.

**Written once, at checkout** (`_open_order`), never regenerated per render. The
payload is derived only from `public_id` and the tenant's host, neither of which
moves in an order's lifetime, and a printed code that regenerated differently
would stop matching the receipt it is on.

**Best-effort, exactly like the order emails.** `attach_order_qr` swallows every
failure: an order with no QR is a nuisance, while an order that failed to be
placed because object storage was slow is a lost sale. Anything missed is filled
in later by ``manage.py backfill_order_qr``.
"""

import logging
from io import BytesIO

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)

# Error-correction level M recovers ~15% of the symbol. A receipt gets folded,
# creased and photographed under a shop's lighting, so the cheapest level (L,
# ~7%) is not enough; the highest (H, ~30%) buys robustness nobody needs at the
# cost of a denser symbol that phone cameras find *harder* at this print size.
_ERROR_CORRECTION = qrcode.constants.ERROR_CORRECT_M

# 8 px per module gives a ~300-400 px PNG for a URL of this length - big enough
# to scan from a phone screen and to print on a receipt, small enough (~1 KB)
# to attach inline to every order email without bloating the message.
_BOX_SIZE = 8

# The mandatory quiet zone. Four modules is the spec's minimum; below it many
# scanners simply never lock on, which is the single most common reason a
# "correct" QR does not read.
_BORDER = 4


def site_base_url(system) -> str:
    """The origin a tenant's own pages are addressed at.

    Derived from the System's own `host`, never from a request header: this ends
    up in a QR code printed on receipts and in a redirect handed to Stripe, so
    letting the browser influence it (via `X-Website-Host`, which any client can
    set) would put an attacker-chosen origin on a customer's receipt and turn
    checkout into an open redirect on the tenant's domain.

    The local default host has no port, so development falls back to
    `FRONTEND_URL` - otherwise every dev QR would encode an unreachable
    `https://localhost`.
    """
    host = (getattr(system, "host", "") or "").strip()
    if not host or host in {"localhost", "127.0.0.1"}:
        return settings.FRONTEND_URL.rstrip("/")
    return f"https://{host}"


def order_detail_url(order) -> str:
    """The public order page this order's QR code points at.

    Unprefixed by locale on purpose, matching the link in the order emails: the
    storefront middleware redirects to the reader's own locale, and an order
    carries no locale of its own (an online one is emailed from the webhook,
    which never saw the checkout request).
    """
    return f"{site_base_url(order.system)}/orders/{order.public_id}"


def render_qr_png(url: str) -> bytes:
    """A QR code for `url` as PNG bytes."""
    code = qrcode.QRCode(
        version=None,  # let the encoder pick the smallest symbol that fits
        error_correction=_ERROR_CORRECTION,
        box_size=_BOX_SIZE,
        border=_BORDER,
    )
    code.add_data(url)
    code.make(fit=True)
    # Pure black on pure white: a tinted or brand-coloured code loses contrast
    # under a shop's lighting, and this one has to scan on the first try with a
    # queue behind it.
    image = code.make_image(fill_color="black", back_color="white")

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def attach_order_qr(order, *, force: bool = False) -> bool:
    """Generate and store `order`'s QR code. Returns whether one was written.

    A no-op when the order already has one, unless `force` - see the module
    docstring for why a code is written once and left alone.

    Never raises. The caller is a checkout that has already taken the customer's
    money or their commitment to pay it, and no storage failure may undo that.
    """
    if order.qr_code and not force:
        return False

    try:
        png = render_qr_png(order_detail_url(order))
        # `save()` writes the file *and* the row. `upload_to` renames it after
        # `public_id` anyway, so the name passed here only supplies the
        # extension - see `order_qr_upload_path`.
        order.qr_code.save(f"{order.public_id}.png", ContentFile(png), save=True)
        return True
    except Exception:
        logger.exception("Failed to write QR code for order %s", order.pk)
        return False


def order_qr_bytes(order) -> bytes | None:
    """The stored QR PNG's bytes, or None when there is nothing to read.

    Used by the order email, which embeds the code as an inline attachment
    rather than linking it: most mail clients block remote images by default,
    and a blocked QR is a blank box - which for the one thing the recipient may
    need to hold up at a counter is worse than no code at all.

    Best-effort like everything else here: a missing or unreadable file returns
    None and the email simply goes out without the code.
    """
    if not order.qr_code:
        return None
    try:
        with order.qr_code.open("rb") as handle:
            return handle.read()
    except Exception:
        logger.warning("QR code for order %s could not be read", order.pk, exc_info=True)
        return None
