/* ------------------------------------------------------------------ */
/*  Shared enums / union types                                         */
/* ------------------------------------------------------------------ */

export type SunoModel = 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5' | 'V5_5';

/** Returned by GET /api/v1/generate/record-info */
export type TaskStatus =
  | 'PENDING'
  | 'TEXT_SUCCESS'
  | 'FIRST_SUCCESS'
  | 'SUCCESS'
  | 'CREATE_TASK_FAILED'
  | 'GENERATE_AUDIO_FAILED'
  | 'CALLBACK_EXCEPTION'
  | 'SENSITIVE_WORD_ERROR';

/** Which Suno endpoint created the task */
export type OperationType =
  | 'generate'
  | 'extend'
  | 'upload_cover'
  | 'upload_extend'
  | 'mashup'
  | 'add_instrumental'
  | 'add_vocals'
  | 'replace_section'
  | 'sounds';

/** Callback stage sent by Suno */
export type CallbackType = 'text' | 'first' | 'complete' | 'error';

export type PersonaModel = 'style_persona' | 'voice_persona';

export type VocalGender = 'm' | 'f';

export type SoundKey =
  | 'Any'
  | 'Cm' | 'C#m' | 'Dm' | 'D#m' | 'Em' | 'Fm' | 'F#m'
  | 'Gm' | 'G#m' | 'Am' | 'A#m' | 'Bm'
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#'
  | 'G' | 'G#' | 'A' | 'A#' | 'B';

/* ------------------------------------------------------------------ */
/*  Audio item — embedded in MusicTaskDocument.sunoData               */
/* ------------------------------------------------------------------ */

/** One generated track returned by the Suno API (callback or polling). */
export interface SunoAudioItem {
  /** Suno's unique audio identifier (audioId). */
  id: string;
  audioUrl: string | null;
  sourceAudioUrl: string | null;
  streamAudioUrl: string | null;
  sourceStreamAudioUrl: string | null;
  imageUrl: string | null;
  sourceImageUrl: string | null;
  prompt: string | null;
  modelName: string | null;
  title: string | null;
  tags: string | null;
  /** ISO-8601 string as returned by Suno. */
  createTime: string | null;
  duration: number | null;
}
