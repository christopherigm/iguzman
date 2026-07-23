"use client";

import { useTranslations } from "next-intl";
import { ContactForm } from "@repo/ui/core-elements/contact-form";
import { useSession } from "@repo/auth/session-provider";
import {
  sendContactMessage,
  type ContactRelatedKind,
} from "@/lib/contact";

interface ContactFormClientProps {
  /** Optional heading above the form (omit on the contact page, which has its own). */
  heading?: string;
  description?: string;
  /**
   * When set, the message is tagged with the item it is about (a product,
   * service or menu item) and the form shows an "about <name>" context chip.
   * Used to embed the form on a detail page.
   */
  related?: { kind: ContactRelatedKind; id: number; name: string };
}

/**
 * The contact form, wired to the current tenant and the signed-in account. A
 * thin client wrapper over the shared, i18n-agnostic `@repo/ui` `ContactForm`:
 * it supplies the translated labels, reads the session (so a logged-in sender
 * only types a message), and does the transport via `sendContactMessage`.
 *
 * Reused on the contact page and, with `related`, on product/service/menu-item
 * detail pages ("ask a question about this item").
 */
export function ContactFormClient({
  heading,
  description,
  related,
}: ContactFormClientProps) {
  const t = useTranslations("Contact");
  const session = useSession();

  const account = session
    ? {
        name:
          `${session.firstName ?? ""} ${session.lastName ?? ""}`.trim() ||
          session.email,
        email: session.email,
      }
    : null;

  return (
    <ContactForm
      heading={heading}
      description={description}
      contextLabel={related ? t("aboutItem", { name: related.name }) : undefined}
      account={account}
      labels={{
        nameLabel: t("nameLabel"),
        emailLabel: t("emailLabel"),
        messageLabel: t("messageLabel"),
        messagePlaceholder: t("messagePlaceholder"),
        submit: t("submit"),
        submitting: t("submitting"),
        successMessage: t("successMessage"),
        errorMessage: t("errorMessage"),
        sendingAs: t("sendingAs"),
      }}
      onSubmit={(values) =>
        sendContactMessage({
          name: values.name,
          email: values.email,
          message: values.message,
          related_kind: related?.kind,
          related_id: related?.id,
          related_name: related?.name,
        })
      }
    />
  );
}

export default ContactFormClient;
