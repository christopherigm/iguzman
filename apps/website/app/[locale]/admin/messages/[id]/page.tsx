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
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  getContactMessage,
  updateContactMessage,
  deleteContactMessage,
  type AdminContactMessage,
} from "@/lib/admin-api";

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
          alignItems="center"
          justifyContent="space-between"
          gap={16}
          flexWrap="wrap"
        >
          <Typography as="h1" variant="h3" margin={0}>
            {message.subject || tm("noSubject")}
          </Typography>
          {!message.is_read ? (
            <Badge variant="filled" size="sm" color="var(--accent, #2196f3)">
              {tm("unread")}
            </Badge>
          ) : null}
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
          <Button
            text={tm("reply")}
            size="sm"
            href={`mailto:${message.email}?subject=${encodeURIComponent(
              message.subject || tm("replySubject"),
            )}`}
            target="_blank"
          />
          <Button
            text={t("delete")}
            kind="error"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          />
        </Box>

        <Card gap={12}>
          <DetailRow label={tm("from")} value={message.name} />
          <DetailRow label={tm("emailLabel")} value={message.email} />
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
          <DetailRow
            label={tm("date")}
            value={new Date(message.created).toLocaleString()}
          />
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
      <Typography as="span" variant="label" margin={0} color="var(--foreground)">
        {label}
      </Typography>
      <Typography as="span" variant="body" margin={0} color="var(--on-surface)">
        {value}
      </Typography>
    </Box>
  );
}
