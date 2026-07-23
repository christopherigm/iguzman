"""Notify a tenant's admins that a customer sent a contact message.

Mirrors the branded-email approach in ``users/views.py`` (`_send_branded_email`):
the tenant's own branding, its own domain for the link, and both a plain-text and
an HTML part. Reuses the shared ``users/email_base.html`` chrome so a
contact-message email looks like every other transactional email the platform
sends.
"""

from email.utils import formataddr

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string


# The customer-facing label for each related-item kind, so the email reads
# "about the menu item …" rather than exposing the internal "food" key.
_RELATED_KIND_LABELS = {
    "product": "product",
    "service": "service",
    "food": "menu item",
}


def _tenant_brand(system):
    """Branding + base URL for an email about `system`, matching users._email_brand."""
    if system and system.host:
        base_url = f"https://{system.host}"
    else:
        base_url = settings.FRONTEND_URL.rstrip("/")

    logo_url = None
    if system and getattr(system, "img_logo", None):
        logo_url = f"{settings.MEDIA_BASE_URL}{system.img_logo.url}"

    site_name = (system.site_name if system else None) or "iGuzman"
    return {
        "base_url": base_url.rstrip("/"),
        "site_name": site_name,
        "logo_url": logo_url,
        "primary_color": (system.primary_color if system else None) or "#2196f3",
        "secondary_color": (system.secondary_color if system else None) or "#e040fb",
        "slogan": (system.slogan if system else None) or "",
        "from_email": formataddr((site_name, settings.DEFAULT_FROM_EMAIL)),
    }


def _admin_emails(system):
    """Every active admin of this tenant, as a de-duplicated list of addresses."""
    if system is None:
        return []
    emails = (
        User.objects.filter(
            profile__system=system,
            profile__is_admin=True,
            is_active=True,
        )
        .exclude(email="")
        .values_list("email", flat=True)
    )
    # Preserve order but drop duplicates (a person could hold two accounts).
    seen = set()
    result = []
    for e in emails:
        if e not in seen:
            seen.add(e)
            result.append(e)
    return result


def send_contact_message_notification(message):
    """Email every admin of `message.system` that a new contact message arrived.

    Best-effort: the caller has already saved the message, so a mail failure only
    means no email went out - the message is still in the inbox. Returns the
    number of recipients the email was sent to (0 if there were none)."""
    system = message.system
    recipients = _admin_emails(system)
    if not recipients:
        return 0

    brand = _tenant_brand(system)
    related_label = _RELATED_KIND_LABELS.get(message.related_kind or "")
    ctx = {
        "sender_name": message.name,
        "sender_email": message.email,
        "subject": message.subject or "",
        "body": message.message,
        "related_name": message.related_name or "",
        "related_label": related_label or "",
        # The admin inbox detail page for this message, on the tenant's own domain.
        "action_url": f"{brand['base_url']}/admin/messages/{message.pk}",
        **brand,
    }

    subject_line = "Nuevo mensaje de contacto / New contact message"
    text_body = render_to_string("core/contact_message_email.txt", ctx)
    html_body = render_to_string("core/contact_message_email.html", ctx)

    email = EmailMultiAlternatives(
        subject_line,
        text_body,
        brand["from_email"],
        # Send to the admins via Bcc so no admin sees another admin's address, and
        # set To to the site's own from-address so the message is well-formed.
        to=[brand["from_email"]],
        bcc=recipients,
        # A direct reply goes to the customer, not the platform mailbox.
        reply_to=[message.email],
    )
    email.attach_alternative(html_body, "text/html")
    email.send(fail_silently=False)
    return len(recipients)


def send_contact_message_reply(message, body, subject=None):
    """Email the customer an admin's reply to their contact message.

    The inverse of ``send_contact_message_notification``: it goes **to the
    customer** (`message.email`), branded as the tenant, and sets `reply_to` to the
    tenant's admins so the customer's reply lands back in the inbox rather than the
    platform mailbox. Raises on a mail failure so the caller never records a reply
    that did not actually go out."""
    system = message.system
    brand = _tenant_brand(system)
    admin_recipients = _admin_emails(system)

    if subject:
        subject_line = subject
    elif message.subject:
        subject_line = f"Re: {message.subject}"
    else:
        subject_line = "Re: your message"

    ctx = {
        "customer_name": message.name,
        "original_subject": message.subject or "",
        "original_body": message.message,
        "reply_subject": subject or "",
        "reply_body": body,
        # A link back to the tenant's own site, not the admin panel this time.
        "action_url": brand["base_url"],
        **brand,
    }

    text_body = render_to_string("core/contact_message_reply_email.txt", ctx)
    html_body = render_to_string("core/contact_message_reply_email.html", ctx)

    email = EmailMultiAlternatives(
        subject_line,
        text_body,
        brand["from_email"],
        to=[message.email],
        # A customer's reply should reach the tenant's admins; fall back to the
        # from-address if the tenant somehow has no active admin addresses.
        reply_to=admin_recipients or [brand["from_email"]],
    )
    email.attach_alternative(html_body, "text/html")
    email.send(fail_silently=False)
