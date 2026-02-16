import { readFile } from 'fs/promises';
import { srtServerURL } from '@repo/helpers/constants';
import copyFile from '@repo/helpers/copy-file';
import deleteMediaFile from '@repo/helpers/delete-media-file';

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Maximum number of retry attempts when the SRT server is busy. */
const MAX_RETRIES = 20;

/** Delay in milliseconds between retry attempts. */
const RETRY_DELAY_MS = 5000;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Response shape returned by the SRT transcription server. */
interface SrtServerResponse {
  status: string;
}

/** Options for {@link sendSrtRequest}. */
interface SrtRequestOptions {
  /** Path to the source audio/video file on the server. */
  src: string;
  /** Language code for transcription (e.g. `"en"`, `"es"`). */
  language?: string;
  /** Maximum number of words per subtitle line. */
  maxWordsPerLine?: number;
  /** Whisper model size to use for transcription (e.g. `"base"`, `"small"`). */
  model?: string;
}

/** Options for {@link generateSrt}. */
interface GenerateSrtOptions extends SrtRequestOptions {
  /** Relative destination path for the generated SRT file. */
  dest: string;
  /** Directory where media files are stored. Defaults based on `NODE_ENV`. */
  outputFolder?: string;
}

/** Result returned by {@link generateSrt}. */
interface GenerateSrtResult {
  /** Relative media path to the SRT file (e.g. `media/video.srt`). */
  file: string;
  /** Raw SRT file contents as a string. */
  srt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Returns a promise that resolves after {@link ms} milliseconds. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a transcription request to the SRT server.
 *
 * When the server responds with a `"busy"` status, the request is retried
 * up to {@link MAX_RETRIES} times with a {@link RETRY_DELAY_MS} pause
 * between attempts.
 *
 * @returns The inferred SRT file path (source extension replaced with `.srt`).
 * @throws If the server remains busy after all retries or the request fails.
 */
const sendSrtRequest = async ({
  src,
  language = 'en',
  maxWordsPerLine,
  model = 'base',
}: SrtRequestOptions): Promise<string> => {
  const body = {
    name: src,
    language,
    max_words_per_line: maxWordsPerLine,
    model,
    production: NODE_ENV === 'production',
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(srtServerURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: SrtServerResponse = await response.json();

    if (data.status !== 'busy') {
      return src.replace(/\.(wav|mp4)$/, '.srt');
    }

    console.warn(
      `SRT server busy, retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})`,
    );
    await delay(RETRY_DELAY_MS);
  }

  throw new Error(
    `SRT server remained busy after ${MAX_RETRIES} retries for "${src}"`,
  );
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generates an SRT subtitle file by sending the source media to a
 * transcription server, then copies the result to the destination path.
 *
 * @param options - Generation options including source, destination, and model settings.
 * @returns The relative media path and raw content of the generated SRT file.
 */
const generateSrt = async ({
  src,
  dest,
  language = 'en',
  outputFolder = NODE_ENV === 'production' ? '/app/media' : 'public/media',
  maxWordsPerLine,
  model = 'base',
}: GenerateSrtOptions): Promise<GenerateSrtResult> => {
  const cleanDest = dest.replaceAll('media/', '');
  const destFile = `${outputFolder}/${cleanDest}`;

  const srtPath = await sendSrtRequest({
    src,
    language,
    maxWordsPerLine,
    model,
  });

  await copyFile({ src: srtPath, dest: cleanDest });
  await deleteMediaFile(srtPath);

  const srt = await readFile(destFile, 'utf-8');

  return { file: `media/${cleanDest}`, srt };
};

export default generateSrt;
