import { ttsServerURL } from '@repo/helpers/constants';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const isProduction = process.env.NODE_ENV?.trim() === 'production';

/** Delay in milliseconds before retrying when the TTS server is busy. */
const RETRY_DELAY_MS = 5_000;

/** Directory where generated audio files are stored on the server. */
const OUTPUT_DIR = 'media';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Options for generating AI audio via the TTS server. */
export interface GenerateAiAudioOptions {
  /** Output file name (without the `media/` prefix). */
  destination: string;
  /** Text content to synthesize into speech. */
  text: string;
  /** Speaker voice names used for synthesis. */
  speakers: string[];
  /** Classifier-free guidance scale — higher values increase speaker similarity. */
  cfgScale?: number;
}

/** Payload sent to the TTS server. */
interface TtsRequestPayload {
  name: string;
  output_dir: string;
  device: string;
  text: string;
  speaker_names: string;
  cfg_scale: number;
  production: boolean;
}

/** Shape of the TTS server response. */
interface TtsResponse {
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns a promise that resolves after the given number of milliseconds. */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a synthesis request to the TTS server.
 * If the server responds with a `busy` status the request is retried
 * automatically after {@link RETRY_DELAY_MS}.
 */
const sendTtsRequest = async (payload: TtsRequestPayload): Promise<string> => {
  const response = await fetch(ttsServerURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data: TtsResponse = await response.json();

  if (data.status === 'busy') {
    console.log(`TTS server busy — retrying in ${RETRY_DELAY_MS / 1_000}s`);
    await delay(RETRY_DELAY_MS);
    return sendTtsRequest(payload);
  }

  return `${payload.name}_generated.wav`;
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generates an AI-synthesized audio file using the remote TTS server.
 *
 * @returns Resolved path to the generated `.wav` file inside the media directory
 *          (e.g. `media/my-clip_generated.wav`).
 *
 * @example
 * ```ts
 * const wavPath = await generateAiAudio({
 *   destination: 'greeting',
 *   text: 'Welcome to the show!',
 *   speakers: ['Chris'],
 * });
 * console.log(wavPath); // "media/greeting_generated.wav"
 * ```
 */
export const generateAiAudio = async ({
  destination,
  text,
  speakers,
  cfgScale = 1.8,
}: GenerateAiAudioOptions): Promise<string> => {
  /** Strip any leading `media/` prefix so the server receives a clean name. */
  const cleanDestination = destination.replace(/^media\//, '');

  const payload: TtsRequestPayload = {
    name: cleanDestination,
    output_dir: OUTPUT_DIR,
    device: 'cuda',
    text,
    speaker_names: speakers.join(', '),
    cfg_scale: cfgScale,
    production: isProduction,
  };

  const generatedFile = await sendTtsRequest(payload);

  return `${OUTPUT_DIR}/${generatedFile}`;
};

export default generateAiAudio;
