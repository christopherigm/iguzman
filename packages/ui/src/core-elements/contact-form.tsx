"use client";

import { useState } from "react";
import { Box } from "./box";
import { Typography } from "./typography";
import { TextInput } from "./text-input";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { ProgressBar } from "./progress-bar";
import "./contact-form.css";

/** Default glyphs for the two reply-channel buttons. */
export const CONTACT_EMAIL_ICON = "/icons/email.svg";
export const CONTACT_WHATSAPP_ICON = "/icons/whatsapp.svg";

/**
 * Everything an international number is typed with, and nothing else.
 * `type="tel"` does not restrict input - the HTML spec leaves it free-form
 * because formats vary worldwide - so letters are filtered out here instead.
 *
 * Deliberately **not** `TextInput`'s `format="phone"`, which is a US 10-digit
 * `(XXX) XXX-XXXX` mask: it would truncate and reformat the country code that
 * a wa.me link needs. The shape stays the sender's; only junk is dropped.
 */
const NON_PHONE_CHARS = /[^\d+\s()-]/g;

/**
 * Fewest digits a reachable number can carry. A wa.me URL is the stripped
 * digits, so a "number" with none at all is a dead link and the message
 * becomes unanswerable - the one failure worth catching in the browser, where
 * the sender is still there to fix it. Kept low on purpose: the API stores the
 * number as typed precisely so odd formatting loses the formatting, not the
 * message, and this must not become a stricter rule than that.
 */
const MIN_PHONE_DIGITS = 7;

/**
 * All user-visible strings. This component is i18n-agnostic (like
 * `ConfirmationModal`), so the consuming app passes translated labels - that is
 * what keeps it reusable across apps that each own their own message catalog.
 */
export interface ContactFormLabels {
  nameLabel: string;
  emailLabel: string;
  messageLabel: string;
  submit: string;
  submitting: string;
  successMessage: string;
  errorMessage: string;
  /** Shown above the read-only identity block when `account` is set, e.g. "Sending as". */
  sendingAs?: string;
  messagePlaceholder?: string;

  // --- Only read when `collectPhone` is set. ---
  /** Label for the WhatsApp number field, e.g. "Your WhatsApp number". */
  phoneLabel?: string;
  /**
   * Names the channel picker for a screen reader, e.g. "How should we reply?".
   * The buttons are icon-only, so nothing on screen says what the pair is for.
   */
  channelLabel?: string;
  /** The two channel buttons - their accessible label and hover tooltip. */
  channelEmail?: string;
  channelWhatsapp?: string;
  /**
   * Shown while the selected channel has no address yet. Says what the pair
   * needs, since which field is required depends on the channel chosen.
   */
  contactRequired?: string;
}

/** A signed-in sender: when present, name/email are shown as text, not inputs. */
export interface ContactFormAccount {
  name: string;
  email: string;
}

/** Which channel the sender asked to be answered on. */
export type ContactFormChannel = "email" | "whatsapp";

export interface ContactFormValues {
  name: string;
  email: string;
  message: string;
  /** Only ever non-empty when the form was rendered with `collectPhone`. */
  phone?: string;
  preferredChannel?: ContactFormChannel;
}

export interface ContactFormProps {
  labels: ContactFormLabels;
  /**
   * Sends the message. Reject to surface `labels.errorMessage`; resolve to clear
   * the message field and show `labels.successMessage`. The app owns the actual
   * transport (a route handler → API), keeping this component free of fetch/URLs.
   */
  onSubmit: (values: ContactFormValues) => Promise<void>;
  /**
   * The signed-in user, if any. When set, the name/email inputs are replaced by
   * read-only text (their account details are used) and only the message field
   * is editable.
   */
  account?: ContactFormAccount | null;
  /** Optional heading rendered above the form. */
  heading?: string;
  /** Optional supporting line under the heading. */
  description?: string;
  /**
   * Optional context chip, e.g. the name of the product/menu item the form is
   * embedded on ("About: Cappuccino"). Purely presentational - the caller also
   * passes the related item to its own `onSubmit`.
   */
  contextLabel?: string;
  /**
   * Offer WhatsApp as an alternative to email, chosen with the two icon buttons
   * in the heading row. Off by default, so a consumer that has not supplied the
   * extra labels is unchanged.
   *
   * The choice is an **either/or**: the picker swaps the email field for the
   * WhatsApp-number field, and whichever one is showing is the address the
   * sender will be answered on - so it, and only it, is required.
   */
  collectPhone?: boolean;
  /** Glyph for the email channel button. Defaults to `/icons/email.svg`. */
  emailIcon?: string;
  /** Glyph for the WhatsApp channel button. Defaults to `/icons/whatsapp.svg`. */
  whatsappIcon?: string;
  className?: string;
}

/**
 * A generic, decoupled "ask a question" form. Manages its own field state and
 * submit lifecycle; the app supplies labels, the signed-in account (optional),
 * and an `onSubmit` that does the transport. Reused on the contact page and,
 * with a `contextLabel`, on product/service/menu-item detail pages.
 */
