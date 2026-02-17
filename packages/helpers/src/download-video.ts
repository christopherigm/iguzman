import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';
import { detectPlatform, isTiktok, isYoutube } from './checkers';
import type { Platform } from './checkers';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER = IS_PRODUCTION ? '/app/media' : 'public/media';

/** Default Netscape-format cookies file path. */
const DEFAULT_COOKIES = IS_PRODUCTION
  ? '/app/netscape-cookies.txt'
  : './netscape-cookies.txt';

/** Default yt-dlp binary path. */
const DEFAULT_BINARY = 'yt-dlp';

/** Default ffmpeg binary path. */
const DEFAULT_FFMPEG = 'ffmpeg';

/** Maximum buffer size for command output (2 MB). */
const EXEC_MAX_BUFFER = 1024 * 2048;

/**
 * Language prefixes used to select a preferred SRT file when multiple
 * subtitle files are downloaded. Checked in order — the first match wins.
 */
const PREFERRED_LANG_PREFIXES = [
  'en.srt',
  '.en_us',
  '.en-us',
  'en-us',
  '.eng-us',
  'es.srt',
  '.es_es',
  '.es-es',
  'es-es',
  '.spa-es',
  'en-mx',
] as const;

/* ------------------------------------------------------------------ */
/*  Error types                                                       */
/* ------------------------------------------------------------------ */

/**
 * All possible error codes returned by {@link downloadVideo}.
 *
 * - `BINARY_NOT_FOUND` — yt-dlp is not installed or not reachable.
 * - `FFMPEG_NOT_FOUND` — ffmpeg is not installed (required for audio extraction).
 * - `INVALID_URL` — The provided string is not a valid URL.
 * - `UNSUPPORTED_PLATFORM` — The URL does not match any supported platform.
 * - `DOWNLOAD_FAILED` — yt-dlp exited with a non-zero code.
 * - `METADATA_FAILED` — Could not retrieve video metadata.
 * - `SUBTITLES_FAILED` — Could not retrieve subtitles / captions.
 */
export type DownloadVideoErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'FFMPEG_NOT_FOUND'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'DOWNLOAD_FAILED'
  | 'METADATA_FAILED'
  | 'SUBTITLES_FAILED';

/** Structured error object returned by {@link downloadVideo}. */
export interface DownloadVideoError {
  /** Machine-readable error code. */
  code: DownloadVideoErrorCode;
  /** Human-readable error message. */
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Option & result types                                             */
/* ------------------------------------------------------------------ */

/** Options accepted by {@link downloadVideo}. */
export interface DownloadVideoOptions {
  /** URL of the video to download. */
  url: string;
  /** Path to a Netscape-format cookies file for authenticated downloads. */
  cookies?: string;
  /** Folder where the downloaded file will be saved. */
  outputFolder?: string;
  /**
   * When `true`, video metadata (title, duration, thumbnail, etc.)
   * is fetched via `yt-dlp --dump-json` and included in the result.
   * @defaultValue false
   */
  metadata?: boolean;
  /**
   * When `true`, SRT subtitles are downloaded and included in the result.
   * @defaultValue false
   */
  srt?: boolean;
  /**
   * When `true`, closed-caption text is downloaded and included in the result.
   * @defaultValue false
   */
  captions?: boolean;
  /**
   * When `true`, only the audio track is extracted and saved as an
   * `.m4a` file instead of a full video download. Uses yt-dlp with
   * `--extract-audio` and the `FFmpegExtractAudio` post-processor,
   * so **ffmpeg must be installed** on the system.
   * @defaultValue false
   */
  justAudio?: boolean;
}

/** Relevant fields from the yt-dlp `--dump-json` output. */
export interface VideoMetadata {
  /** Video identifier on the source platform. */
  id: string;
  /** Short title of the video. */
  title: string;
  /** Full title of the video. */
  fulltitle: string;
  /** Thumbnail URL. */
  thumbnail: string;
  /** Duration of the video in seconds. */
  duration: number;
  /** Name of the uploader or channel. */
  uploader: string;
  /** Description of the video. */
  description: string;
  /** Detected language code (e.g. `"en"`). */
  language: string;
  /** Automatic captions keyed by language code. */
  automatic_captions: Record<string, { ext: string; url: string }[]>;
  /** Manual subtitles keyed by language code. */
  subtitles: Record<string, { ext: string; url: string }[]>;
}

/** Result returned by {@link downloadVideo}. */
export interface DownloadVideoResult {
  /**
   * Name of the downloaded video file (UUID-based).
   * Present when the download succeeds.
   */
  file?: string;
  /**
   * Human-readable title of the video extracted via yt-dlp.
   * Present when the download succeeds.
   */
  name?: string;
  /**
   * Video metadata object. Present only when the `metadata` option
   * is `true` and metadata was successfully retrieved.
   */
  metadata?: VideoMetadata;
  /**
   * Raw SRT subtitle text. Present only when the `srt` option is
   * `true` and subtitles were found.
   */
  srt?: string;
  /**
   * Closed-caption text extracted from the video's automatic captions.
   * Present only when the `captions` option is `true` and captions
   * were available.
   */
  captions?: string;
  /**
   * Structured error object. Present when something goes wrong.
   * When set, `file` and `name` will be absent.
   */
  error?: DownloadVideoError;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Promisified wrapper around `child_process.execFile`.
 *
 * Uses an explicit args array to prevent shell-injection risks.
 *
 * @returns The contents of `stdout` on success.
 */
const execFileAsync = (bin: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: EXEC_MAX_BUFFER }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout);
    });
  });

