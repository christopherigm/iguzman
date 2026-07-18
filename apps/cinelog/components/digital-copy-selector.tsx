"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  buildS3Ref,
  listBucketObjects,
  listBuckets,
  parseS3Ref,
  type S3Bucket,
  type S3Object,
} from "@/lib/storage";

type Mode = "url" | "s3";

/** Format a byte size compactly for the object picker (e.g. "1.4 GB"). */
function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

/**
 * Sets a movie's private digital-copy value, which is either a **direct URL**
 * (a provider watch link or a public media file) or an **S3 reference** into one
 * of the user's registered buckets (`s3://<bucketId>/<key>`), signed server-side
 * for playback. In S3 mode the file path can be typed or picked by browsing the
 * bucket. Emits the value to save via `onChange`.
 */
export function DigitalCopySelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("DigitalCopy");
  const tCommon = useTranslations("Common");

  // Seed mode + per-mode state from the incoming value, once.
  const initial = useMemo(() => parseS3Ref(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<Mode>(initial ? "s3" : "url");
  const [urlValue, setUrlValue] = useState(initial ? "" : value);
  const [bucketId, setBucketId] = useState<number | null>(
    initial?.bucketId ?? null,
  );
  const [key, setKey] = useState(initial?.key ?? "");

  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [bucketsLoaded, setBucketsLoaded] = useState(false);

  // Object-picker modal state.
  const [browsing, setBrowsing] = useState(false);
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [browseError, setBrowseError] = useState(false);

  useEffect(() => {
    listBuckets()
      .then(setBuckets)
      .catch(() => setBuckets([]))
      .finally(() => setBucketsLoaded(true));
  }, []);

  function emitUrl(next: string) {
    setUrlValue(next);
    onChange(next);
  }

  function emitS3(nextBucketId: number | null, nextKey: string) {
    setBucketId(nextBucketId);
    setKey(nextKey);
    onChange(nextBucketId && nextKey ? buildS3Ref(nextBucketId, nextKey) : "");
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    // Re-emit the value that matches the newly selected mode so the parent's
    // saved value always reflects what's on screen.
    if (next === "url") {
      onChange(urlValue);
    } else {
      onChange(bucketId && key ? buildS3Ref(bucketId, key) : "");
    }
  }

  async function openBrowse() {
    if (!bucketId) return;
    setBrowsing(true);
    setBrowseError(false);
    setLoadingObjects(true);
    try {
      setObjects(await listBucketObjects(bucketId));
    } catch {
      setBrowseError(true);
    } finally {
      setLoadingObjects(false);
    }
  }

  const bucketOptions: SelectOption[] = [
    { value: "", label: t("bucketSelectLabel") },
    ...buckets.map((b) => ({ value: String(b.id), label: b.label })),
  ];

  const selectedBucketLabel =
    buckets.find((b) => b.id === bucketId)?.label ?? "";

  return (
    <Box display="flex" flexDirection="column" gap={8}>
      <Box display="flex" gap={6}>
        <Button
          text={t("modeUrl")}
          type="button"
          size="sm"
          kind={mode === "url" ? "primary" : undefined}
          aria-pressed={mode === "url"}
          onClick={() => switchMode("url")}
          disabled={disabled}
        />
        <Button
          text={t("modeS3")}
          type="button"
          size="sm"
          kind={mode === "s3" ? "primary" : undefined}
          aria-pressed={mode === "s3"}
          onClick={() => switchMode("s3")}
          disabled={disabled}
        />
      </Box>

      {mode === "url" ? (
        <TextInput
          label={t("urlLabel")}
          type="url"
          value={urlValue}
          onChange={emitUrl}
          disabled={disabled}
        />
      ) : bucketsLoaded && buckets.length === 0 ? (
        <Box
          display="flex"
          flexDirection="column"
          gap={8}
          alignItems="flex-start"
        >
          <Typography variant="caption">{t("noBuckets")}</Typography>
          <LinkButton label={t("manageBuckets")} href="/storage" />
        </Box>
      ) : (
        <Box display="flex" flexDirection="column" gap={8}>
          <Select
            label={t("bucketSelectLabel")}
            value={bucketId ? String(bucketId) : ""}
            onChange={(v) => emitS3(v ? Number.parseInt(v, 10) : null, key)}
            options={bucketOptions}
            disabled={disabled}
          />
          <Box display="flex" gap={8} alignItems="flex-end">
            <TextInput
              label={t("keyLabel")}
              value={key}
              onChange={(v) => emitS3(bucketId, v)}
              placeholder={t("keyPlaceholder")}
              flex="1 1 auto"
              disabled={disabled}
            />
            <Button
              text={t("browse")}
              type="button"
              size="md"
              onClick={openBrowse}
              disabled={disabled || !bucketId}
              kind="primary"
            />
          </Box>
        </Box>
      )}

      {browsing && (
        <ConfirmationModal
          title={t("browseTitle")}
          text={selectedBucketLabel}
          okCallback={() => setBrowsing(false)}
          okLabel={tCommon("ok")}
        >
          <Box display="flex" flexDirection="column" gap={8}>
            {loadingObjects && <ProgressBar label={t("loadingObjects")} />}
            {!loadingObjects && browseError && (
              <Typography variant="caption" role="alert">
                {t("browseError")}
              </Typography>
            )}
            {!loadingObjects && !browseError && objects.length === 0 && (
              <Typography variant="caption">{t("browseEmpty")}</Typography>
            )}
            {objects.map((obj) => (
              <Button
                key={obj.key}
                text={`${obj.key} · ${formatSize(obj.size)}`}
                type="button"
                size="md"
                width="100%"
                onClick={() => {
                  emitS3(bucketId, obj.key);
                  setBrowsing(false);
                }}
              />
            ))}
          </Box>
        </ConfirmationModal>
      )}
    </Box>
  );
}
