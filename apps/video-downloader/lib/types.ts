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
export type TaskStatus =
  | 'pending'
  | 'downloading'
  | 'processing'
  | 'converting'
  | 'burning'
  | 'translating'
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
