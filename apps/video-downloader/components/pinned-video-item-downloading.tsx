"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import type { DownloadVideoError } from "@repo/helpers/download-video";
import { usePollTask, type TaskData } from "./use-poll-task";
import type { StoredVideo } from "./use-video-store";
import {
  STATUS_COLORS,
  resolveMediaUrl,
  triggerBrowserDownload,
  downloadThumbnail,
  VideoCardHeader,
  VideoDetailsPanel,
  VideoFooterLink,
  isIOS,
  PlatformIconBg,
} from "./video-item-shared";
import { useOPFSUrls } from "./opfs-url-context";
import { writeToOPFS, readFromOPFS, deleteFromOPFS } from "@/lib/opfs";
import { setCreditsBalance } from "./use-credits-store";
import "./video-item.css";

/* ── API types ──────────────────────────────────────── */

interface TaskCreateResponse {
  task: { _id: string; status: string };
  creditsRemaining?: number;
  error?: DownloadVideoError;
}

/* ── OPFS migration helpers ─────────────────────────── */

interface MigrationParams {
  file: string;
  name: string | null;
  thumbnail: string | null;
  /** Raw filename (not the /api/media/ path). */
  captionsFile: string | null;
  /** Raw filename (not the /api/media/ path). */
  commentsFile: string | null;
  taskId: string | null;
}

function extractMigrationParams(video: StoredVideo): MigrationParams | null {
  if (!video.file) return null;
  return {
    file: video.file,
    name: video.name,
    thumbnail: video.thumbnail,
    // Stored as /api/media/<filename> - extract the raw filename
    captionsFile: video.captionsFile?.split("/").pop() ?? null,
    commentsFile: video.commentsFile?.split("/").pop() ?? null,
    taskId: video.taskId,
  };
}

/* ── Props ──────────────────────────────────────────── */

