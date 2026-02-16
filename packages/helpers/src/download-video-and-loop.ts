import downloadVideo from '@repo/helpers/download-video';
import loopVideoToLength from '@repo/helpers/duplicate-video-time-length';
import deleteMediaFile from '@repo/helpers/delete-media-file';
import upscaleVideoFps from '@repo/helpers/video-upscale-fps';
import copyFile from '@repo/helpers/copy-file';
import addAudioToVideoInTime from '@repo/helpers/add-audio-to-video-in-time';
import extractAudioFromVideo from '@repo/helpers/extract-audio-from-video';
import loopAudioToLength from '@repo/helpers/duplicate-audio-time-length';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link downloadVideoAndLoop}. */
export interface DownloadVideoAndLoopOptions {
  /** URL of the video to download. */
  readonly url: string;
  /** Output filename (a leading `media/` prefix is stripped automatically). */
  readonly dest: string;
  /**
   * Desired duration of the final looped video, in seconds.
   * @defaultValue 10
   */
  readonly targetDuration: number;
  /**
   * Crossfade overlap duration (in seconds) used when looping the video.
   * @defaultValue 3
   */
  readonly crossfadeDuration?: number;
  /**
   * When set, the final video is upscaled to this frame rate using
   * motion interpolation (`minterpolate`).
   */
  readonly upscaleFps?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strips a leading `media/` prefix from a path, if present.
 *
 * Only the first occurrence at the start of the string is removed so
 * that nested segments like `some/media/file.mp4` stay intact.
 */
const stripMediaPrefix = (filePath: string): string =>
  filePath.replace(/^media\//, '');

/**
 * Extracts the audio from a video, loops it to the target duration,
 * and returns the path to the looped audio file.
 *
 * Cleans up the intermediate extracted audio file before returning.
 */
const buildLoopedAudio = async (
  videoSrc: string,
  audioDest: string,
  targetDuration: number,
): Promise<string> => {
  const tmpAudio = `tmp.${audioDest}`;

  await extractAudioFromVideo({ src: videoSrc, dest: tmpAudio });

  const loopedPath = await loopAudioToLength({
    src: tmpAudio,
    dest: audioDest,
    timeLength: targetDuration,
  });

  await deleteMediaFile(`media/${tmpAudio}`);

  return loopedPath;
};

/**
 * Silently deletes a list of temporary media files.
 * Failures are ignored — this is a best-effort cleanup step.
 */
const cleanupTempFiles = async (files: string[]): Promise<void> => {
  await Promise.allSettled(
    files.map((file) => deleteMediaFile(`media/${file}`)),
  );
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Downloads a video, loops both its video and audio tracks to a target
 * duration, re-merges them, and optionally upscales the frame rate.
 *
 * **Workflow:**
 * 1. Downloads the video from the given URL.
 * 2. Loops the video track to `targetDuration` (with crossfade).
 * 3. Extracts and loops the audio track to the same duration.
 * 4. Merges the looped audio back into the looped video.
 * 5. *(Optional)* Upscales the frame rate via motion interpolation.
 * 6. Cleans up all intermediate temporary files.
 *
 * @param options - Download URL, output path, and duration settings.
 * @returns Relative media path to the final output file
 *          (e.g. `"media/output.mp4"`).
 * @throws If any download, ffmpeg, or file operation fails.
 *
 * @example
 * ```ts
 * const output = await downloadVideoAndLoop({
 *   url: 'https://example.com/clip.mp4',
 *   dest: 'media/clip-looped.mp4',
 *   targetDuration: 30,
 *   upscaleFps: 60,
 * });
 * console.log(output); // "media/clip-looped.mp4"
 * ```
 */
const downloadVideoAndLoop = async ({
  url,
  dest,
  targetDuration = 10,
  crossfadeDuration = 3,
  upscaleFps,
}: DownloadVideoAndLoopOptions): Promise<string> => {
  const cleanDest = stripMediaPrefix(dest);

  // Intermediate file names scoped to this pipeline
  const tmpDownloaded = `tmp.${cleanDest}`;
  const tmpAudio = `tmp.${cleanDest.replace(/\.mp4$/, '.wav')}`;
  const tmpVideoNoAudio = `no-audio.${cleanDest}`;
  const finalVideo = cleanDest;

  // Step 1: Download the source video
  await downloadVideo({ url, name: tmpDownloaded });

  // Step 2: Loop the video track to the target duration (without audio)
  await loopVideoToLength({
    src: tmpDownloaded,
    dest: tmpVideoNoAudio,
    targetDuration,
    crossfadeDuration,
  });

  // Step 3: Extract audio and loop it to the same duration
  await buildLoopedAudio(tmpDownloaded, tmpAudio, targetDuration);

  // The original download is no longer needed
  await deleteMediaFile(`media/${tmpDownloaded}`);

  // Step 4: Merge the looped audio back into the looped video
  await addAudioToVideoInTime({
    srcVideo: tmpVideoNoAudio,
    srcAudio: tmpAudio,
    dest: finalVideo,
    offset: 0,
  });

  // Clean up merge inputs
  await cleanupTempFiles([tmpVideoNoAudio, tmpAudio]);

  // Step 5 (optional): Upscale frame rate via motion interpolation
  if (upscaleFps) {
    const tmpUpscaleSrc = `upscale-src.${cleanDest}`;

    await copyFile({ src: finalVideo, dest: tmpUpscaleSrc });
    await upscaleVideoFps({
      src: tmpUpscaleSrc,
      dest: finalVideo,
      fps: upscaleFps,
    });

    await deleteMediaFile(`media/${tmpUpscaleSrc}`);
  }

  return `media/${finalVideo}`;
};

export default downloadVideoAndLoop;
