import downloadVideo from '@repo/helpers/download-video';
import loopAudioToLength from '@repo/helpers/duplicate-audio-time-length';
import deleteMediaFile from '@repo/helpers/delete-media-file';
import extractAudioFromVideo from '@repo/helpers/extract-audio-from-video';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link downloadAudioAndLoop}. */
export interface DownloadAudioAndLoopOptions {
  /** URL of the video to download (audio will be extracted from it). */
  readonly url: string;
  /** Relative path for the final looped audio file (e.g. `"media/bgm.wav"`). */
  readonly dest: string;
  /** Desired duration of the output audio in seconds. */
  readonly timeLength: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strips a leading `media/` prefix from a path so it can be safely
 * combined with an output folder without duplicating the segment.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Downloads a video from a URL, extracts its audio track, and loops it
 * to reach the specified duration.
 *
 * **Workflow:**
 * 1. Downloads the video using yt-dlp via {@link downloadVideo}.
 * 2. Extracts the audio track as a WAV file via {@link extractAudioFromVideo}.
 * 3. Deletes the temporary downloaded video.
 * 4. Loops the extracted audio to cover {@link DownloadAudioAndLoopOptions.timeLength | timeLength}
 *    seconds via {@link loopAudioToLength}.
 * 5. Deletes the temporary extracted audio.
 *
 * @param options - URL, destination path, and target duration.
 * @returns Relative media path to the looped audio file (e.g. `"media/bgm.wav"`).
 * @throws If the URL is empty, destination is missing, timeLength is invalid,
 *         or any step in the pipeline fails.
 *
 * @example
 * ```ts
 * const output = await downloadAudioAndLoop({
 *   url: 'https://example.com/video.mp4',
 *   dest: 'media/bgm-looped.wav',
 *   timeLength: 60,
 * });
 * console.log(output); // "media/bgm-looped.wav"
 * ```
 */
const downloadAudioAndLoop = async ({
  url,
  dest,
  timeLength,
}: DownloadAudioAndLoopOptions): Promise<string> => {
  const cleanDest = stripMediaPrefix(dest);

  /** Temporary filenames for intermediate artifacts. */
  const tmpVideo = `tmp.video.${cleanDest}`;
  const tmpAudio = `tmp.${cleanDest}`;

  // Step 1: Download the video from the provided URL
  await downloadVideo({ url, name: tmpVideo });

  // Step 2: Extract the audio track from the downloaded video
  await extractAudioFromVideo({ src: tmpVideo, dest: tmpAudio });

  // Step 3: Clean up the temporary video file (best-effort)
  await deleteMediaFile(`media/${tmpVideo}`).catch(() => {});

  // Step 4: Loop the extracted audio to the target duration
  const result = await loopAudioToLength({
    src: tmpAudio,
    dest: cleanDest,
    timeLength,
  });

  // Step 5: Clean up the temporary audio file (best-effort)
  await deleteMediaFile(`media/${tmpAudio}`).catch(() => {});

  return result;
};

export default downloadAudioAndLoop;
