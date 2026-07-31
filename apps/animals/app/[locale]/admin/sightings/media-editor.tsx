"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { sightingMedia } from "@/lib/admin-api";
import {
  readVideoDuration,
  uploadVideo,
  VideoUploadError,
} from "@/lib/video-upload";
// The drop target is the photo uploader's, class for class - one dropzone design
// in the CMS, and its hover/drag-over states are pseudo-selectors that cannot be
// component props.
import "@/components/admin-image-uploader/admin-image-uploader.css";

type Row = Record<string, unknown>;
type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

/**
 * How often a clip that is still converting is re-read. Polling rather than SSE
 * for the same reason the public page polls: the status already lives on the
 * row, so any replica can answer it from the database - and the transcode is
 * running on a pod this browser has no channel to.
 */
const PROCESSING_POLL_MS = 10_000;

/**
 * A sighting's **clips**: uploaded video files, and video links.
 *
 * The entry's photographs are not here - they are the multi-select uploader
 * directly above (`EntityGalleryField`), where the first one is the entry's
 * cover. The two video kinds stay behind because neither can be handled the way
 * a photo is:
 *
 * - a **link** is just a URL, so there is no file to upload at all;
 * - a **video file** never reaches animals-api. A source clip is a camera-roll
 *   4K recording - a few GB - which is past Cloudflare's ~100 MB body cap on
 *   both hostnames, and that API has neither ffmpeg nor a worker to process one.
 *   So it goes in two steps: the API reserves an empty row and issues a signed
 *   upload ticket, then the bytes go in ≤90 MB chunks to **this app's own**
 *   `/api/video/upload`, which transcodes them and PUTs the result to R2.
 *
 * Both are still written **immediately**, one row at a time, rather than on Save
 * like the photos - an upload that runs for minutes has nowhere to wait in form
 * state. Adding a clip and then abandoning the form leaves the clip attached.
 *
 * ⚠ **A tile appears before its video exists**, in `processing`, and shows a
 * spinner instead of a player. That is not a half-written row to be cleaned up:
 * the transcode is still running on a pod, and it will PATCH the row to `ready`
 * (or `failed`) when it finishes - which is what the poll below is watching for.
 *
 * **No captions.** Every row still *has* the Spanish/English pair (the Django
 * admin's inline can set it, and the public page renders one when it is there),
 * but a clip is watched, not read, and two fields per tile made adding one a
 * chore. The photo uploader made the same trade.
 */
