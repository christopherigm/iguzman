"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";

type Row = Record<string, unknown>;

interface GalleryEditorProps {
  /** `Admin` message key for the section heading. */
  titleKey: string;
  /** `Admin` message key for the sentence under it. */
  introKey: string;
  list: () => Promise<Row[]>;
  create: (data: Row) => Promise<Row>;
  update: (pk: number, data: Row) => Promise<Row>;
  remove: (pk: number) => Promise<void>;
  /** Extra controls rendered under the "add" uploader (the media kind picker). */
  children?: React.ReactNode;
  /** Merged into the body of every create call, for a kind/url the parent owns. */
  createExtras?: Row;
  /** Disables the add button - e.g. a link row with no URL typed yet. */
  addDisabled?: boolean;
  /** True when the add control is a URL rather than an image upload. */
  imageless?: boolean;
}

/**
 * The child-collection editor: a species' extra reference photos, and a
 * sighting's gallery.
 *
 * These live at their **parent's** URL rather than in a collection of their own,
 * and they are written one row at a time - so unlike the fields on the form
 * around it, every action here hits the API immediately rather than waiting for
 * Save. That is deliberate and worth knowing: adding a photo and then abandoning
 * the form still leaves the photo attached.
 *
 * The caption pair is edited inline and saved on blur, because a gallery of six
 * photos with two captions each is twelve fields, and pushing them through a
 * modal per row makes captioning an outing's photos a chore nobody does.
 */
export function GalleryEditor({
  titleKey,
  introKey,
  list,
  create,
  update,
  remove,
  children,
  createExtras,
  addDisabled,
  imageless,
}: GalleryEditorProps) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<NewImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  // Bumped after a successful add, so the uploader re-mounts empty rather than
  // holding the file that has already been sent.
  const [uploaderKey, setUploaderKey] = useState(0);

  const reload = useCallback(async () => {
    try {
      setRows(await list());
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [list, t]);

  useEffect(() => {
    void (async () => {
      await reload();
    })();
    // `list` is an inline arrow at every call site, so depending on it would
    // re-fetch on every render of the form around this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    const base64 = pending[0]?.base64;
    if (!imageless && !base64) return;
    setBusy(true);
    setError(null);
    try {
      const created = await create({
        ...(base64 ? { image: base64 } : {}),
        sort_order: rows.length,
        ...createExtras,
      });
      setRows((prev) => [...prev, created]);
      setPending([]);
      setUploaderKey((k) => k + 1);
    } catch {
      setError(t("errorSave"));
    } finally {
      setBusy(false);
    }
  };

  const handleCaption = async (row: Row, key: string, value: string) => {
    // Only write when it actually changed: every blur would otherwise be a
    // request, including tabbing straight through an untouched field.
    if (String(row[key] ?? "") === value) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: value } : r)));
    try {
      await update(row.id as number, { [key]: value });
    } catch {
      setError(t("errorSave"));
    }
  };

  const handleDelete = async (row: Row) => {
    setConfirmDelete(null);
    try {
      await remove(row.id as number);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      {/* Matches the pair-group headers AdminForm renders, so this reads as a
          section of the same form rather than a panel bolted onto it. */}
      <Box
        paddingBottom={2}
        styles={{
          borderBottom: "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
        }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {t(titleKey)}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t(introKey)}
      </Typography>

      {busy && <ProgressBar />}
      {error && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {error}
        </Typography>
      )}

      {loading ? (
        <Typography variant="body">{t("loading")}</Typography>
      ) : (
        <Box flexDirection="column" gap={10}>
          {rows.map((row) => {
            const src = (row.image ?? row.source_url ?? row.poster) as string | null;
            return (
              <Card key={String(row.id)} padding={12}>
                <Box gap={12} alignItems="flex-start" flexWrap="wrap">
                  <Box
                    width={72}
                    height={72}
                    borderRadius={8}
                    backgroundColor="color-mix(in srgb, var(--foreground) 8%, transparent)"
                    styles={{ overflow: "hidden", flexShrink: 0, position: "relative" }}
                  >
                    {src && (
                      <Image
                        src={src}
                        alt=""
                        fill
                        unoptimized
                        style={{ objectFit: "cover" }}
                        sizes="72px"
                      />
                    )}
                  </Box>
                  <Box flexDirection="column" gap={8} flexGrow={1} minWidth={220}>
                    {/* The Spanish caption and its English twin, side by side -
                        the same pairing every text field in this API has. */}
                    <TextInput
                      label={t("captionEs")}
                      defaultValue={String(row.name ?? "")}
                      onBlur={(e) => void handleCaption(row, "name", e.target.value)}
                    />
                    <TextInput
                      label={t("captionEn")}
                      defaultValue={String(row.en_name ?? "")}
                      onBlur={(e) => void handleCaption(row, "en_name", e.target.value)}
                    />
                  </Box>
                  <IconButton
                    icon="/icons/delete-trash-icon.svg"
                    kind="error"
                    size="sm"
                    aria-label={t("delete")}
                    title={t("delete")}
                    onClick={() => setConfirmDelete(row)}
                  />
                </Box>
              </Card>
            );
          })}
          {rows.length === 0 && (
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t("galleryEmpty")}
            </Typography>
          )}
        </Box>
      )}

      <Box flexDirection="column" gap={12}>
        {children}
        {!imageless && (
          <AdminImageUploader
            key={uploaderKey}
            existingImages={[]}
            onChange={(next) => setPending(next)}
            maxImages={1}
            compact
          />
        )}
        <Box>
          <Button
            text={`+ ${t("galleryAdd")}`}
            size="md"
            type="button"
            onClick={() => void handleAdd()}
            disabled={busy || addDisabled || (!imageless && pending.length === 0)}
          />
        </Box>
      </Box>

      {confirmDelete && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDelete")}
          okCallback={() => void handleDelete(confirmDelete)}
          cancelCallback={() => setConfirmDelete(null)}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        />
      )}
    </Box>
  );
}