export interface PinnedVideoItemDownloadingProps {
  video: StoredVideo;
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onComplete: (uuid: string) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function PinnedVideoItemDownloading({
  video,
  onUpdate,
  onComplete,
  onRemove,
}: PinnedVideoItemDownloadingProps) {
  const t = useTranslations("VideoGrid");
  const { registerUrls } = useOPFSUrls();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [opfsMigrating, setOpfsMigrating] = useState(false);
  const [opfsProgress, setOpfsProgress] = useState<number | undefined>(
    undefined,
  );
  const [copying, setCopying] = useState(false);

  const downloadTriggered = useRef(false);
  const pollResumeChecked = useRef(false);
  const migrationInFlight = useRef(false);
  const migrationRetryCount = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Always-current references used by stable event listeners and timer callbacks
  const videoRef = useRef(video);
  const runMigrationRef = useRef<((p: MigrationParams) => void) | null>(null);
  useEffect(() => {
    videoRef.current = video;
  });

  const { startPolling, stopPolling } = usePollTask();

  const handleCopy = useCallback(async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(video.originalURL);
      setTimeout(() => setCopying(false), 1200);
    } catch {
      setCopying(false);
    }
  }, [video.originalURL]);

  const isActive =
    video.status === "pending" ||
    video.status === "downloading" ||
    video.status === "queued";

  const displayName =
    video.fulltitle ??
    video.name ??
    video.uploader ??
    (video.justAudio ? t("untitledAudio") : t("untitledVideo"));

  /* ── OPFS migration ─────────────────────────────────── */
  const runOpfsMigration = useCallback(
    async (params: MigrationParams) => {
      if (migrationInFlight.current || !mountedRef.current) return;
      migrationInFlight.current = true;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      setOpfsMigrating(true);
      setOpfsProgress(undefined);

      const { file, name, thumbnail, captionsFile, commentsFile, taskId } =
        params;
      let thumbKey: string | null = null;
      let captionsKey: string | null = null;
      let commentsKey: string | null = null;
      let scheduleRetry = false;

      try {
        // Stream video bytes and track download progress
        const videoRes = await fetch(resolveMediaUrl(`/api/media/${file}`));
        if (!videoRes.ok) {
          throw Object.assign(
            new Error(`video fetch failed: ${videoRes.status}`),
            {
              httpStatus: videoRes.status,
            },
          );
        }

        const cl = videoRes.headers.get("content-length");
        const totalSize = cl ? parseInt(cl, 10) : null;
        let received = 0;
        const reader = videoRes.body!.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          if (totalSize && mountedRef.current) {
            setOpfsProgress(Math.round((received / totalSize) * 100));
          }
        }

        // Cast needed: stream reader returns Uint8Array<ArrayBufferLike> but
        // Blob only accepts ArrayBufferView<ArrayBuffer> - safe in practice.
        const videoBlob = new Blob(chunks as unknown as BlobPart[], {
          type: videoRes.headers.get("content-type") ?? "video/mp4",
        });
        await writeToOPFS(file, videoBlob);
        if (mountedRef.current) setOpfsProgress(100);

        if (thumbnail) {
          try {
            const r = await fetch(resolveMediaUrl(`/api/media/${thumbnail}`));
            if (r.ok) {
              thumbKey = `thumb_${thumbnail}`;
              await writeToOPFS(thumbKey, await r.blob());
            }
          } catch {}
        }

        if (captionsFile) {
          try {
            const r = await fetch(
              resolveMediaUrl(`/api/media/${captionsFile}`),
            );
            if (r.ok) {
              captionsKey = `captions_${captionsFile}`;
              await writeToOPFS(captionsKey, await r.blob());
            }
          } catch {}
        }

        if (commentsFile) {
          try {
            const r = await fetch(
              resolveMediaUrl(`/api/media/${commentsFile}`),
            );
            if (r.ok) {
              commentsKey = `comments_${commentsFile}`;
              await writeToOPFS(commentsKey, await r.blob());
            }
          } catch {}
        }

        const videoFile = await readFromOPFS(file);
        const videoUrl = URL.createObjectURL(videoFile);
        let thumbnailUrl: string | null = null;
        if (thumbKey) {
          try {
            thumbnailUrl = URL.createObjectURL(await readFromOPFS(thumbKey));
          } catch {}
        }
        registerUrls(video.uuid, { videoUrl, thumbnailUrl });

        // Mark opfsStored: true BEFORE deleting the server file so a reload
        // mid-delete can still re-fetch the video on next visit.
        onUpdate(video.uuid, {
          status: "done",
          opfsKey: file,
          opfsThumbnailKey: thumbKey,
          opfsCaptionsKey: captionsKey,
          opfsCommentsKey: commentsKey,
          opfsStored: true,
          downloadURL: `opfs://${file}`,
          fileSize: videoBlob.size,
        });

        if (taskId) {
          fetch(`/api/download-video/${taskId}`, { method: "DELETE" })
            .then((r) => {
              if ((r.ok || r.status === 404) && mountedRef.current) {
                onUpdate(video.uuid, { serverFileDeleted: true });
              }
            })
            .catch(() => {});
        }

        if (video.autoDownload) {
          triggerBrowserDownload(
            videoUrl,
            `${name ?? "video"}-${Date.now()}-${file}`,
          );
        }

        onComplete(video.uuid);
      } catch (err) {
        console.error("OPFS migration failed:", err);
        const isQuotaError =
          err instanceof DOMException && err.name === "QuotaExceededError";
        // 4xx means the file is gone from the server (e.g. R2 upload never
        // completed). Retrying will never succeed - treat as terminal.
        const httpStatus = (err as { httpStatus?: number }).httpStatus;
        const isClientError =
          httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500;
        const MAX_MIGRATION_RETRIES = 3;
        const isTerminal =
          isQuotaError ||
          isClientError ||
          migrationRetryCount.current >= MAX_MIGRATION_RETRIES;

        if (isTerminal) {
          await deleteFromOPFS(file).catch(() => {});
          if (thumbKey) await deleteFromOPFS(thumbKey).catch(() => {});
          if (captionsKey) await deleteFromOPFS(captionsKey).catch(() => {});
          if (isQuotaError || isClientError) {
            if (taskId) {
              fetch(`/api/download-video/${taskId}`, {
                method: "DELETE",
              }).catch(() => {});
            }
          }
          if (mountedRef.current) {
            onUpdate(video.uuid, {
              status: "error",
              error: isQuotaError ? t("errorStorageQuota") : t("errorGeneric"),
              opfsKey: null,
              opfsThumbnailKey: null,
              opfsCaptionsKey: null,
              opfsStored: false,
              downloadURL: null,
              ...(isQuotaError || isClientError
                ? { serverFileDeleted: true }
                : {}),
            });
          }
          onComplete(video.uuid);
        } else {
          // Transient error (network blip, background tab fetch killed):
          // keep status as 'downloading' so the visibilitychange handler or
          // the retry timer can restart the migration without losing the video.
          migrationRetryCount.current += 1;
          scheduleRetry = true;
        }
      } finally {
        if (mountedRef.current) {
          setOpfsProgress(undefined);
          setOpfsMigrating(false);
        }
        if (scheduleRetry) {
          // Retry after a delay; skip if tab is backgrounded - the
          // visibilitychange handler will pick it up when the user returns.
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            migrationInFlight.current = false;
            if (mountedRef.current && document.visibilityState === "visible") {
              runMigrationRef.current?.(params);
            }
          }, 5000);
        } else {
          migrationInFlight.current = false;
        }
      }
    },
    [onUpdate, onComplete, video.uuid, video.autoDownload, registerUrls, t],
  );

  // Keep ref current so stable callbacks (timer, visibilitychange) always
  // call the latest version without re-registering listeners. Written in an
  // effect rather than during render (refs must not be mutated while rendering).
  useEffect(() => {
    runMigrationRef.current = (p) => void runOpfsMigration(p);
  });

  /* ── Handle completed download ─────────────────────── */
  const handleTaskDone = useCallback(
    (task: TaskData) => {
      const file = task.file;
      const name = task.name;
      const downloadURL = file ? `/api/media/${file}` : null;

      // Persist all server-returned metadata. Status stays 'downloading' until
      // the OPFS migration (or non-OPFS path below) fully completes so this
      // component remains mounted during the save phase.
      onUpdate(video.uuid, {
        file: file ?? null,
        name: name ?? null,
        fulltitle: task.fulltitle ?? null,
        downloadURL,
        thumbnail: task.thumbnail ?? null,
        duration: task.duration ?? null,
        uploader: task.uploader ?? null,
        uploader_id: task.uploader_id ?? null,
        uploader_url: task.uploader_url ?? null,
        uploadTimestamp: task.uploadTimestamp ?? null,
        description: task.description ?? null,
        tags: task.tags ?? null,
        isH265: task.isH265 ?? false,
        sourceFps: task.sourceFps ?? null,
        width: task.width ?? null,
        height: task.height ?? null,
        captionsFile: task.captionsFile
          ? `/api/media/${task.captionsFile}`
          : null,
        captionUrl: null,
        commentsFile: task.commentsFile
          ? `/api/media/${task.commentsFile}`
          : null,
        operationCredits: task.operationCredits ?? null,
      });

      if (video.opfsEnabled && file) {
        void runOpfsMigration({
          file,
          name: name ?? null,
          thumbnail: task.thumbnail ?? null,
          captionsFile: task.captionsFile ?? null,
          commentsFile: task.commentsFile ?? null,
          taskId: task._id,
        });
        return;
      }

      // Non-OPFS path: HEAD for file size, trigger browser download if requested.
      void (async () => {
        if (file) {
          try {
            const headRes = await fetch(resolveMediaUrl(`/api/media/${file}`), {
              method: "HEAD",
            });
            const cl = headRes.headers.get("content-length");
            if (cl) onUpdate(video.uuid, { fileSize: parseInt(cl, 10) });
          } catch {}
        }
        if (video.autoDownload && downloadURL && file) {
          triggerBrowserDownload(
            downloadURL,
            `${name ?? (video.justAudio ? "audio" : "video")}-${Date.now()}-${file}`,
          );
          if (video.justAudio) {
            const thumbSrc = task.thumbnail
              ? resolveMediaUrl(`/api/media/${task.thumbnail}`)
              : null;
            if (thumbSrc) downloadThumbnail(thumbSrc, name);
          }
        }
        onUpdate(video.uuid, { status: "done" });
        onComplete(video.uuid);
      })();
    },
    [
      onUpdate,
      onComplete,
      video.uuid,
      video.opfsEnabled,
      video.autoDownload,
      video.justAudio,
      runOpfsMigration,
    ],
  );

  /* ── Poll task ──────────────────────────────────────── */
  const pollForTask = useCallback(
    (taskId: string) => {
      startPolling({
        taskId,
        onUpdate: (task) => {
          if (task.status === "done") {
            handleTaskDone(task);
          } else if (task.status === "error") {
            onUpdate(video.uuid, {
              status: "error",
              error: task.error?.message ?? "Download failed",
            });
          }
        },
      });
    },
    [startPolling, handleTaskDone, onUpdate, video.uuid],
  );

  /* ── Start download ─────────────────────────────────── */
  const handleDownload = useCallback(async () => {
    onUpdate(video.uuid, { error: null });
    try {
      const creditsKey = localStorage.getItem("vd_credits_key") ?? "";
      const downloadHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (creditsKey) downloadHeaders["x-credits-key"] = creditsKey;
      const res = await fetch("/api/download-video", {
        method: "POST",
        headers: downloadHeaders,
        body: JSON.stringify({
          url: video.originalURL,
          justAudio: video.justAudio,
          checkCodec: video.platform === "tiktok",
          iosDevice: isIOS(),
          ...(video.maxHeight != null && { maxHeight: video.maxHeight }),
          ...(video.captionsEnabled && { captionsEnabled: true }),
          ...(video.captionUrl && { captionUrl: video.captionUrl }),
          ...(video.commentsEnabled && { commentsEnabled: true }),
          ...(video.commentsEnabled &&
            video.maxComments != null && { maxComments: video.maxComments }),
          ...(video.metadataEnabled && { metadataEnabled: true }),
        }),
      });
      const data: TaskCreateResponse = await res.json();
      if (!res.ok || data.error) {
        onUpdate(video.uuid, {
          status: "error",
          error: data.error?.message ?? "Failed to start download",
        });
        return;
      }
      if (data.creditsRemaining !== undefined) {
        setCreditsBalance(data.creditsRemaining);
      }
      const taskId = data.task._id;
      onUpdate(video.uuid, { status: "downloading", taskId, error: null });
      pollForTask(taskId);
    } catch {
      onUpdate(video.uuid, { status: "error", error: t("errorGeneric") });
    }
  }, [
    onUpdate,
    video.uuid,
    video.originalURL,
    video.justAudio,
    video.platform,
    video.maxHeight,
    video.captionsEnabled,
    video.captionUrl,
    video.commentsEnabled,
    video.maxComments,
    video.metadataEnabled,
    pollForTask,
    t,
  ]);

  /* ── Auto-trigger download for newly added items ─────── */
  useEffect(() => {
    if (video.status === "pending" && !downloadTriggered.current) {
      downloadTriggered.current = true;
      queueMicrotask(() => handleDownload());
    }
  }, [video.status, handleDownload]);

  /* ── Resume polling after page refresh ──────────────── */
  useEffect(() => {
    if (pollResumeChecked.current) return;
    pollResumeChecked.current = true;
    if (video.status === "downloading" && video.taskId) {
      pollForTask(video.taskId);
    }
  }, [video.status, video.taskId, pollForTask]);

  /* ── Stop polling on unmount ─────────────────────────── */
  useEffect(() => {
    const taskId = video.taskId;
    return () => {
      if (taskId) stopPolling(taskId);
    };
  }, [video.taskId, stopPolling]);

  /* ── Warn before closing before task ID is established ── */
  useEffect(() => {
    if (video.status !== "pending" && video.status !== "queued") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [video.status]);

  /* ── Auto-move errored items to completed ─────────────── */
  useEffect(() => {
    if (video.status === "error") onComplete(video.uuid);
  }, [video.status, video.uuid, onComplete]);

  /* ── Restart migration when tab becomes visible ─────── */
  useEffect(() => {
    const handleVisibility = () => {
      const v = videoRef.current;
      if (
        document.visibilityState === "visible" &&
        v.opfsEnabled &&
        !v.opfsStored &&
        v.file &&
        !migrationInFlight.current
      ) {
        const params = extractMigrationParams(v);
        if (params) runMigrationRef.current?.(params);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /* ── Cleanup on unmount ─────────────────────────────── */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const showProgressBar = isActive || opfsMigrating;

  return (
    <Box
      elevation={2}
      borderRadius={14}
      className="vi-card"
      flexDirection="column"
      styles={{ overflow: "hidden" }}
    >
      <PlatformIconBg
        platform={video.platform}
        position="bottom-left"
        widthPct={50}
        iconMarginLeft={20}
      />
      {/* ── Status bar ──────────────────────────────── */}
      <Box
        className="vi-status-bar"
        backgroundColor={STATUS_COLORS[video.status]}
      />
      {/* ── Header row ──────────────────────────────── */}
      <VideoCardHeader
        video={video}
        displayName={displayName}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((p) => !p)}
        t={t}
      />
      {/* ── Details panel (collapsible) ───────────────── */}
      {detailsOpen ? (
        <VideoDetailsPanel
          video={video}
          ffmpegStatus="idle"
          ffmpegProgress={null}
          ffmpegLastError={null}
          ffmpegLastWarning={null}
          ffmpegProcessingTime={null}
          ffmpegCores={null}
          uploading={false}
          t={t}
        />
      ) : null}
      {/* ── Progress bar ────────────────────────────── */}
      {showProgressBar ? (
        <ProgressBar
          margin="0"
          value={opfsMigrating ? opfsProgress : undefined}
        />
      ) : null}
      {/* ── Status hint ─────────────────────────────── */}
      {opfsMigrating ? (
        <Typography variant="caption" className="vi-ffmpeg-hint">
          {opfsProgress !== undefined
            ? t("savingToDeviceWithPct", { pct: opfsProgress })
            : t("savingToDevice")}
        </Typography>
      ) : video.status === "pending" ? (
        <Typography variant="caption" className="vi-ffmpeg-hint">
          {t("downloadPending")}
        </Typography>
      ) : video.status === "downloading" ? (
        <Typography variant="caption" className="vi-ffmpeg-hint">
          {t("downloadActive")}
        </Typography>
      ) : null}
      {/* ── Footer ──────────────────────────────────── */}
      <Box className="vi-footer">
        <VideoFooterLink video={video} />
        <Box
          className="vi-actions"
          display="flex"
          justifyContent="space-evenly"
        >
          <Button
            unstyled
            className="vi-icon-btn"
            onClick={() => setConfirmRemove(true)}
            aria-label={t("delete")}
            title={t("delete")}
            icon="/icons/delete-video.svg"
            iconSize="15px"
            iconColor="var(--foreground, #171717)"
          />
          <Button
            unstyled
            className="vi-icon-btn"
            onClick={handleCopy}
            aria-label={t("copyLink")}
            title={copying ? t("copied") : t("copyLink")}
            icon="/icons/url.svg"
            iconSize="15px"
            iconColor={
              copying ? "var(--accent, #06b6d4)" : "var(--foreground, #171717)"
            }
          />
        </Box>
      </Box>
      {/* ── Delete confirmation ──────────────────────── */}
      {confirmRemove ? (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          okCallback={() => {
            setConfirmRemove(false);
            if (video.taskId) {
              stopPolling(video.taskId);
              fetch(`/api/download-video/${video.taskId}`, {
                method: "DELETE",
              }).catch(console.error);
            }
            onRemove(video.uuid);
          }}
          cancelCallback={() => setConfirmRemove(false)}
        />
      ) : null}
    </Box>
  );
}

export default PinnedVideoItemDownloading;