export function ContactForm({
  labels,
  onSubmit,
  account,
  heading,
  description,
  contextLabel,
  collectPhone = false,
  emailIcon = CONTACT_EMAIL_ICON,
  whatsappIcon = CONTACT_WHATSAPP_ICON,
  className,
}: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<ContactFormChannel>("email");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  const isLoggedIn = Boolean(account);
  const effectiveName = account?.name ?? name;
  const effectiveEmail = account?.email ?? email;

  // The picker only exists with the phone on; without it, email is the only
  // channel and the choice would be between one thing.
  const wantsWhatsapp = collectPhone && channel === "whatsapp";

  // Only the chosen channel's field is on screen, so it alone is the reply
  // address - which is what makes a per-field `required` honest again.
  const hasReplyAddress = wantsWhatsapp
    ? phone.replace(/\D/g, "").length >= MIN_PHONE_DIGITS
    : effectiveEmail.trim().length > 0;

  const canSubmit =
    !loading &&
    message.trim().length > 0 &&
    effectiveName.trim().length > 0 &&
    hasReplyAddress;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(false);
    setSuccess(false);
    try {
      await onSubmit({
        name: effectiveName.trim(),
        email: effectiveEmail.trim(),
        message: message.trim(),
        // Both addresses travel when both were typed - a sender who switched
        // channels mid-form left a working email behind, and a message with a
        // second way to answer it is never worse. `preferredChannel` is the
        // choice, and `canSubmit` guarantees it points at an address.
        ...(collectPhone
          ? { phone: phone.trim(), preferredChannel: channel }
          : {}),
      });
      setSuccess(true);
      setMessage("");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={`contact-form${className ? ` ${className}` : ""}`}
      onSubmit={handleSubmit}
    >
      {(heading || collectPhone) && (
        <Box alignItems="center" gap={12}>
          {heading && (
            <Typography as="h2" variant="h4" margin={0}>
              {heading}
            </Typography>
          )}
          {collectPhone && (
            <Box
              role="group"
              aria-label={labels.channelLabel}
              gap={6}
              marginInlineStart="auto"
            >
              <IconButton
                icon={emailIcon}
                aria-label={labels.channelEmail ?? "Email"}
                title={labels.channelEmail ?? "Email"}
                aria-pressed={!wantsWhatsapp}
                kind={wantsWhatsapp ? "default" : "primary"}
                solid={!wantsWhatsapp}
                onClick={() => setChannel("email")}
              />
              <IconButton
                icon={whatsappIcon}
                aria-label={labels.channelWhatsapp ?? "WhatsApp"}
                title={labels.channelWhatsapp ?? "WhatsApp"}
                aria-pressed={wantsWhatsapp}
                kind={wantsWhatsapp ? "primary" : "default"}
                solid={wantsWhatsapp}
                onClick={() => setChannel("whatsapp")}
              />
            </Box>
          )}
        </Box>
      )}
      {description && (
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {description}
        </Typography>
      )}
      {contextLabel && (
        <Typography
          as="span"
          variant="label"
          color="var(--accent, #2196f3)"
          fontWeight={600}
        >
          {contextLabel}
        </Typography>
      )}

      {isLoggedIn ? (
        <Box
          flexDirection="column"
          gap={2}
          padding={8}
          borderRadius={8}
          backgroundColor="var(--surface-2)"
          border="1px solid var(--border, #e5e7eb)"
        >
          {labels.sendingAs && (
            <Typography
              variant="label"
              color="var(--muted-foreground, #6b7280)"
            >
              {labels.sendingAs}
            </Typography>
          )}
          <Typography variant="body" fontWeight={600}>
            {account?.name}
          </Typography>
          <Typography
            variant="caption"
            color="var(--muted-foreground, #6b7280)"
          >
            {account?.email}
          </Typography>
        </Box>
      ) : (
        <Box flexDirection="column" gap={14}>
          <TextInput
            label={labels.nameLabel}
            type="text"
            value={name}
            onChange={setName}
            required
            autoComplete="name"
          />
          {/* Swapped for the WhatsApp field by the channel picker - the sender
              is answered on the one they chose, so only it is asked for. */}
          {!wantsWhatsapp && (
            <TextInput
              label={labels.emailLabel}
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="email"
            />
          )}
        </Box>
      )}

      {collectPhone && (
        <Box flexDirection="column" gap={14}>
          {wantsWhatsapp && (
            <TextInput
              label={labels.phoneLabel}
              type="tel"
              value={phone}
              onChange={(v) => setPhone(v.replace(NON_PHONE_CHARS, ""))}
              required
              autoComplete="tel"
            />
          )}

          {/* Says what is missing while the chosen channel has no address. */}
          {labels.contactRequired && !hasReplyAddress && (
            <Typography
              variant="caption"
              color="var(--muted-foreground, #6b7280)"
            >
              {labels.contactRequired}
            </Typography>
          )}
        </Box>
      )}

      <TextInput
        label={labels.messageLabel}
        multirow
        rows={5}
        value={message}
        onChange={setMessage}
        required
        placeholder={labels.messagePlaceholder}
      />

      {error && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {labels.errorMessage}
        </Typography>
      )}
      {success && (
        <Typography variant="body" color="var(--success, #16a34a)">
          {labels.successMessage}
        </Typography>
      )}
      {loading && <ProgressBar label={labels.submitting} />}

      <Button
        text={loading ? labels.submitting : labels.submit}
        type="submit"
        size="md"
        width="100%"
        kind={canSubmit ? "primary" : undefined}
        disabled={!canSubmit}
      />
    </form>
  );
}

export default ContactForm;