export function MediaEditor({ sightingId }: { sightingId: number }) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  // ── Upload ────────────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);

  // ── Link ──────────────────────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const reload = useCallback(async () => {
    try {
      // The photos of this entry are edited by the uploader above, so they are
      // filtered out here - listing them twice would invite an author to delete
      // a row in one place and still see it in the other.
      const all = await sightingMedia.list(sightingId);
      setRows(all.filter((row) => row.kind !== "image"));
    } catch {
      setError(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [sightingId, t]);

  useEffect(() => {
    // Through an async IIFE rather than `void reload()`: the first `setState`
    // must land after the effect body returns, not inside it.
    void (async () => {
      await reload();
    })();
  }, [reload]);

  const videos = rows.filter((row) => row.kind === "video");
  const links = rows.filter((row) => row.kind === "link");
  const converting = videos.some((row) => {
    const status = row.processing_status as ProcessingStatus | undefined;
    return status === "pending" || status === "processing";
  });

  // A clip's row is written before its file exists, so the tile has to find out
  // on its own that the transcode landed. The interval only exists while
  // something is actually converting.
  useEffect(() => {
    if (!converting) return;
    const timer = setInterval(() => void reload(), PROCESSING_POLL_MS);
    return () => clearInterval(timer);
  }, [converting, reload]);

  const handleFiles = async (files: FileList | File[] | null) => {
    // One clip per drop, deliberately: every replica is admission-capped on
    // scratch disk (`MAX_CONCURRENT_UPLOADS`), so a queue of four would report
    // `busy` partway through and leave the author guessing which ones landed.
    const file = Array.from(files ?? []).find((f) =>
      f.type.startsWith("video/"),
    );
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      // Two steps, and they are not interchangeable: the API decides whether
      // this row may exist (and hands back the ticket that authorises the
      // upload), then the bytes go to this app's own handler.
      const duration = await readVideoDuration(file);
      const reserved = await sightingMedia.reserveVideo(sightingId, {
        filename: file.name,
        size_bytes: file.size,
        duration_seconds: duration,
      });

      await uploadVideo({
        file,
        ticket: reserved.upload_ticket,
        // No duration cap in the CMS: an author uploading a ten-minute clip has
        // decided to. The contribute flow is where the limit lives.
        onProgress: setProgress,
      });
      await reload();
    } catch (err) {
      const code = err instanceof VideoUploadError ? err.code : null;
      // `busy` is admission control rather than a fault - every replica is
      // already holding as many uploads as its scratch disk allows - so it gets
      // its own message telling the author to retry rather than to give up.
      setError(code === "busy" ? t("videoUploadBusy") : t("videoUploadFailed"));
    } finally {
      setUploading(false);
      setProgress(0);
      if (videoInput.current) videoInput.current.value = "";
    }
  };

  const handleAddLink = async () => {
    const value = url.trim();
    if (!value) return;
    setAddingLink(true);
    setError(null);
    try {
      const created = await sightingMedia.create(sightingId, {
        kind: "link",
        url: value,
        sort_order: rows.length,
      });
      setRows((prev) => [...prev, created]);
      setUrl("");
    } catch {
      setError(t("errorSave"));
    } finally {
      setAddingLink(false);
    }
  };

  const handleDelete = async (row: Row) => {
    setConfirmDelete(null);
    try {
      await sightingMedia.remove(sightingId, row.id as number);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError(t("errorDelete"));
    }
  };

  /**
   * Downloads the converted file the API stores, not a re-encode of it. Same
   * blob dance as the photo uploader: the media host is a different origin, so
   * a plain `download` attribute on an anchor pointing at it is ignored.
   */
  const handleDownload = useCallback(async (src: string) => {
    const filename = src.split("/").pop()?.split("?")[0] || "video.mp4";
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const objectUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // Media served without CORS headers can't be read as a blob (the admin
      // routes also run under COEP `require-corp`) - fall back to opening the
      // file in a new tab so it stays reachable.
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }, []);

  return (
    <Box flexDirection="column" gap={16}>
      {error && (
        <Typography variant="body" color="var(--error, #dc2626)">
          {error}
        </Typography>
      )}

      {/* ── Clips: uploaded video files ───────────────────────────────────── */}
      <SectionHeader title={t("mediaClips")} intro={t("mediaClipsIntro")} />

      <div
        className={`aiu__dropzone${isDragOver ? " aiu__dropzone--active" : ""}`}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setIsDragOver(false);
          if (!uploading) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !uploading && videoInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) =>
          e.key === "Enter" && !uploading && videoInput.current?.click()
        }
        aria-label={t("mediaChooseVideo")}
      >
        <span className="aiu__dropzone-icon">🎬</span>
        <Typography
          as="span"
          variant="body"
          fontWeight={600}
          color="var(--foreground)"
        >
          {t("mediaVideoDropzone")}
        </Typography>
        <Typography as="span" variant="caption" color="var(--foreground)">
          {t("mediaVideoHelp")}
        </Typography>
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          className="aiu__input"
          onChange={(e) => void handleFiles(e.target.files)}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* A real percentage, because this is the one upload here that can take
          minutes - an indeterminate bar over a 2 GB transfer reads as a hang. It
          tracks the *upload* only; the transcode that follows is reported by the
          tile the row gets. */}
      {uploading && (
        <ProgressBar value={progress} label={t("mediaVideoUploading")} />
      )}

      {loading ? (
        <Typography variant="body">{t("loading")}</Typography>
      ) : videos.length === 0 ? (
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("galleryEmpty")}
        </Typography>
      ) : (
        <Box
          display="grid"
          gap={12}
          styles={{
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          }}
        >
          {videos.map((row) => (
            <VideoTile
              key={String(row.id)}
              row={row}
              onDownload={handleDownload}
              onDelete={() => setConfirmDelete(row)}
            />
          ))}
        </Box>
      )}

      {/* ── Video links ───────────────────────────────────────────────────── */}
      <SectionHeader title={t("mediaLinks")} intro={t("mediaLinksIntro")} />

      {links.length > 0 && (
        <Box flexDirection="column" gap={8}>
          {links.map((row) => {
            const href = String(row.source_url ?? row.url ?? "");
            return (
              <Card key={String(row.id)} padding={12}>
                <Box gap={12} alignItems="center" flexWrap="wrap">
                  {/* `minWidth: 0` so a long URL wraps inside the card rather
                      than forcing the row wider than it. */}
                  <Box flexGrow={1} styles={{ minWidth: 0 }}>
                    <Typography
                      variant="body"
                      margin={0}
                      styles={{ wordBreak: "break-all" }}
                    >
                      {href}
                    </Typography>
                  </Box>
                  <IconButton
                    icon="/icons/fullscreen.svg"
                    size="sm"
                    href={href}
                    target="_blank"
                    aria-label={t("mediaOpenLink")}
                    title={t("mediaOpenLink")}
                  />
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
        </Box>
      )}

      <Box flexDirection="column" gap={12}>
        <TextInput
          label={t("mediaUrl")}
          type="url"
          value={url}
          onChange={setUrl}
          helperText={t("mediaUrlHelp")}
          // An un-prevented Enter inside AdminForm's <form> would save the whole
          // record instead of adding the link.
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void handleAddLink();
          }}
        />
        <Box>
          <Button
            text={`+ ${t("galleryAdd")}`}
            size="md"
            type="button"
            onClick={() => void handleAddLink()}
            disabled={addingLink || url.trim() === ""}
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

/**
 * One uploaded clip: the player itself when the transcode has landed, the
 * conversion state when it has not, and the two actions under it.
 *
 * A native `<video>` rather than `HeroVideo`: this is a thumbnail in a form, so
 * it wants the browser's own controls and `preload="metadata"` (which fetches a
 * few KB rather than the clip) - not react-player's playback surface.
 */
function VideoTile({
  row,
  onDownload,
  onDelete,
}: {
  row: Row;
  onDownload: (src: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Admin");
  const status = (row.processing_status as ProcessingStatus) ?? "ready";
  const src = row.source_url ? String(row.source_url) : null;
  const poster = row.poster ? String(row.poster) : undefined;
  const ready = status === "ready" && Boolean(src);

  return (
    <Box flexDirection="column" gap={8}>
      <Box
        borderRadius={8}
        backgroundColor="#000000"
        styles={{
          position: "relative",
          overflow: "hidden",
          aspectRatio: "16 / 9",
        }}
      >
        {ready && src ? (
          <video
            src={src}
            poster={poster}
            controls
            preload="metadata"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        ) : (
          <Box
            width="100%"
            height="100%"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            gap={8}
            padding={12}
            styles={{ position: "absolute", inset: 0 }}
          >
            {status === "failed" ? (
              <Typography variant="caption" color="#e5e7eb" textAlign="center">
                {t("mediaVideoFailed")}
              </Typography>
            ) : (
              <>
                <Spinner size={22} />
                <Typography
                  variant="caption"
                  color="#e5e7eb"
                  textAlign="center"
                >
                  {t("mediaVideoProcessing")}
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>

      <Box alignItems="center" justifyContent="space-between" gap={8}>
        <Typography
          variant="caption"
          margin={0}
          color="var(--muted-foreground, #6b7280)"
        >
          {formatDuration(row.duration_seconds)}
        </Typography>
        <Box gap={6}>
          {/* Only a converted clip has a file to fetch. */}
          {ready && src && (
            <IconButton
              icon="/icons/download.svg"
              size="sm"
              aria-label={t("mediaDownloadVideo")}
              title={t("mediaDownloadVideo")}
              onClick={() => onDownload(src)}
            />
          )}
          <IconButton
            icon="/icons/delete-trash-icon.svg"
            kind="error"
            size="sm"
            aria-label={t("mediaDeleteVideo")}
            title={t("mediaDeleteVideo")}
            onClick={onDelete}
          />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * The uppercase rule `AdminForm` puts above each pair group, so these two
 * sections read as part of the same form rather than panels bolted onto it.
 */
function SectionHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <Box flexDirection="column" gap={12} paddingTop={16}>
      <Box
        paddingBottom={2}
        styles={{
          borderBottom:
            "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
        }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
        >
          {title}
        </Typography>
      </Box>
      <Typography variant="body" margin={0}>
        {intro}
      </Typography>
    </Box>
  );
}

/** `mm:ss`, or nothing at all for a row whose duration was never read. */
function formatDuration(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
