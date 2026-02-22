import type {
  DownloadVideoOptions,
  DownloadVideoError,
} from '@repo/helpers/download-video';

/* ── Input ─────────────────────────────────────────── */

/** Fields sent to the server to start a download — picked from DownloadVideoOptions. */
export type VideoDownloadInput = Pick<
  DownloadVideoOptions,
  'url' | 'justAudio' | 'checkCodec'
>;

/* ── Result metadata ───────────────────────────────── */

/** Metadata fields extracted from a completed download, shared across DB / polling / frontend. */
export interface VideoResultFields {
  file: string | null;
  name: string | null;
  isH265: boolean | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
}

/* ── Status ────────────────────────────────────────── */

/** Server-side task statuses (DB + polling). */
export type TaskStatus = 'pending' | 'downloading' | 'done' | 'error';

/** Client-side statuses extend task statuses with local processing states. */
export type VideoStatus = TaskStatus | 'queued' | 'processing' | 'converting';

/* ── Re-exports for convenience ────────────────────── */

export type { DownloadVideoError };
