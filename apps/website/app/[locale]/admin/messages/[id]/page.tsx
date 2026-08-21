"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Badge } from "@repo/ui/core-elements/badge";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  getContactMessage,
  updateContactMessage,
  deleteContactMessage,
  replyToContactMessage,
  type AdminContactMessage,
} from "@/lib/admin-api";
import { whatsappHref } from "@/lib/contact";

// The compose form sits under the message it answers, so revealing it has to
// bring it into view - a long message opens it below the fold.
const REPLY_FORM_ID = "reply-form";

export default function AdminMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("Admin");
  const tm = useTranslations("AdminMessages");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const [message, setMessage] = useState<AdminContactMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reply compose state - the form is revealed on demand so the page stays a
  // reader by default. `replyChannel` decides which of the two very different
  // send paths the card offers: email is sent by the API, while WhatsApp is
  // handed to the admin's own WhatsApp through a wa.me link and only *recorded*
  // here (see `replyToContactMessage`).
  const [showReply, setShowReply] = useState(false);
  const [replyChannel, setReplyChannel] = useState<"email" | "whatsapp">(
    "email",
  );
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // GET marks the message read server-side, so the inbox count is truthful.
      setMessage(await getContactMessage(Number(id)));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (!showReply) return;
    document
      .getElementById(REPLY_FORM_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [showReply]);

  const toggleRead = useCallback(async () => {
    if (!message) return;
    setBusy(true);
    try {
      setMessage(
        await updateContactMessage(message.id, { is_read: !message.is_read }),
      );
    } catch {
      setError(t("errorSave"));
    } finally {
      setBusy(false);
    }
  }, [message, t]);

  const openReply = useCallback(
    (channel: "email" | "whatsapp") => {
      if (!message) return;
      setReplyChannel(channel);
      // Prefill a "Re: …" subject from the original; the admin can edit or clear
      // it. A WhatsApp message has no subject line, so it gets none.
      setReplySubject(
        channel === "email"
          ? message.subject
            ? `Re: ${message.subject}`
            : tm("replySubject")
          : "",
      );
      setReplyError(null);
      setShowReply(true);
    },
    [message, tm],
  );

  const sendReply = useCallback(async () => {
    if (!message || !replyBody.trim()) return;
    setSending(true);
    setReplyError(null);
    try {
      // Email: recorded only if the mail went out, so the returned message
      // carries a truthful `replied_at`. WhatsApp: recorded outright - the send
      // happened in the admin's own WhatsApp and this call cannot verify it.
      const updated = await replyToContactMessage(message.id, {
        subject:
          replyChannel === "email"
            ? replySubject.trim() || undefined
            : undefined,
        body: replyBody,
        channel: replyChannel,
      });
      setMessage(updated);
      setShowReply(false);
      setReplyBody("");
      setReplySubject("");
    } catch {
      setReplyError(
        replyChannel === "email"
          ? tm("replyErrorSend")
          : tm("replyErrorRecord"),
      );
    } finally {
      setSending(false);
    }
  }, [message, replyBody, replySubject, replyChannel, tm]);

  const handleDelete = useCallback(async () => {
    if (!message) return;
    setBusy(true);
    try {
      await deleteContactMessage(message.id);
      router.replace("/admin/messages");
    } catch {
      setError(t("errorDelete"));
      setBusy(false);
    }
  }, [message, router, t]);

  if (loading) return <Typography variant="body">{t("loading")}</Typography>;
  if (error && !message) return <Typography variant="body">{error}</Typography>;
  if (!message) return null;

  // A human label for the kind of item the message was about, if any.
  const relatedLabel = message.related_kind
    ? tm(`kind_${message.related_kind}`)
    : null;

  // Either contact detail may be missing - a customer leaves an email, a
  // WhatsApp number, or both - so every reply affordance is gated on the one it
  // actually needs.
  const canEmail = Boolean(message.email);
  const canWhatsapp = Boolean(message.phone);
  // What the "Open in WhatsApp" link carries. An empty compose box still opens a
  // useful chat, so fall back to an opener naming the message being answered.
  // A contact-form message has no subject to name, so it gets the shorter opener
  // rather than a quoted stand-in subject the customer never wrote.
  const waPrefill =
    replyBody.trim() ||
    (message.subject
      ? tm("whatsappGreeting", {
          name: message.name,
          subject: message.subject,
        })
      : tm("whatsappGreetingNoSubject", { name: message.name }));

  // The contact form submits no subject, so the heading says what the message
  // actually is instead of labelling it "(no subject)".
  const headingSubject =
    message.subject || tm("contactFormSubject", { name: message.name });

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: tm("title"), href: "/admin/messages" },
          { label: message.name },
        ]}
      />

      <Box flexDirection="column" gap={20}>
        <Box
          alignItems="flex-start"
          justifyContent="space-between"
          gap={16}
          flexWrap="wrap"
        >
          <Box flexDirection="column" gap={4}>
            <Typography as="h1" variant="h3" margin={0}>
              {headingSubject}
            </Typography>
            {/* When it arrived belongs with the title, not buried among the
                sender's contact details. */}
            <Typography
              variant="caption"
              color="var(--muted-foreground, #6b7280)"
              margin={0}
            >
              {new Date(message.created).toLocaleString()}
            </Typography>
          </Box>
          <Box gap={8} alignItems="center">
            {message.preferred_channel === "whatsapp" ? (
              <Badge
                variant="outlined"
                size="sm"
                color="var(--accent-text, #2196f3)"
              >
                {tm("prefersWhatsapp")}
              </Badge>
            ) : null}
            {message.replied_at ? (
              <Badge variant="filled" size="sm" color="var(--success, #22c55e)">
                {message.reply_channel === "whatsapp"
                  ? tm("repliedOnWhatsapp")
                  : tm("replied")}
              </Badge>
            ) : null}
            {!message.is_read ? (
              <Badge variant="filled" size="sm" color="var(--accent, #2196f3)">
                {tm("unread")}
              </Badge>
            ) : null}
          </Box>
        </Box>

        {error ? (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {error}
          </Typography>
        ) : null}

        <Box gap={8} flexWrap="wrap">
          <Button
            text={message.is_read ? tm("markUnread") : tm("markRead")}
            kind="primary"
            size="sm"
            disabled={busy}
            onClick={toggleRead}
          />
          {canEmail && (
            <Button
              text={message.replied_at ? tm("replyAgain") : tm("reply")}
              kind="primary"
              size="sm"
              disabled={busy || showReply}
              onClick={() => openReply("email")}
            />
          )}
          {canWhatsapp && (
            <Button
              text={tm("replyOnWhatsapp")}
              // Primary when it is what the customer asked for, so the channel
              // they chose is the one the admin reaches for first.
              kind={
                message.preferred_channel === "whatsapp" || !canEmail
                  ? "primary"
                  : undefined
              }
              size="sm"
              disabled={busy || showReply}
              onClick={() => openReply("whatsapp")}
            />
          )}
          {canEmail && (
            <Button
              text={tm("replyViaEmail")}
              size="sm"
              href={`mailto:${message.email}?subject=${encodeURIComponent(
                message.subject ? `Re: ${message.subject}` : tm("replySubject"),
              )}`}
              target="_blank"
            />
          )}
          <Button
            text={t("delete")}
            kind="error"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          />
        </Box>

        <Card gap={12}>
          {/* Name and email read as one identity - "Chris Guzman
              (chris@gmail.com)" - so the email keeps no row of its own. The
              WhatsApp number still does: it is a second channel, not a second
              spelling of the same one. */}
          <DetailRow
            label={tm("from")}
            value={
              canEmail ? `${message.name} (${message.email})` : message.name
            }
          />
          {message.phone ? (
            <DetailRow label={tm("phoneLabel")} value={message.phone} />
          ) : null}
          <DetailRow
            label={tm("preferredChannelLabel")}
            value={
              message.preferred_channel === "whatsapp"
                ? tm("channelWhatsapp")
                : tm("channelEmail")
            }
          />
          {message.related_name ? (
            <DetailRow
              label={tm("about")}
              value={
                relatedLabel
                  ? `${message.related_name} (${relatedLabel})`
                  : message.related_name
              }
            />
          ) : null}
        </Card>

        <Card gap={8}>
          <Typography as="h2" variant="h5" margin={0}>
            {tm("message")}
          </Typography>
          <Box height={1} backgroundColor="var(--border)" />
          <Typography
            variant="body"
            color="var(--on-surface)"
            styles={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
          >
            {message.message}
          </Typography>
        </Card>

        {showReply ? (
          <Card gap={12} id={REPLY_FORM_ID}>
            <Typography as="h2" variant="h5" margin={0}>
              {replyChannel === "whatsapp"
                ? tm("replyTitleWhatsapp", { name: message.name })
                : tm("replyTitle", { name: message.name })}
            </Typography>
            <Box height={1} backgroundColor="var(--border)" />
            {/* A WhatsApp message has no subject line. */}
            {replyChannel === "email" ? (
              <TextInput
                label={tm("replySubjectLabel")}
                value={replySubject}
                onChange={setReplySubject}
                disabled={sending}
              />
            ) : null}
            <TextInput
              label={tm("replyBodyLabel")}
              value={replyBody}
              onChange={setReplyBody}
              multirow
              rows={6}
              disabled={sending}
            />
            {replyError ? (
              <Typography variant="caption" color="var(--error, #ef4444)">
                {replyError}
              </Typography>
            ) : null}

            {replyChannel === "whatsapp" ? (
              <>
                {/* Two steps, because they are genuinely two things: WhatsApp
                    sends the message, and this page can only record that it was
                    sent. Saying so beats a single button that would imply the
                    CMS delivered it. */}
                <Typography
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {tm("whatsappHint")}
                </Typography>
                <Box gap={8} flexWrap="wrap">
                  <Button
                    text={tm("openInWhatsapp")}
                    kind="primary"
                    size="sm"
                    href={whatsappHref(message.phone ?? "", waPrefill)}
                    target="_blank"
                  />
                  <Button
                    text={sending ? tm("sending") : tm("markReplied")}
                    size="sm"
                    disabled={sending || !replyBody.trim()}
                    onClick={sendReply}
                  />
                  <Button
                    text={tCommon("cancel")}
                    size="sm"
                    disabled={sending}
                    onClick={() => setShowReply(false)}
                  />
                </Box>
              </>
            ) : (
              <Box gap={8} flexWrap="wrap">
                <Button
                  text={sending ? tm("sending") : tm("sendReply")}
                  kind="primary"
                  size="sm"
                  disabled={sending || !replyBody.trim()}
                  onClick={sendReply}
                />
                <Button
                  text={tCommon("cancel")}
                  size="sm"
                  disabled={sending}
                  onClick={() => setShowReply(false)}
                />
              </Box>
            )}
          </Card>
        ) : null}

        {message.replied_at && message.reply_body ? (
          <Card gap={8}>
            <Typography as="h2" variant="h5" margin={0}>
              {message.reply_channel === "whatsapp"
                ? tm("sentReplyHeadingWhatsapp")
                : tm("sentReplyHeading")}
            </Typography>
            <Typography variant="caption" color="var(--foreground)" margin={0}>
              {tm("repliedMeta", {
                name: message.replied_by_name || "-",
                date: new Date(message.replied_at).toLocaleString(),
              })}
            </Typography>
            {/* ⚠ A WhatsApp reply left through the admin's own WhatsApp; this
                app never saw it delivered, so it must not read as confirmation. */}
            {message.reply_channel === "whatsapp" ? (
              <Typography
                variant="caption"
                color="var(--muted-foreground, #6b7280)"
                margin={0}
              >
                {tm("whatsappRecordedNote")}
              </Typography>
            ) : null}
            {message.reply_subject ? (
              <DetailRow
                label={tm("replySubjectLabel")}
                value={message.reply_subject}
              />
            ) : null}
            <Box height={1} backgroundColor="var(--border)" />
            <Typography
              variant="body"
              color="var(--on-surface)"
              styles={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
            >
              {message.reply_body}
            </Typography>
          </Card>
        ) : null}
      </Box>

      {confirmDelete && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDelete")}
          okCallback={() => {
            setConfirmDelete(false);
            void handleDelete();
          }}
          cancelCallback={() => setConfirmDelete(false)}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        />
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box alignItems="baseline" justifyContent="space-between" gap={12}>
      <Typography
        as="span"
        variant="label"
        margin={0}
        color="var(--foreground)"
      >
        {label}
      </Typography>
      <Typography as="span" variant="body" margin={0} color="var(--on-surface)">
        {value}
      </Typography>
    </Box>
  );
}
