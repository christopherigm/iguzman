import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Configuration constants for audio processing
 */
const AUDIO_CONFIG = {
  /** Maximum buffer size for ffmpeg command execution (2MB) */
  MAX_BUFFER: 1024 * 2048,
  /** Audio channel layout for silence generation */
  CHANNEL_LAYOUT: 'stereo',
  /** Sample rate in Hz for silence generation */
  SAMPLE_RATE: 44100,
} as const;

/**
 * Determines the current environment and returns appropriate media folder path
 */
const getNodeEnv = (): string => {
  return process.env.NODE_ENV?.trim() ?? 'localhost';
};

/**
 * Options for adding silence to a WAV file
 */
export interface AddSilenceOptions {
  /** Source file path (relative to media folder) */
  readonly src: string;
  /** Destination file path (relative to media folder) */
  readonly dest: string;
  /** Duration of silence to add in seconds */
  readonly time: number;
  /** If true, adds silence at the beginning; if false, at the end */
  readonly beginning?: boolean;
  /** Custom output folder path (defaults based on NODE_ENV) */
  readonly outputFolder?: string;
}

/**
 * Sanitizes a file path by removing 'media/' prefix if present
 *
 * @param path - The file path to sanitize
 * @returns The sanitized path without 'media/' prefix
 */
const sanitizePath = (path: string): string => {
  return path.replace(/^media\//, '');
};

/**
 * Validates the input parameters for adding silence
 *
 * @param options - The options to validate
 * @throws Error if validation fails
 */
const validateOptions = (options: AddSilenceOptions): void => {
  const { src, dest, time } = options;

  if (!src || typeof src !== 'string') {
    throw new Error('Source file path must be a non-empty string');
  }

  if (!dest || typeof dest !== 'string') {
    throw new Error('Destination file path must be a non-empty string');
  }

  if (typeof time !== 'number' || time <= 0) {
    throw new Error('Time must be a positive number');
  }

  if (isNaN(time) || !isFinite(time)) {
    throw new Error('Time must be a valid finite number');
  }
};

/**
 * Builds the ffmpeg command for adding silence to an audio file
 *
 * @param srcFile - Full path to the source file
 * @param destFile - Full path to the destination file
 * @param time - Duration of silence in seconds
 * @param beginning - Whether to add silence at the beginning (true) or end (false)
 * @returns The complete ffmpeg command string
 */
const buildFfmpegCommand = (
  srcFile: string,
  destFile: string,
  time: number,
  beginning: boolean
): string => {
  const { CHANNEL_LAYOUT, SAMPLE_RATE } = AUDIO_CONFIG;

  // Build silence input filter
  const silenceInput = `-f lavfi -t ${time} -i anullsrc=channel_layout=${CHANNEL_LAYOUT}:sample_rate=${SAMPLE_RATE}`;
  const audioInput = `-i "${srcFile}"`;

  // Order inputs based on where silence should be added
  const inputs = beginning
    ? `${silenceInput} ${audioInput}`
    : `${audioInput} ${silenceInput}`;

  // Combine inputs with filter
  const filter = '-filter_complex "[0:a][1:a]concat=n=2:v=0:a=1"';

  return `ffmpeg -y ${inputs} ${filter} "${destFile}"`;
};

/**
 * Adds silence to a WAV audio file using ffmpeg
 *
 * This function uses ffmpeg to prepend or append silence to an audio file.
 * It creates a new file with the added silence and returns the path to it.
 *
 * @param options - Configuration options for adding silence
 * @returns Promise that resolves to the destination file path (with 'media/' prefix)
 * @throws Error if validation fails or ffmpeg command fails
 *
 * @example
 * ```typescript
 * // Add 2 seconds of silence at the beginning
 * const result = await addSilenceToWav({
 *   src: 'input.wav',
 *   dest: 'output.wav',
 *   time: 2,
 *   beginning: true
 * });
 *
 * // Add 1.5 seconds of silence at the end
 * const result = await addSilenceToWav({
 *   src: 'input.wav',
 *   dest: 'output.wav',
 *   time: 1.5,
 *   beginning: false
 * });
 * ```
 */
export const addSilenceToWav = async (options: AddSilenceOptions): Promise<string> => {
  // Validate input parameters
  validateOptions(options);

  const {
    src,
    dest,
    time,
    beginning = true,
    outputFolder = getNodeEnv() === 'production' ? '/app/media' : 'public/media',
  } = options;

  // Sanitize paths to remove 'media/' prefix if present
  const srcClean = sanitizePath(src);
  const destClean = sanitizePath(dest);

  // Build full file paths
  const srcFile = `${outputFolder}/${srcClean}`;
  const destFile = `${outputFolder}/${destClean}`;

  try {
    // Build and execute ffmpeg command
    const command = buildFfmpegCommand(srcFile, destFile, time, beginning);

    await execAsync(command, { maxBuffer: AUDIO_CONFIG.MAX_BUFFER });

    // Return the destination path with 'media/' prefix
    return `media/${destClean}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[addSilenceToWav] Command failed:', {
      src: srcFile,
      dest: destFile,
      time,
      beginning,
      error: errorMessage,
    });
    throw new Error(`Failed to add silence to WAV file: ${errorMessage}`);
  }
};

/**
 * Default export for backward compatibility
 */
export default addSilenceToWav;