/**
 * Checks whether the yt-dlp binary is available in the system.
 *
 * Runs `yt-dlp --version` and considers it available when the
 * command exits successfully.
 */
const isBinaryAvailable = async (
  binary: string,
  versionArg: string = '--version',
): Promise<boolean> => {
  try {
    await execFileAsync(binary, [versionArg]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates a URL string and detects its platform.
 *
 * @returns The detected {@link Platform}, or `null` when the URL is
 *          not valid or not from a supported platform.
 */
const validateUrl = (
  url: string,
):
  | { valid: true; platform: Platform }
  | { valid: false; reason: DownloadVideoErrorCode } => {
  try {
    new URL(url);
  } catch {
    return { valid: false, reason: 'INVALID_URL' };
  }

  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    return { valid: false, reason: 'UNSUPPORTED_PLATFORM' };
  }

  return { valid: true, platform };
};

/** Creates a directory if it does not already exist. */
const ensureFolder = (folder: string): void => {
  if (!existsSync(folder)) {
    try {
      mkdirSync(folder, { recursive: true });
    } catch (error) {
      console.warn(`Warning: could not create folder "${folder}":`, error);
    }
  }
};

/** Recursively deletes a directory, swallowing errors. */
const removeFolder = (folder: string): void => {
  try {
    rmSync(folder, { recursive: true });
  } catch (error) {
    console.warn(`Warning: could not delete folder "${folder}":`, error);
  }
};

/**
 * Fetches video metadata using `yt-dlp --dump-json`.
 *
 * @returns Parsed metadata object from the JSON output.
 */
const fetchMetadata = async (
  url: string,
  binary: string,
  cookies: string,
): Promise<VideoMetadata> => {
  const args = ['--dump-json', '--no-playlist'];

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push(url);

  const output = await execFileAsync(binary, args);
  if (!output) throw new Error('yt-dlp returned empty metadata');
  return JSON.parse(output) as VideoMetadata;
};

/**
 * Builds the yt-dlp argument list for downloading **only the audio track**.
 *
 * Uses `-f bestaudio` combined with `--extract-audio --audio-format m4a`
 * so yt-dlp downloads the best available audio stream and ffmpeg
 * converts it to M4A.
 */
const buildAudioDownloadArgs = (
  url: string,
  outputPath: string,
  cookies: string,
): string[] => {
  const args: string[] = [
    url,
    '-f',
    'bestaudio/best',
    '--extract-audio',
    '--audio-format',
    'm4a',
    '--audio-quality',
    '0',
    '--no-playlist',
  ];

  args.push('--add-header', 'user-agent:Mozilla/5.0');
  args.push('--js-runtimes', 'node:/usr/local/bin/node');

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push('-o', outputPath, '--quiet');

  return args;
};

/**
 * Builds the yt-dlp argument list for downloading a video.
 *
 * Platform-specific behaviour:
 * - **YouTube** — Requests the best MP4 video + M4A audio combination,
 *   disables playlists, and tolerates per-fragment errors.
 * - **TikTok** — Prefers the H.264 codec.
 * - **Instagram** — No special handling (URL is passed as-is).
 */
const buildDownloadArgs = (
  url: string,
  outputPath: string,
  cookies: string,
): string[] => {
  const args: string[] = [url];

  if (isYoutube(url)) {
    args.push(
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio',
      '--no-abort-on-error',
      '--no-playlist',
    );
  }

  args.push('--add-header', 'user-agent:Mozilla/5.0');
  args.push('--js-runtimes', 'node:/usr/local/bin/node');

  if (isTiktok(url)) {
    args.push('-S', 'codec:h264');
  }

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push('--merge-output-format', 'mp4', '-o', outputPath, '--quiet');

  return args;
};

/**
 * Selects the best SRT file from a set of downloaded subtitle files.
 *
 * When multiple files are present, files matching known language
 * prefixes are preferred. When only one file exists it is selected
 * automatically.
 */
const selectBestSrtFile = (files: string[]): string | null => {
  const srtFiles = files.filter((f) => f.endsWith('.srt'));
  if (srtFiles.length === 0) return null;
  if (srtFiles.length === 1) return srtFiles[0]!;

  const preferred = srtFiles.find((file) => {
    const lower = file.toLowerCase();
    return PREFERRED_LANG_PREFIXES.some((prefix) => lower.includes(prefix));
  });

  return preferred ?? srtFiles[0]!;
};

/**
 * Downloads SRT subtitles for a video using yt-dlp.
 *
 * @returns Raw SRT content, or `null` when no subtitles are found.
 */
const fetchSrt = async (
  url: string,
  binary: string,
  cookies: string,
  outputFolder: string,
): Promise<string | null> => {
  const tmpFolder = `${outputFolder}/_srt_${randomUUID()}`;
  ensureFolder(tmpFolder);

  try {
    const args = [
      url,
      '--skip-download',
      '--write-subs',
      '--write-automatic-subs',
      '--convert-subs=srt',
      '--no-playlist',
    ];

    if (isTiktok(url)) {
      args.push('--sub-langs', 'all');
    } else if (isYoutube(url)) {
      args.push('--sub-langs', 'en,es');
    }

    if (cookies) {
      args.push('--cookies', cookies);
    }

    args.push('-o', `${tmpFolder}/%(id)s.%(ext)s`);

    await execFileAsync(binary, args);

    const files = readdirSync(tmpFolder);
    const best = selectBestSrtFile(files);

    if (best) {
      const content = readFileSync(`${tmpFolder}/${best}`, 'utf8');
      removeFolder(tmpFolder);
      return content;
    }

    removeFolder(tmpFolder);
    return null;
  } catch {
    removeFolder(tmpFolder);
    return null;
  }
};

/**
 * Extracts closed-caption text from the video's automatic captions.
 *
 * Attempts to find an SRT entry in `automatic_captions` for English
 * or Spanish, downloads it, and returns the raw SRT content.
 *
 * @returns Captions text, or `null` when none are available.
 */
const fetchCaptions = (metadata: VideoMetadata): string | null => {
  const preferredLangs = ['en', 'en-US', 'es', 'es-ES'];

  for (const lang of preferredLangs) {
    const entries = metadata.automatic_captions[lang];
    if (!entries) continue;

    const srtEntry = entries.find((e) => e.ext === 'srt');
    if (srtEntry?.url) {
      return srtEntry.url;
    }
  }

  return null;
};

/**
 * Downloads caption content from a direct URL using yt-dlp.
 *
 * @returns Raw caption text, or `null` on failure.
 */
const downloadCaptionContent = async (
  captionUrl: string,
  binary: string,
  cookies: string,
  outputFolder: string,
): Promise<string | null> => {
  const tmpFile = `${outputFolder}/_caption_${randomUUID()}.srt`;

  try {
    const args = [captionUrl, '-o', tmpFile, '--quiet'];

    if (cookies) {
      args.push('--cookies', cookies);
    }

    await execFileAsync(binary, args);

    if (existsSync(tmpFile)) {
      const content = readFileSync(tmpFile, 'utf8');
      rmSync(tmpFile, { force: true });
      return content;
    }

    return null;
  } catch {
    try {
      rmSync(tmpFile, { force: true });
    } catch {
      /* ignore */
    }
    return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Downloads a video from a supported platform using yt-dlp.
 *
 * The downloaded file is saved with a UUID-based filename to avoid
 * collisions. Optionally retrieves metadata, SRT subtitles, and
 * closed captions.
 *
 * **Supported platforms:** Facebook, Instagram, Pinterest, RedNote,
 * Tidal, TikTok, X (Twitter), and YouTube.
 *
 * @example
 * ```ts
 * import downloadVideo from '@repo/helpers/download-video';
 *
 * // Download video
 * const result = await downloadVideo({
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   metadata: true,
 *   srt: true,
 * });
 *
 * // Download audio only (requires ffmpeg)
 * const audio = await downloadVideo({
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   justAudio: true,
 * });
 *
 * if (result.error) {
 *   console.error(result.error.code, result.error.message);
 * } else {
 *   console.log('Downloaded:', result.file);
 *   console.log('Title:', result.name);
 * }
 * ```
 *
 * @param options - Configuration for the download.
 * @returns A result object containing the file path, video title,
 *          and optional metadata / subtitles / captions — or an
 *          error when the download cannot be performed.
 */
const downloadVideo = async ({
  url,
  cookies = DEFAULT_COOKIES,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
  metadata: requestMetadata = false,
  srt: requestSrt = false,
  captions: requestCaptions = false,
  justAudio = false,
}: DownloadVideoOptions): Promise<DownloadVideoResult> => {
  const binary = DEFAULT_BINARY;
  const ffmpegBinary = DEFAULT_FFMPEG;

  /* ---- 1. Check yt-dlp availability ---- */

  const binaryExists = await isBinaryAvailable(binary);
  if (!binaryExists) {
    return {
      error: {
        code: 'BINARY_NOT_FOUND',
        message:
          'yt-dlp binary was not found. ' +
          'Install it via: brew install yt-dlp (macOS), ' +
          'sudo apt install yt-dlp (Debian/Ubuntu), ' +
          'pip install yt-dlp (pip), ' +
          'or download from https://github.com/yt-dlp/yt-dlp#installation',
      },
    };
  }

  /* ---- 1b. Check ffmpeg availability (required for audio extraction) ---- */

  if (justAudio) {
    const ffmpegExists = await isBinaryAvailable(ffmpegBinary, '-version');
    if (!ffmpegExists) {
      return {
        error: {
          code: 'FFMPEG_NOT_FOUND',
          message:
            'ffmpeg binary was not found. It is required for audio extraction. ' +
            'Install it via: brew install ffmpeg (macOS), ' +
            'sudo apt install ffmpeg (Debian/Ubuntu), ' +
            'or download from https://ffmpeg.org/download.html',
        },
      };
    }
  }

  /* ---- 2. Validate URL ---- */

  const validation = validateUrl(url);
  if (!validation.valid) {
    const messages: Record<string, string> = {
      INVALID_URL: `The provided URL is not valid: "${url}"`,
      UNSUPPORTED_PLATFORM:
        `The URL does not match any supported platform. ` +
        `Supported: Facebook, Instagram, Pinterest, RedNote, Tidal, TikTok, X, YouTube.`,
    };

    return {
      error: {
        code: validation.reason,
        message: messages[validation.reason] ?? 'Unknown validation error',
      },
    };
  }

  /* ---- 3. Prepare output path ---- */

  ensureFolder(outputFolder);

  const fileId = randomUUID();
  const fileExt = justAudio ? 'm4a' : 'mp4';
  const fileName = `${fileId}.${fileExt}`;
  const outputPath = `${outputFolder}/${fileName}`;

  /* ---- 4. Fetch metadata (if requested, or needed for name/captions) ---- */

  let videoMetadata: VideoMetadata | undefined;

  if (requestMetadata || requestCaptions) {
    try {
      videoMetadata = await fetchMetadata(url, binary, cookies);
    } catch (error) {
      if (requestMetadata) {
        return {
          error: {
            code: 'METADATA_FAILED',
            message: `Failed to retrieve video metadata: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
      // If only captions were requested and metadata fails, we continue
      // without captions rather than failing the entire download.
    }
  }

  /* ---- 5. Download the video (or audio only) ---- */

  const args = justAudio
    ? buildAudioDownloadArgs(url, outputPath, cookies)
    : buildDownloadArgs(url, outputPath, cookies);

  try {
    await execFileAsync(binary, args);
  } catch (error) {
    return {
      error: {
        code: 'DOWNLOAD_FAILED',
        message: `yt-dlp download failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  /* ---- 6. Extract video title ---- */

  let videoName: string | undefined;

  if (videoMetadata) {
    videoName = videoMetadata.fulltitle || videoMetadata.title;
  } else {
    // Fetch title separately when metadata wasn't requested
    try {
      const titleMeta = await fetchMetadata(url, binary, cookies);
      videoName = titleMeta.fulltitle || titleMeta.title;
    } catch {
      // Title is best-effort; proceed without it.
    }
  }

  /* ---- 7. Build result ---- */

  const result: DownloadVideoResult = {
    file: fileName,
    ...(videoName && { name: videoName }),
  };

  /* ---- 8. Attach metadata ---- */

  if (requestMetadata && videoMetadata) {
    result.metadata = videoMetadata;
  }

  /* ---- 9. Fetch SRT subtitles ---- */

  if (requestSrt) {
    try {
      const srtContent = await fetchSrt(url, binary, cookies, outputFolder);
      if (srtContent) {
        result.srt = srtContent;
      }
    } catch {
      // SRT is optional; swallow the error.
    }
  }

  /* ---- 10. Fetch captions ---- */

  if (requestCaptions && videoMetadata) {
    try {
      const captionUrl = fetchCaptions(videoMetadata);
      if (captionUrl) {
        const captionContent = await downloadCaptionContent(
          captionUrl,
          binary,
          cookies,
          outputFolder,
        );
        if (captionContent) {
          result.captions = captionContent;
        }
      }
    } catch {
      // Captions are optional; swallow the error.
    }
  }

  return result;
};

export default downloadVideo;
