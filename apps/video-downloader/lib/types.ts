import type {
  DownloadVideoOptions,
  DownloadVideoError,
} from '@repo/helpers/download-video';

/* ── Input ─────────────────────────────────────────── */

/** Fields sent to the server to start a download — picked from DownloadVideoOptions. */
export type VideoDownloadInput = Pick<
  DownloadVideoOptions,
  'url' | 'justAudio' | 'checkCodec' | 'iosDevice' | 'maxHeight'
> & {
  /** When true, captions/subtitles are downloaded along with the video. */
  captionsEnabled?: boolean;
  /** Direct URL to an SRT caption file selected by the user. */
  captionUrl?: string;
};

/* ── Result metadata ───────────────────────────────── */

/** Metadata fields extracted from a completed download, shared across DB / polling / frontend. */
export interface VideoResultFields {
  file: string | null;
  name: string | null;
  isH265: boolean | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  /** Source video FPS as detected by ffprobe. `null` when unavailable. */
  sourceFps: number | null;
  /** Video width in pixels. `null` for audio-only or when unavailable. */
  width: number | null;
  /** Video height in pixels. `null` for audio-only or when unavailable. */
  height: number | null;
  /** Filename of the saved captions file (e.g. `uuid.txt`). `null` when no captions were downloaded. */
  captionsFile: string | null;
}

/* ── Status ────────────────────────────────────────── */

/** Server-side task statuses (DB + polling). */
export type TaskStatus = 'pending' | 'downloading' | 'done' | 'error';

/** Client-side statuses extend task statuses with local processing states. */
export type VideoStatus = TaskStatus | 'queued' | 'processing' | 'converting' | 'burning';

/* ── Burn captions config ──────────────────────────── */

export interface BurnCaptionsConfig {
  alignment: number;
  marginV: number;
  fontSize: number;
  primaryColor: string;
  showBackground: boolean;
  bgColor: string;
  bgOpacity: number;
}

/* ── Re-exports for convenience ────────────────────── */

export type { DownloadVideoError };
