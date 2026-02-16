import { readFile } from 'fs/promises';
import { diarizationServerURL } from '@iguzman/helpers/constants';
import type { Diarization } from '@iguzman/helpers/diarizations';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const isProduction = process.env.NODE_ENV?.trim() === 'production';

/** Maximum number of retry attempts when the diarization server is busy. */
const MAX_RETRIES = 20;

/** Delay in milliseconds between retry attempts. */
const RETRY_DELAY_MS = 5_000;

/** Root directory where media files are stored, based on the environment. */
const MEDIA_ROOT = isProduction ? '/app/media' : 'public/media';

/** Default output directory used by the diarization server. */
const OUTPUT_DIR = 'media';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Options for {@link generateAudioDiarization}. */
export interface GenerateAudioDiarizationOptions {
  /** Source file name to diarize (without the media prefix). */
  name: string;
  /** Server-side output folder for the generated file. */
  outputFolder?: string;
}

/** Payload sent to the diarization server. */
interface DiarizationRequestPayload {
  name: string;
  output_dir: string;
  production: boolean;
}

/** Shape of the diarization server response. */
interface DiarizationServerResponse {
  status: string;
  path?: string;
}

/** Result returned by {@link generateAudioDiarization}. */
export interface GenerateAudioDiarizationResult {
  /** Relative media path to the diarization JSON file. */
  file: string;
  /** Serialized diarization segments as a JSON string. */
  diarization: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns a promise that resolves after the given number of milliseconds. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a diarization request to the server.
 *
 * When the server responds with a `"busy"` status, the request is retried
 * up to {@link MAX_RETRIES} times with a {@link RETRY_DELAY_MS} pause
 * between attempts.
 *
 * @returns The output file path returned by the server, or the original name as fallback.
 * @throws If the server remains busy after all retries or the request fails.
 */
const sendDiarizationRequest = async (
  payload: DiarizationRequestPayload,
): Promise<string> => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(diarizationServerURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data: DiarizationServerResponse = await response.json();

    if (data.status !== 'busy') {
      return data.path ?? payload.name;
    }

    console.warn(
      `Diarization server busy — retrying in ${RETRY_DELAY_MS / 1_000}s (attempt ${attempt}/${MAX_RETRIES})`,
    );
    await delay(RETRY_DELAY_MS);
  }

  throw new Error(
    `Diarization server remained busy after ${MAX_RETRIES} retries for "${payload.name}"`,
  );
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generates speaker diarization for an audio file using the remote
 * diarization server, then reads and returns the resulting JSON.
 *
 * @param options - Generation options including source name and output folder.
 * @returns The relative media path and serialized diarization segments.
 *
 * @example
 * ```ts
 * const result = await generateAudioDiarization({ name: 'interview.wav' });
 * console.log(result.file);         // "media/interview.json"
 * console.log(result.diarization);  // "[{\"speaker\":0,\"start\":0,\"end\":3.5}, ...]"
 * ```
 */
const generateAudioDiarization = async ({
  name,
  outputFolder = OUTPUT_DIR,
}: GenerateAudioDiarizationOptions): Promise<GenerateAudioDiarizationResult> => {
  const payload: DiarizationRequestPayload = {
    name,
    output_dir: outputFolder,
    production: isProduction,
  };

  const outputFile = await sendDiarizationRequest(payload);

  const rawDiarization = await readFile(
    `${MEDIA_ROOT}/${outputFile}`,
    'utf-8',
  );
  const diarization: Diarization[] = JSON.parse(rawDiarization);

  return {
    file: `${OUTPUT_DIR}/${outputFile}`,
    diarization: JSON.stringify(diarization),
  };
};

export default generateAudioDiarization;
