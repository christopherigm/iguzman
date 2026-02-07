import { execFile } from 'child_process';
import path from 'path';

/** Supported audio encoding formats for the output. */
export type AudioFormat = 'wav' | 'mp3' | 'ogg';

/** Configuration for merging an audio track into a video file. */
export interface AddAudioToVideoOptions {
  /** Path to the source video file (relative to the media folder, with or without a leading `media/` prefix). */
  srcVideo: string;
  /** Path to the source audio file (relative to the media folder, with or without a leading `media/` prefix). */
  srcAudio: string;
  /** Output file path (relative to the media folder, with or without a leading `media/` prefix). */
  dest: string;
  /** Time offset in seconds at which the audio track begins in the video. Defaults to `0`. */
  offset?: number;
  /** Audio format of the source file. When `'wav'`, ffmpeg re-encodes to AAC; otherwise streams are copied directly. Defaults to `'wav'`. */
  format?: AudioFormat;
  /** Base folder where media files are stored. Defaults to `'/app/media'` in production or `'public/media'` otherwise. */
  outputFolder?: string;
}

/** Result of a successful audio-video merge. */
export interface AddAudioToVideoResult {
  /** Relative media path to the output file (e.g. `'media/output.mp4'`). */
  mediaPath: string;
  /** Absolute file path to the output file on disk. */
  absolutePath: string;
}

/**
 * Returns the default media output folder based on `NODE_ENV`.
 * @returns `'/app/media'` in production, `'public/media'` otherwise.
 */
function getDefaultOutputFolder(): string {
  const nodeEnv = process.env.NODE_ENV?.trim() ?? 'localhost';
  return nodeEnv === 'production' ? '/app/media' : 'public/media';
}

/**
 * Strips a leading `media/` prefix from a path. Only removes the prefix
 * at the start of the string — occurrences elsewhere are left intact.
 */
export function stripMediaPrefix(filePath: string): string {
  return filePath.replace(/^media\//, '');
}

/**
 * Builds the ffmpeg argument list for the merge operation.
 *
 * @param srcVideoFile - Absolute path to the source video.
 * @param srcAudioFile - Absolute path to the source audio.
 * @param destFile     - Absolute path to the output file.
 * @param offset       - Audio start offset in seconds.
 * @param format       - Source audio format (determines encoding flags).
 * @returns An array of CLI arguments (without the `ffmpeg` binary itself).
 */
export function buildFfmpegArgs(
  srcVideoFile: string,
  srcAudioFile: string,
  destFile: string,
  offset: number,
  format: AudioFormat,
): string[] {
  const args: string[] = [
    '-y',
    '-i', srcVideoFile,
    '-itsoffset', String(offset),
    '-i', srcAudioFile,
    // Always map video from the first input and audio from the second
    '-map', '0:v',
    '-map', '1:a',
    // Video stream is always copied without re-encoding
    '-c:v', 'copy',
  ];

  // WAV audio must be re-encoded (AAC) because WAV is not a valid
  // codec inside most video containers. For MP3/OGG the stream can
  // be copied directly since those codecs are container-compatible.
  if (format === 'wav') {
    args.push('-c:a', 'aac');
  } else {
    args.push('-c:a', 'copy');
  }

  args.push(destFile);
  return args;
}

/**
 * Merges an audio file into a video file at a specified time offset using ffmpeg.
 *
 * The video stream is always copied without re-encoding. When the source audio
 * format is WAV it is re-encoded to AAC for container compatibility; MP3 and OGG
 * streams are copied directly.
 *
 * @param options - Merge configuration (see {@link AddAudioToVideoOptions}).
 * @returns A promise that resolves with the output file paths.
 *
 * @throws {Error} If any required parameter is missing or invalid.
 * @throws {Error} If ffmpeg exits with a non-zero status.
 *
 * @example
 * ```ts
 * const result = await addAudioToVideoInTime({
 *   srcVideo: 'intro.mp4',
 *   srcAudio: 'narration.wav',
 *   dest: 'intro-with-narration.mp4',
 *   offset: 5,
 * });
 * console.log(result.mediaPath); // 'media/intro-with-narration.mp4'
 * ```
 */
export function addAudioToVideoInTime({
  srcVideo,
  srcAudio,
  dest,
  offset = 0,
  format = 'wav',
  outputFolder = getDefaultOutputFolder(),
}: AddAudioToVideoOptions): Promise<AddAudioToVideoResult> {
  // --- Input validation ---
  if (!srcVideo) {
    return Promise.reject(new Error('srcVideo is required'));
  }
  if (!srcAudio) {
    return Promise.reject(new Error('srcAudio is required'));
  }
  if (!dest) {
    return Promise.reject(new Error('dest is required'));
  }
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0) {
    return Promise.reject(
      new Error('offset must be a non-negative finite number'),
    );
  }

  // --- Resolve absolute file paths ---
  const srcVideoFile = path.join(outputFolder, stripMediaPrefix(srcVideo));
  const srcAudioFile = path.join(outputFolder, stripMediaPrefix(srcAudio));
  const destClean = stripMediaPrefix(dest);
  const destFile = path.join(outputFolder, destClean);

  // --- Execute ffmpeg via execFile (safe from shell injection) ---
  const args = buildFfmpegArgs(srcVideoFile, srcAudioFile, destFile, offset, format);

  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 1024 * 2048 }, (error: Error | null) => {
      if (error) {
        reject(new Error(`ffmpeg failed: ${error.message}`));
        return;
      }
      resolve({
        mediaPath: `media/${destClean}`,
        absolutePath: destFile,
      });
    });
  });
}
