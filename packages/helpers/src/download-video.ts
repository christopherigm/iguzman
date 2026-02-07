import { execFile } from 'child_process';
import { isInstagram, isTiktok, isYoutube } from './checkers';
import getFinalURL from '@iguzman/helpers/get-final-url';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER =
  NODE_ENV === 'production' ? '/app/media' : 'public/media';

/** Default Netscape cookies file path for authenticated downloads. */
const DEFAULT_COOKIES =
  NODE_ENV === 'production'
    ? '/app/netscape-cookies.txt'
    : './netscape-cookies.txt';

/** Default yt-dlp binary path. */
const DEFAULT_BINARY = NODE_ENV === 'production' ? 'yt-dlp' : './yt-dlp';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Options for {@link downloadVideo}. */
export interface DownloadVideoOptions {
  /** URL of the video to download. */
  url: string;
  /** Output filename (a leading `media/` prefix is stripped automatically). */
  name: string;
  /** Folder where the downloaded file will be saved. */
  outputFolder?: string;
  /** Path to a Netscape-format cookies file for authenticated downloads. */
  cookies?: string;
  /** Path to the yt-dlp binary. */
  binary?: string;
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

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Downloads a video from a URL using yt-dlp.
 *
 * Platform-specific behaviour:
 * - **Instagram** — Resolves the final URL (follows redirects) before
 *   passing it to yt-dlp.
 * - **YouTube** — Requests the best MP4 video + M4A audio combination,
 *   disables playlists, and tolerates per-fragment errors.
 * - **TikTok** — Prefers the H.264 codec.
 *
 * Uses `execFile` with an explicit args array to prevent
 * shell-injection risks.
 *
 * @returns The relative media path of the downloaded file
 *          (e.g. `media/output.mp4`).
 */
const downloadVideo = async ({
  url,
  name,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
  cookies = DEFAULT_COOKIES,
  binary = DEFAULT_BINARY,
}: DownloadVideoOptions): Promise<string> => {
  const cleanName = stripMediaPrefix(name);
  const outputPath = `${outputFolder}/${cleanName}`;

  /** Resolve redirects for Instagram URLs before downloading. */
  const finalURL = isInstagram(url) ? await getFinalURL(url) : url;

  const args: string[] = [finalURL];

  if (isYoutube(finalURL)) {
    args.push(
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio',
      '--no-abort-on-error',
      '--no-playlist',
    );
  }

  args.push('--add-header', 'user-agent:Mozilla/5.0');

  if (isTiktok(finalURL)) {
    args.push('-S', 'codec:h264');
  }

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push('--merge-output-format', 'mp4', '-o', outputPath, '--quiet');

  return new Promise<string>((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 1024 * 2048 }, (error) => {
      if (error) {
        console.error('downloadVideo error:', error);
        return reject(error);
      }
      return resolve(`media/${cleanName}`);
    });
  });
};

export default downloadVideo;
