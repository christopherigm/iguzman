import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Maximum buffer size for ffmpeg command execution (2 MB). */
const MAX_BUFFER = 1024 * 2048;

/**
 * Resolves the current Node environment, defaulting to `"localhost"`
 * when `NODE_ENV` is not set.
 */
const getNodeEnv = (): string =>
  process.env.NODE_ENV?.trim() ?? 'localhost';

/**
 * Removes a leading `media/` prefix from a file path so it can be
 * joined with the output folder without duplicating the segment.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Audio extraction settings used by ffmpeg. */
const AUDIO_CONFIG = {
  /** Audio codec for uncompressed 16-bit PCM. */
  codec: 'pcm_s16le',
  /** Sample rate in Hz. */
  sampleRate: 44100,
  /** Number of audio channels (2 = stereo). */
  channels: 2,
} as const;

/** Options accepted by {@link extractAudioFromVideo}. */
export interface ExtractAudioFromVideoOptions {
  /** Relative path to the source video file (e.g. `"media/clip.mp4"`). */
  readonly src: string;
  /** Relative path for the output audio file (e.g. `"media/clip.wav"`). */
  readonly dest: string;
  /**
   * Root folder where media files are stored.
   * Defaults to `"/app/media"` in production or `"public/media"` otherwise.
   */
  readonly outputFolder?: string;
}

/**
 * Extracts the audio track from a video file and saves it as a
 * 16-bit PCM WAV (stereo, 44 100 Hz) using ffmpeg.
 *
 * @param options - Source/destination paths and optional output folder.
 * @returns Relative media path to the created audio file (e.g. `"media/clip.wav"`).
 * @throws If `src` or `dest` are empty, or if ffmpeg exits with an error.
 *
 * @example
 * ```ts
 * const audioPath = await extractAudioFromVideo({
 *   src: 'media/interview.mp4',
 *   dest: 'media/interview.wav',
 * });
 * console.log(audioPath); // "media/interview.wav"
 * ```
 */
export const extractAudioFromVideo = async ({
  src,
  dest,
  outputFolder = getNodeEnv() === 'production'
    ? '/app/media'
    : 'public/media',
}: ExtractAudioFromVideoOptions): Promise<string> => {
  if (!src || typeof src !== 'string') {
    throw new Error('Source file path must be a non-empty string');
  }

  if (!dest || typeof dest !== 'string') {
    throw new Error('Destination file path must be a non-empty string');
  }

  const cleanSrc = stripMediaPrefix(src);
  const cleanDest = stripMediaPrefix(dest);

  const srcFile = `${outputFolder}/${cleanSrc}`;
  const destFile = `${outputFolder}/${cleanDest}`;

  const { codec, sampleRate, channels } = AUDIO_CONFIG;

  const command = [
    `ffmpeg -y -i "${srcFile}"`,
    `-vn -acodec ${codec} -ar ${sampleRate} -ac ${channels}`,
    `"${destFile}"`,
  ].join(' ');

  try {
    await execAsync(command, { maxBuffer: MAX_BUFFER });
    return `media/${cleanDest}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract audio from "${srcFile}": ${message}`);
  }
};

export default extractAudioFromVideo;
