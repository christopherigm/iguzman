"""Branded transactional email - the one place an email is composed.

A port of website-api's ``users/views.py`` → ``_email_brand`` /
``_send_branded_email``, with the multi-tenancy taken out. There, the branding
depends on *which tenant* the recipient belongs to, which is why that project
repeats the brand dict in ``core/services/contact.py``. Here there is exactly
one site (``System.load()``), so the branding does not depend on the recipient
at all and a single module can serve every sender - which is why this lives in
``core`` rather than in ``users``, even though ``users`` is its only caller
today.

Every message goes out as **both** parts: a plain-text body (the ``.txt``
template) and an HTML alternative (the ``.html`` template, which extends
``email/base.html`` for the shared chrome). A client that refuses HTML still
gets a readable email with a working link.

The chrome is driven by the CMS's brand kit - the logo, the two palette colours
and the page background from ``core.System`` - so an author who re-brands the
site at ``/admin/logos-and-styles`` re-brands its email in the same edit, with
no template change here.
"""

from __future__ import annotations

from email.utils import formataddr

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.text import Truncator

from core.media import absolute_media_url
from core.models import System

# Fallbacks for a site that has not been branded yet. They match the model's own
# defaults, so a fresh database sends the same email the CMS would preview.
DEFAULT_SITE_NAME = "Field Journal"
DEFAULT_PRIMARY_COLOR = "#06b6d4"
DEFAULT_SECONDARY_COLOR = "#7c9a3f"
DEFAULT_BACKGROUND = "#f4f5f7"

# `site_description` is a paragraph, but the footer has one line for it. Trimmed
# here rather than in the template so the text part gets the same string.
SLOGAN_MAX_CHARS = 90


def email_brand() -> dict:
    """Branding + base URL for any email this site sends.

    Reads the settings singleton, so it costs one query per message. Media is
    embedded by **absolute** URL because an email client has no request to
    resolve a path against - see ``core/media.py``.
    """
    system = System.load()

    base_url = (settings.FRONTEND_URL or "").rstrip("/")
    site_name = (system.site_name or "").strip() or DEFAULT_SITE_NAME
    slogan = Truncator((system.site_description or "").strip()).chars(SLOGAN_MAX_CHARS)

    return {
        "base_url": base_url,
        "site_name": site_name,
        "logo_url": absolute_media_url(system.img_logo),
        "primary_color": (system.primary_color or "").strip() or DEFAULT_PRIMARY_COLOR,
        "secondary_color": (system.secondary_color or "").strip() or DEFAULT_SECONDARY_COLOR,
        "background_color": (system.background_light or "").strip() or DEFAULT_BACKGROUND,
        "slogan": slogan,
        # Named sender, so an inbox shows the journal rather than the mailbox the
        # SMTP account happens to use.
        "from_email": formataddr((site_name, settings.DEFAULT_FROM_EMAIL)),
        # A reply should reach the journal's author when they have published an
        # address; otherwise it goes back to the sending mailbox.
        "reply_to": system.contact_email or "",
    }


def send_branded_email(subject, template, recipients, context=None, fail_silently=False):
    """Render ``<template>.txt`` + ``<template>.html`` with the brand and send.

    ``template`` is a template path **without** its extension, e.g.
    ``"users/verification_email"``. Returns the number of messages sent.
    """
    brand = email_brand()
    ctx = {**brand, **(context or {})}

    text_body = render_to_string(f"{template}.txt", ctx)
    html_body = render_to_string(f"{template}.html", ctx)

    message = EmailMultiAlternatives(
        subject,
        text_body,
        brand["from_email"],
        list(recipients),
        reply_to=[brand["reply_to"]] if brand["reply_to"] else None,
    )
    message.attach_alternative(html_body, "text/html")
    return message.send(fail_silently=fail_silently)
