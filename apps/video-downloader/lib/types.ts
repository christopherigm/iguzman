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
  /** When true, comments are downloaded and saved as a separate JSON file. */
  commentsEnabled?: boolean;
  /** Maximum number of top-level comments to download. */
  maxComments?: number;
};

/* ── Operation credits ─────────────────────────────── */

/** Per-operation server-processing credit costs, computed after download based on resolution + duration. */
export interface OperationCredits {
  scaleDown: number;
  removeBlackBars: number;
  convertToH264: number;
  convertToH265: number;
  burnSubtitles: number;
  interpolateFps2x: number;
  interpolateFps4x: number;
  interpolateFps8x: number;
}

/* ── Result metadata ───────────────────────────────── */

/** Metadata fields extracted from a completed download, shared across DB / polling / frontend. */
export interface VideoResultFields {
  file: string | null;
  name: string | null;
  /** Full title as returned by yt-dlp (untruncated). Falls back to `name` on the frontend for older entries. */
  fulltitle: string | null;
  isH265: boolean | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  /** Platform-specific user handle (e.g. `@username`). `null` when unavailable. */
  uploader_id: string | null;
  /** URL to the uploader's profile page. `null` when unavailable. */
  uploader_url: string | null;
  /** Upload timestamp as Unix seconds. Coalesced from yt-dlp `timestamp` → parsed `upload_date`. `null` when unavailable. */
  uploadTimestamp: number | null;
  /** Video description as returned by the platform. `null` when unavailable. */
  description: string | null;
  /** Tags / hashtags associated with the video. `null` when unavailable. */
  tags: string[] | null;
  /** Source video FPS as detected by ffprobe. `null` when unavailable. */
  sourceFps: number | null;
  /** Video width in pixels. `null` for audio-only or when unavailable. */
  width: number | null;
  /** Video height in pixels. `null` for audio-only or when unavailable. */
  height: number | null;
  /** Filename of the saved captions file (e.g. `uuid.txt`). `null` when no captions were downloaded. */
  captionsFile: string | null;
  /** Filename of the saved comments JSON file (e.g. `uuid.comments.json`). `null` when no comments were downloaded. */
  commentsFile: string | null;
  /** Remaining ScrapeCreators API credits after a comments fetch. `null` when not applicable. */
  scrapeCreditsRemaining: number | null;
  /** Per-operation server credit costs computed after download. `null` until the download completes. */
  operationCredits: OperationCredits | null;
}

/* ── Status ────────────────────────────────────────── */

/** Server-side task statuses (DB + polling). */
export type TaskStatus =
  | 'pending'
  | 'downloading'
  | 'processing'
  | 'converting'
  | 'burning'
  | 'translating'
  | 'uploading'
  | 'done'
  | 'error';

/** Client-side statuses extend task statuses with local processing states. */
export type VideoStatus =
  | TaskStatus
  | 'queued'
  | 'processing'
  | 'converting'
  | 'burning'
  | 'translating';

/* ── Burn captions config ──────────────────────────── */

export type BurnCaptionsAnimationType =
  | 'none'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'blur'
  | 'zoom'
  | 'karaoke';

export interface BurnCaptionsAnimationConfig {
  type: BurnCaptionsAnimationType;
  /** Fade: fade-in duration in ms. Default 300. */
  fadeInMs?: number;
  /** Fade: fade-out duration in ms. Default 200. */
  fadeOutMs?: number;
  /** SlideUp / SlideDown: pixel offset from final anchor. Default 20. */
  slideOffset?: number;
  /** SlideUp / SlideDown: travel duration in ms. Default 300. */
  slideDurationMs?: number;
  /** Blur: initial blur strength. Default 15. */
  blurStrength?: number;
  /** Blur: duration in ms to clear blur to 0. Default 300. */
  blurDurationMs?: number;
  /** Zoom: duration in ms to scale text from 0→100%. Default 300. */
  zoomDurationMs?: number;
  /** Karaoke: ASS tag variant. Default 'kf' (sweep). */
  karaokeMode?: 'k' | 'kf' | 'ko';
  /** Karaoke: highlight colour in ASS &HAABBGGRR format. Default yellow. */
  karaokeHighlightColour?: string;
}

export type BurnCaptionsFontStyle =
  | 'normal'
  | 'bold'
  | 'italic'
  | 'bold-italic';

export interface BurnCaptionsConfig {
  alignment: number;
  marginV: number;
  fontSize: number;
  /** Font weight/style combination applied to subtitles. Default 'normal'. */
  fontStyle?: BurnCaptionsFontStyle;
  primaryColor: string;
  /** ASS BorderStyle: 1 = outline, 3 = opaque box. */
  borderStyle: 1 | 3;
  bgColor: string;
  bgOpacity: number;
  /** When true, the SRT content is translated via Groq before burning. */
  translate?: boolean;
  /** BCP-47 language code to translate subtitles into (e.g. 'en', 'es'). */
  translateTo?: string;
  /** Outline stroke thickness in ASS pixels (borderStyle 1 only). Default 2. */
  outlineThickness?: number;
  /** Animation applied to subtitle entries. */
  animation?: BurnCaptionsAnimationConfig;
}

/* ── Re-exports for convenience ────────────────────── */

export type { DownloadVideoError };
