"use client";

import { useState } from "react";
import { Box } from "./box";
import { Typography } from "./typography";
import { TextInput } from "./text-input";
import { Button } from "./button";
import { ProgressBar } from "./progress-bar";
import "./contact-form.css";

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
}

/** A signed-in sender: when present, name/email are shown as text, not inputs. */
export interface ContactFormAccount {
  name: string;
  email: string;
}

export interface ContactFormValues {
  name: string;
  email: string;
  message: string;
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
  className,
}: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  const isLoggedIn = Boolean(account);
  const effectiveName = account?.name ?? name;
  const effectiveEmail = account?.email ?? email;

  const canSubmit =
    !loading &&
    message.trim().length > 0 &&
    effectiveName.trim().length > 0 &&
    effectiveEmail.trim().length > 0;

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
      {heading && (
        <Typography as="h2" variant="h4" margin={0}>
          {heading}
        </Typography>
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
            <Typography variant="label" color="var(--muted-foreground, #6b7280)">
              {labels.sendingAs}
            </Typography>
          )}
          <Typography variant="body" fontWeight={600}>
            {account?.name}
          </Typography>
          <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
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
          <TextInput
            label={labels.emailLabel}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
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
