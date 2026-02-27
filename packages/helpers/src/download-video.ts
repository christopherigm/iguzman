import { execFile } from 'child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'fs';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import { randomUUID } from 'crypto';
import { detectPlatform, isInstagram, isTiktok, isYoutube } from './checkers';
import type { Platform } from './checkers';
import { extractAudioFromVideo } from './extract-audio-from-video';
import { addAudioToVideoInTime } from './add-audio-to-video-in-time';

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

/** Default gallery-dl binary path. */
const DEFAULT_GALLERY_DL = 'gallery-dl';

/** Default Node.js binary path for yt-dlp's `--js-runtimes` flag. */
const DEFAULT_JS_RUNTIMES = IS_PRODUCTION
  ? '/usr/local/bin/node'
  : '/usr/bin/node';

/** Maximum buffer size for command output (2 MB). */
const EXEC_MAX_BUFFER = 1024 * 2048;

/**
 * Video extensions compatible with web browsers, Android, and iOS.
 * Ordered by preference — the first match wins during format selection.
 */
const PREFERRED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'] as const;

/**
 * Audio extensions compatible with web browsers, Android, and iOS.
 * Ordered by preference — the first match wins during format selection.
 */
const PREFERRED_AUDIO_EXTENSIONS = [
  'm4a',
  'mp3',
  'aac',
  'opus',
  'webm',
] as const;

/**
 * High-quality / lossless audio output formats supported by yt-dlp's
 * FFmpegExtractAudio post-processor. Ordered by quality preference —
 * FLAC is lossless, the rest are high-bitrate lossy.
 */
const LOSSLESS_AUDIO_FORMATS = ['flac', 'wav', 'alac', 'aiff'] as const;

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
 * - `GALLERY_DL_NOT_FOUND` — gallery-dl is not installed (used as fallback for Instagram images).
 * - `INVALID_URL` — The provided string is not a valid URL.
 * - `UNSUPPORTED_PLATFORM` — The URL does not match any supported platform.
 * - `DOWNLOAD_FAILED` — yt-dlp exited with a non-zero code.
 * - `METADATA_FAILED` — Could not retrieve video metadata.
 * - `SUBTITLES_FAILED` — Could not retrieve subtitles / captions.
 * - `FORMAT_DETECTION_FAILED` — Could not list available formats.
 */

/**
 * Supported audio output formats for the `justAudio` download mode.
 *
 * - `flac` — Lossless. Highest quality; preserves every sample bit.
 * - `wav`  — Uncompressed PCM. Lossless but very large files.
 * - `alac` — Apple Lossless. Lossless, best for Apple ecosystems.
 * - `aiff` — Uncompressed PCM (Apple). Similar to WAV.
 * - `m4a`  — AAC in an MP4 container. High-quality lossy.
 * - `mp3`  — Ubiquitous lossy format.
 * - `opus` — Modern, efficient lossy codec.
 */
export type AudioOutputFormat =
  | 'flac'
  | 'wav'
  | 'alac'
  | 'aiff'
  | 'm4a'
  | 'mp3'
  | 'opus';

export type DownloadVideoErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'FFMPEG_NOT_FOUND'
  | 'GALLERY_DL_NOT_FOUND'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'DOWNLOAD_FAILED'
  | 'METADATA_FAILED'
  | 'SUBTITLES_FAILED'
  | 'FORMAT_DETECTION_FAILED';

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
   * When `true`, only the audio track is extracted and saved as a
   * high-quality audio file instead of a full video download.
   *
   * Uses yt-dlp with `--extract-audio`, `--embed-metadata`, and
   * `--embed-thumbnail` post-processors, so **ffmpeg must be
   * installed** on the system.
   *
   * Music metadata (artist, album, cover art, etc.) is automatically
   * fetched and embedded into the output file.
   *
   * @defaultValue false
   */
  justAudio?: boolean;
  /**
   * Audio output format used when `justAudio` is `true`.
   *
   * Prefer lossless formats (`flac`, `wav`, `alac`) for maximum
   * quality. FLAC is recommended as it is lossless, widely supported
   * by audio players, and supports embedded metadata & cover art.
   *
   * @defaultValue 'flac'
   */
  audioFormat?: AudioOutputFormat;
  /**
   * Absolute path to the Node.js binary used by yt-dlp's
   * `--js-runtimes` flag for JavaScript-based extractors.
   * @defaultValue `/usr/local/bin/node` in production, `/usr/bin/node` otherwise.
   */
  jsRuntimes?: string;
  /**
   * When `true`, the downloaded file is probed with ffmpeg to
   * determine whether its video stream uses the H.265 (HEVC) codec.
   * The result is returned as `isH265` in {@link DownloadVideoResult}.
   * Requires **ffmpeg** to be installed on the system.
   * @defaultValue false
   */
  checkCodec?: boolean;
}

/** A single format entry from yt-dlp's `--dump-json` output. */
export interface FormatInfo {
  /** Unique identifier for the format (e.g. `"137"`, `"248"`). */
  format_id: string;
  /** File extension (e.g. `"mp4"`, `"webm"`, `"m4a"`). */
  ext: string;
  /** Video codec name, or `"none"` when the format is audio-only. */
  vcodec: string;
  /** Audio codec name, or `"none"` when the format is video-only. */
  acodec: string;
  /** Video height in pixels (e.g. `1080`). `null` for audio-only. */
  height: number | null;
  /** Video width in pixels (e.g. `1920`). `null` for audio-only. */
  width: number | null;
  /** Frames per second. `null` when unavailable. */
  fps: number | null;
  /** Total bitrate in KBit/s. `null` when unavailable. */
  tbr: number | null;
  /** Audio bitrate in KBit/s. `null` when unavailable. */
  abr: number | null;
  /** Audio sample rate in Hz. `null` when unavailable. */
  asr: number | null;
  /** Approximate file size in bytes. `null` when unavailable. */
  filesize_approx: number | null;
  /** Exact file size in bytes. `null` when unavailable. */
  filesize: number | null;
  /** Resolution string (e.g. `"1920x1080"`). */
  resolution: string;
  /** Human-readable format note (e.g. `"1080p"`, `"tiny"`). */
  format_note: string;
  /** Download protocol (e.g. `"https"`, `"m3u8_native"`). */
  protocol: string;
  /**
   * Language code of the audio track (e.g. `"en"`, `"es"`, `"ja"`).
   * `null` when the format has no language tag.
   */
  language: string | null;
  /**
   * Numeric language preference assigned by yt-dlp.
   * Higher values indicate a more preferred / original audio track.
   * The video's default (original) audio track typically has the
   * highest value (e.g. `10`), while dubbed tracks have lower
   * values (e.g. `-1`).
   * `null` when unavailable.
   */
  language_preference: number | null;
}

/** The result of format detection for a video URL. */
export interface FormatSelection {
  /** The best video-only format, or `null` if none found. */
  bestVideo: FormatInfo | null;
  /** The best audio-only format, or `null` if none found. */
  bestAudio: FormatInfo | null;
  /** The best combined (video + audio) format, or `null` if none found. */
  bestCombined: FormatInfo | null;
  /** All available formats returned by yt-dlp. */
  allFormats: FormatInfo[];
}

/** Music-specific metadata extracted from yt-dlp `--dump-json`. */
export interface AudioMetadata {
  /** Track title (cleaned, without the "Artist - " prefix). */
  title: string;
  /** Artist / performer / channel name. */
  artist: string;
  /** Album name, when available. */
  album?: string;
  /** Album artist, when different from the track artist. */
  albumArtist?: string;
  /** Track number within the album. */
  track?: string;
  /** Disc number. */
  disc?: string;
  /** Release year (e.g. `2024`). */
  releaseYear?: number;
  /** Release date as `YYYYMMDD`. */
  releaseDate?: string;
  /** Music genre. */
  genre?: string;
  /** Composer name. */
  composer?: string;
  /** Thumbnail / cover-art URL (highest resolution available). */
  coverUrl?: string;
  /** Duration in seconds. */
  duration?: number;
  /** Description or comment. */
  description?: string;
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
  /** Available formats returned by yt-dlp. */
  formats?: FormatInfo[];
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
   * Music-specific metadata extracted from yt-dlp's JSON output.
   * Present only when `justAudio` is `true` and metadata was
   * successfully retrieved. Contains structured fields such as
   * artist, album, genre, cover URL, etc.
   */
  audioMetadata?: AudioMetadata;
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
   * Format selection details. Present only when format detection
   * succeeds. Useful for debugging or inspecting chosen formats.
   */
  formatSelection?: FormatSelection;
  /**
   * `true` when the downloaded video uses the H.265 (HEVC) codec,
   * `false` when it does not. Present only when the `checkCodec`
   * option is `true` and the probe succeeds.
   */
  isH265?: boolean;
  /**
   * Filename of the locally-saved thumbnail image (UUID-based).
   * Present when a thumbnail or cover-art URL was available and
   * the image was successfully downloaded to the output folder.
   *
   * For videos this is the video thumbnail; for audio-only
   * downloads this is the cover-art image.
   */
  thumbnail?: string;
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
 * The `--dump-json` output includes a `formats` array with all
 * available streams — this is reused by {@link fetchAvailableFormats}
 * to avoid a redundant network call.
 *
 * @returns Parsed metadata object from the JSON output.
 */
const fetchMetadata = async (
  url: string,
  binary: string,
  cookies: string,
  jsRuntimes: string,
): Promise<VideoMetadata> => {
  const args = ['--dump-json', '--no-playlist'];

  args.push('--js-runtimes', `node:${jsRuntimes}`);

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push(url);

  const output = await execFileAsync(binary, args);
  if (!output) throw new Error('yt-dlp returned empty metadata');
  return JSON.parse(output) as VideoMetadata;
};

/* ------------------------------------------------------------------ */
/*  Format detection & selection                                      */
/* ------------------------------------------------------------------ */

/**
 * Fetches all available formats for a URL using `yt-dlp --dump-json`.
 *
 * When metadata has already been fetched (and includes a `formats`
 * field) it is reused to avoid a second network round-trip.
 *
 * @returns An array of {@link FormatInfo} objects.
 */
const fetchAvailableFormats = async (
  url: string,
  binary: string,
  cookies: string,
  jsRuntimes: string,
  existingMetadata?: VideoMetadata,
): Promise<FormatInfo[]> => {
  // Re-use formats from metadata when available
  if (existingMetadata?.formats && existingMetadata.formats.length > 0) {
    return existingMetadata.formats;
  }

  const meta = await fetchMetadata(url, binary, cookies, jsRuntimes);
  return (meta as VideoMetadata & { formats?: FormatInfo[] }).formats ?? [];
};

/**
 * Returns `true` when the extension is in the preferred list.
 */
const isPreferredVideoExt = (ext: string): boolean =>
  (PREFERRED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);

const isPreferredAudioExt = (ext: string): boolean =>
  (PREFERRED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);

/**
 * Selects the best video-only, audio-only, and combined formats
 * from the available format list.
 *
 * **Selection strategy:**
 * 1. Filters to web-compatible extensions (`mp4`, `webm`, `mov` for
 *    video; `m4a`, `mp3`, `aac`, `opus`, `webm` for audio).
 * 2. Prefers the highest resolution (height × width), then highest
 *    bitrate, then preferred extension order.
 * 3. For audio, prefers the highest bitrate, then preferred extension.
 * 4. A "combined" format has both video and audio codecs — useful for
 *    platforms that serve muxed streams (e.g. Instagram).
 */
const selectBestFormats = (formats: FormatInfo[]): FormatSelection => {
  const videoOnly: FormatInfo[] = [];
  const audioOnly: FormatInfo[] = [];
  const combined: FormatInfo[] = [];

  for (const f of formats) {
    const hasVideo = f.vcodec !== 'none' && f.vcodec !== undefined;
    const hasAudio = f.acodec !== 'none' && f.acodec !== undefined;

    if (hasVideo && hasAudio) {
      combined.push(f);
    } else if (hasVideo && !hasAudio) {
      videoOnly.push(f);
    } else if (hasAudio && !hasVideo) {
      audioOnly.push(f);
    }
  }

  // --- Best video-only (max resolution → max bitrate → preferred ext) ---
  const filteredVideo = videoOnly.filter((f) => isPreferredVideoExt(f.ext));
  const videoPool = filteredVideo.length > 0 ? filteredVideo : videoOnly;

  const bestVideo =
    videoPool.length > 0
      ? videoPool.sort((a, b) => {
          // 1. Max resolution (height)
          const aH = a.height ?? 0;
          const bH = b.height ?? 0;
          if (bH !== aH) return bH - aH;

          // 2. Max width (for same height)
          const aW = a.width ?? 0;
          const bW = b.width ?? 0;
          if (bW !== aW) return bW - aW;

          // 3. Max bitrate
          const aTbr = a.tbr ?? 0;
          const bTbr = b.tbr ?? 0;
          if (bTbr !== aTbr) return bTbr - aTbr;

          // 4. Prefer mp4 > webm > mov
          const extOrder = (ext: string) => {
            const idx = (
              PREFERRED_VIDEO_EXTENSIONS as readonly string[]
            ).indexOf(ext);
            return idx === -1 ? 999 : idx;
          };
          return extOrder(a.ext) - extOrder(b.ext);
        })[0]!
      : null;

  // --- Best audio-only (original language → max bitrate → preferred ext) ---
  //
  // YouTube (and some other platforms) serve multiple audio tracks for
  // the same video — e.g. the original language plus dubbed versions.
  // yt-dlp assigns a `language_preference` score to each track: the
  // original / default track gets the highest value (typically `10`),
  // while dubbed tracks get lower values (e.g. `-1`).
  //
  // When `language_preference` data is available we first narrow the
  // pool to tracks with the highest `language_preference` so that
  // only the original audio is considered, then sort by quality.

  const filteredAudio = audioOnly.filter((f) => isPreferredAudioExt(f.ext));
  let audioPool = filteredAudio.length > 0 ? filteredAudio : audioOnly;

  // Prefer the original / default audio track when language info exists
  const hasLangInfo = audioPool.some((f) => f.language_preference != null);
  if (hasLangInfo) {
    const maxLangPref = Math.max(
      ...audioPool.map((f) => f.language_preference ?? -Infinity),
    );
    const originalAudioPool = audioPool.filter(
      (f) => (f.language_preference ?? -Infinity) === maxLangPref,
    );
    if (originalAudioPool.length > 0) {
      audioPool = originalAudioPool;
    }
  }

  const bestAudio =
    audioPool.length > 0
      ? audioPool.sort((a, b) => {
          // 1. Prefer original / default audio track (highest language_preference)
          const aLang = a.language_preference ?? -Infinity;
          const bLang = b.language_preference ?? -Infinity;
          if (bLang !== aLang) return bLang - aLang;

          // 2. Max audio bitrate
          const aAbr = a.abr ?? a.tbr ?? 0;
          const bAbr = b.abr ?? b.tbr ?? 0;
          if (bAbr !== aAbr) return bAbr - aAbr;

          // 3. Higher sample rate
          const aAsr = a.asr ?? 0;
          const bAsr = b.asr ?? 0;
          if (bAsr !== aAsr) return bAsr - aAsr;

          // 4. Prefer m4a > mp3 > aac > opus > webm
          const extOrder = (ext: string) => {
            const idx = (
              PREFERRED_AUDIO_EXTENSIONS as readonly string[]
            ).indexOf(ext);
            return idx === -1 ? 999 : idx;
          };
          return extOrder(a.ext) - extOrder(b.ext);
        })[0]!
      : null;

  // --- Best combined (max resolution → max bitrate → preferred ext) ---
  const filteredCombined = combined.filter((f) => isPreferredVideoExt(f.ext));
  const combinedPool =
    filteredCombined.length > 0 ? filteredCombined : combined;

  const bestCombined =
    combinedPool.length > 0
      ? combinedPool.sort((a, b) => {
          const aH = a.height ?? 0;
          const bH = b.height ?? 0;
          if (bH !== aH) return bH - aH;

          const aTbr = a.tbr ?? 0;
          const bTbr = b.tbr ?? 0;
          if (bTbr !== aTbr) return bTbr - aTbr;

          const extOrder = (ext: string) => {
            const idx = (
              PREFERRED_VIDEO_EXTENSIONS as readonly string[]
            ).indexOf(ext);
            return idx === -1 ? 999 : idx;
          };
          return extOrder(a.ext) - extOrder(b.ext);
        })[0]!
      : null;

  return { bestVideo, bestAudio, bestCombined, allFormats: formats };
};

/**
 * Selects the best combined (video + audio) format for TikTok downloads.
 *
 * TikTok serves muxed streams where video and audio are combined in a
 * single format. Instead of merging separate streams, this function
 * picks the combined format with the **highest resolution** directly.
 *
 * This avoids H.265/HEVC streams that are known to cause missing-audio
 * issues in many players and browsers.
 *
 * @returns A {@link FormatSelection} with only `bestCombined` populated.
 */
const selectBestTikTokFormat = (formats: FormatInfo[]): FormatSelection => {
  const combined: FormatInfo[] = [];

  for (const f of formats) {
    const hasVideo = f.vcodec !== 'none' && f.vcodec !== undefined;
    const hasAudio = f.acodec !== 'none' && f.acodec !== undefined;

    if (hasVideo && hasAudio) {
      combined.push(f);
    }
  }

  // Filter to web-compatible extensions when possible
  const filteredCombined = combined.filter((f) => isPreferredVideoExt(f.ext));
  const pool = filteredCombined.length > 0 ? filteredCombined : combined;

  const bestCombined =
    pool.length > 0
      ? pool.sort((a, b) => {
          // 1. Max resolution (height)
          const aH = a.height ?? 0;
          const bH = b.height ?? 0;
          if (bH !== aH) return bH - aH;

          // 2. Max width (for same height)
          const aW = a.width ?? 0;
          const bW = b.width ?? 0;
          if (bW !== aW) return bW - aW;

          // 3. Max bitrate
          const aTbr = a.tbr ?? 0;
          const bTbr = b.tbr ?? 0;
          if (bTbr !== aTbr) return bTbr - aTbr;

          // 4. Prefer mp4 > webm > mov
          const extOrder = (ext: string) => {
            const idx = (
              PREFERRED_VIDEO_EXTENSIONS as readonly string[]
            ).indexOf(ext);
            return idx === -1 ? 999 : idx;
          };
          return extOrder(a.ext) - extOrder(b.ext);
        })[0]!
      : null;

  return {
    bestVideo: null,
    bestAudio: null,
    bestCombined,
    allFormats: formats,
  };
};

/**
 * Builds the `-f` format selector string used by yt-dlp,
 * based on detected best formats.
 *
 * - If both a video-only and audio-only format were found,
 *   returns `"<videoId>+<audioId>"` so yt-dlp merges them.
 * - If only a combined format exists, returns its `format_id`.
 * - Falls back to yt-dlp's built-in `"bv*+ba/b"` selector.
 */
const buildFormatSelector = (
  selection: FormatSelection,
  justAudio: boolean,
): string => {
  if (justAudio) {
    if (selection.bestAudio) {
      return selection.bestAudio.format_id;
    }
    // Fallback: prefer the original / default audio track via
    // yt-dlp's language_preference sort (highest = original).
    return 'bestaudio/best';
  }

  // Prefer explicit video + audio merge
  if (selection.bestVideo && selection.bestAudio) {
    return `${selection.bestVideo.format_id}+${selection.bestAudio.format_id}`;
  }

  // Fall back to best combined stream
  if (selection.bestCombined) {
    return selection.bestCombined.format_id;
  }

  // Ultimate fallback — let yt-dlp decide
  return 'bv*+ba/b';
};

/**
 * Builds the yt-dlp argument list for downloading **only the audio track**
 * with full metadata and cover-art embedding.
 *
 * When a {@link FormatSelection} is provided and a best audio format
 * was detected, its `format_id` is used directly with `-f`. Otherwise
 * falls back to `bestaudio/best`.
 *
 * Post-processing pipeline:
 * 1. `--extract-audio`        — strip the video stream.
 * 2. `--audio-format <fmt>`   — convert to the target format (default FLAC).
 * 3. `--audio-quality 0`      — highest quality transcoding.
 * 4. `--embed-metadata`       — write ID3/Vorbis tags (title, artist, album…).
 * 5. `--embed-thumbnail`      — embed cover art into the audio file.
 * 6. `--convert-thumbnails jpg` — ensure thumbnail is JPEG for broad compat.
 * 7. `--parse-metadata`       — map uploader → artist when no artist field.
 */
const buildAudioDownloadArgs = (
  url: string,
  outputPath: string,
  cookies: string,
  jsRuntimes: string,
  audioFormat: AudioOutputFormat = 'flac',
  formatSelection?: FormatSelection,
): string[] => {
  const formatSelector = formatSelection
    ? buildFormatSelector(formatSelection, true)
    : 'bestaudio/best';

  const args: string[] = [
    url,
    '-f',
    formatSelector,

    // ── Prefer original / default audio track ──────────────────────
    // YouTube videos may have multiple audio tracks (original +
    // dubbed). The `-S` flag with `lang` tells yt-dlp to prefer
    // the track with the highest `language_preference` (i.e. the
    // original audio) when the format selector matches several
    // candidates.
    '-S',
    'lang',

    // ── Audio extraction & format ──────────────────────────────────
    '--extract-audio',
    '--audio-format',
    audioFormat,
    '--audio-quality',
    '0',

    // ── Metadata & cover-art embedding ─────────────────────────────
    '--embed-metadata',
    '--embed-thumbnail',
    '--convert-thumbnails',
    'jpg',

    // Map uploader → artist so the tag is always populated.
    // yt-dlp already exposes `artist` when the extractor provides it;
    // this acts as a fallback for platforms that only set `uploader`.
    '--parse-metadata',
    '%(artist,uploader)s:%(meta_artist)s',

    // Map track → title when available (music platforms set `track`).
    '--parse-metadata',
    '%(track,title)s:%(meta_title)s',

    // Map album if present.
    '--parse-metadata',
    '%(album,playlist_title)s:%(meta_album)s',

    '--no-playlist',
  ];

  if (!isTiktok(url)) {
    args.push('--add-header', 'user-agent:Mozilla/5.0');
  }
  args.push('--js-runtimes', `node:${jsRuntimes}`);

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push('-o', outputPath, '--quiet');

  return args;
};

/**
 * Extracts structured {@link AudioMetadata} from yt-dlp's raw
 * `--dump-json` output.
 *
 * Falls back through several fields so that the result is as complete
 * as possible regardless of which extractor produced the metadata.
 */
const extractAudioMetadata = (
  meta: VideoMetadata & Record<string, unknown>,
): AudioMetadata => {
  // ── Artist ────────────────────────────────────────────────────────
  const artist =
    str(meta.artist) ??
    str(meta.creator) ??
    str(meta.uploader) ??
    'Unknown Artist';

  // ── Title (prefer track name over video title) ───────────────────
  const title =
    str(meta.track) ?? cleanTitle(meta.fulltitle || meta.title, artist);

  // ── Album ────────────────────────────────────────────────────────
  const album = str(meta.album) ?? str(meta.playlist_title) ?? undefined;

  // ── Release info ─────────────────────────────────────────────────
  const releaseYear =
    num(meta.release_year) ??
    yearFromDate(str(meta.release_date) ?? str(meta.upload_date));

  const releaseDate =
    str(meta.release_date) ?? str(meta.upload_date) ?? undefined;

  // ── Cover art (best thumbnail) ───────────────────────────────────
  const coverUrl = bestThumbnailUrl(meta);

  return {
    title,
    artist,
    ...(album && { album }),
    ...(str(meta.album_artist) && { albumArtist: str(meta.album_artist)! }),
    ...(str(meta.track_number) && { track: str(meta.track_number)! }),
    ...(str(meta.disc_number) && { disc: str(meta.disc_number)! }),
    ...(releaseYear && { releaseYear }),
    ...(releaseDate && { releaseDate }),
    ...(str(meta.genre) && { genre: str(meta.genre)! }),
    ...(str(meta.composer) && { composer: str(meta.composer)! }),
    ...(coverUrl && { coverUrl }),
    ...(meta.duration && { duration: meta.duration }),
    ...(meta.description && { description: meta.description }),
  };
};

/* -- tiny helpers for extractAudioMetadata ── */

/** Coerce an unknown value to a non-empty string or `null`. */
const str = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
};

/** Coerce an unknown value to a number or `null`. */
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  return null;
};

/** Extract a four-digit year from a `YYYYMMDD` string. */
const yearFromDate = (d: string | null): number | null => {
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
};

/**
 * Regex that matches parenthetical / bracket noise commonly appended
 * to music-video titles on YouTube, TikTok, and similar platforms.
 *
 * Examples of strings that will be removed:
 * - `(Official Music Video)`, `[Official Audio]`
 * - `(Audio Oficial)`, `(Video Oficial)`, `(Clip Officiel)`
 * - `(Lyrics)`, `(Lyric Video)`, `(Visualizer)`
 * - `(Just Audio)`, `(Audio Only)`
 * - `(Official)`, `(Oficial)`, `(Audio)`, `(Video)`
 * - `(HD)`, `(HQ)`, `(4K)`, `(Remastered 2024)`
 *
 * Matched **case-insensitively**. Longer alternatives are listed
 * first so the regex engine matches greedily.
 */
const TITLE_NOISE_RE =
  // prettier-ignore
  /\s*[(\[]\s*(?:official\s+music\s+video|official\s+lyric\s+video|official\s+visualizer|official\s+audio|official\s+video|offizielles?\s+musikvideo|music\s+video|lyric\s+video|(?:audio|video|videoclip|clip|música|musica)\s+(?:oficial|official|officiel(?:le)?|ufficiale)|(?:oficial|official|officiel(?:le)?|ufficiale)\s+(?:audio|video|videoclip|clip|música|musica)|just\s+audio|audio\s+only|visualizer|lyrics?|remastered(?:\s+\d{4})?|oficial|official|audio|video|hd|hq|4k)\s*[)\]]/gi;

/**
 * Remove a leading "Artist - " prefix and parenthetical noise from a
 * video title so that the embedded `title` tag contains only the
 * clean track name.
 *
 * Stripping order:
 * 1. Remove "Artist - " / "Artist — " / "Artist – " prefix.
 * 2. Remove bracketed noise like "(Official Audio)", "[Lyrics]", etc.
 */
const cleanTitle = (raw: string, artist: string): string => {
  if (!raw) return 'Unknown Title';

  let title = raw;

  // 1. Strip leading "Artist - Title" prefix
  const separators = [' - ', ' — ', ' – '];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx !== -1) {
      const before = title.slice(0, idx).trim();
      // Only strip if the prefix matches the artist (case-insensitive)
      if (before.toLowerCase() === artist.toLowerCase()) {
        title = title.slice(idx + sep.length).trim();
        break;
      }
    }
  }

  // 2. Strip parenthetical / bracket noise (Official Video, Lyrics, etc.)
  title = title.replace(TITLE_NOISE_RE, '').trim();

  return title || 'Unknown Title';
};

/**
 * Picks the highest-resolution thumbnail URL from the metadata.
 * yt-dlp returns an array of `thumbnails` sorted by preference;
 * we pick the last (highest quality) entry.
 */
const bestThumbnailUrl = (
  meta: VideoMetadata & Record<string, unknown>,
): string | null => {
  const thumbnails = meta.thumbnails as
    | { url: string; width?: number; height?: number }[]
    | undefined;

  if (thumbnails && thumbnails.length > 0) {
    // Last entry is typically the highest resolution
    return thumbnails[thumbnails.length - 1]!.url;
  }

  return str(meta.thumbnail);
};

/**
 * Downloads a thumbnail image from a URL and saves it to the output
 * folder with a UUID-based filename.
 *
 * Follows up to 5 redirects. The file extension is inferred from the
 * URL path or `Content-Type` header, defaulting to `.jpg`.
 *
 * @returns The saved filename (e.g. `"abc123.jpg"`), or `null` on failure.
 */
const downloadThumbnailFile = (
  thumbnailUrl: string,
  outputFolder: string,
): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const parsed = new URL(thumbnailUrl);
      const getter = parsed.protocol === 'https:' ? httpsGet : httpGet;

      const doRequest = (url: string, redirects = 0): void => {
        if (redirects > 5) {
          resolve(null);
          return;
        }

        getter(url, (res) => {
          // Follow redirects
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            doRequest(res.headers.location, redirects + 1);
            return;
          }

          if (!res.statusCode || res.statusCode >= 400) {
            res.resume();
            resolve(null);
            return;
          }

          // Determine file extension from URL path or Content-Type
          const urlExt = url
            .match(/\.(jpe?g|png|webp|avif)/i)?.[1]
            ?.toLowerCase();
          const ctMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/avif': 'avif',
          };
          const ct = res.headers['content-type']?.split(';')[0]?.trim() ?? '';
          const ext = urlExt ?? ctMap[ct] ?? 'jpg';

          const thumbId = randomUUID();
          const thumbName = `${thumbId}.${ext}`;
          const thumbPath = `${outputFolder}/${thumbName}`;

          const fileStream = createWriteStream(thumbPath);
          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve(thumbName);
          });

          fileStream.on('error', () => {
            fileStream.close();
            try {
              rmSync(thumbPath, { force: true });
            } catch {
              /* ignore */
            }
            resolve(null);
          });
        }).on('error', () => {
          resolve(null);
        });
      };

      doRequest(thumbnailUrl);
    } catch {
      resolve(null);
    }
  });

/**
 * Builds the yt-dlp argument list for downloading a video.
 *
 * When a {@link FormatSelection} is provided the explicit
 * `format_id` combination is used, guaranteeing the best
 * resolution + best audio detected from `--dump-json`.
 *
 * Platform-specific behaviour:
 * - **YouTube** — Falls back to
 *   `bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio`,
 *   disables playlists, and tolerates per-fragment errors.
 * - **TikTok** — Appends `-S codec:h264` as a secondary sort.
 * - **Other platforms** — No special handling.
 */
const buildDownloadArgs = (
  url: string,
  outputPath: string,
  cookies: string,
  jsRuntimes: string,
  formatSelection?: FormatSelection,
): string[] => {
  const args: string[] = [url];

  if (formatSelection) {
    // Use the explicitly-detected best format combination
    const selector = buildFormatSelector(formatSelection, false);
    args.push('-f', selector, '--no-abort-on-error', '--no-playlist');
  } else if (isYoutube(url)) {
    args.push(
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio',
      '--no-abort-on-error',
      '--no-playlist',
    );
  }

  if (!isTiktok(url)) {
    args.push('--add-header', 'user-agent:Mozilla/5.0');
  }
  args.push('--js-runtimes', `node:${jsRuntimes}`);

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
  jsRuntimes: string,
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

    args.push('--js-runtimes', `node:${jsRuntimes}`);

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

/**
 * Probes a media file with ffmpeg to check whether its video stream
 * uses the H.265 / HEVC codec.
 *
 * Runs `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name`
 * and checks whether the output contains `hevc` or `h265`.
 *
 * @returns `true` when H.265 is detected, `false` otherwise.
 */
const isH265Codec = async (
  filePath: string,
  ffmpegBinary: string,
): Promise<boolean> => {
  try {
    // Derive ffprobe path from ffmpeg path
    const ffprobeBinary = ffmpegBinary.replace(/ffmpeg$/, 'ffprobe');
    const output = await execFileAsync(ffprobeBinary, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const codec = output.trim().toLowerCase();
    return codec === 'hevc' || codec === 'h265';
  } catch {
    return false;
  }
};

/**
 * Probes a media file with ffprobe to check whether it contains an
 * audio stream.
 *
 * @returns `true` when at least one audio stream is found, `false` otherwise.
 */
const hasAudioStream = async (
  filePath: string,
  ffmpegBinary: string,
): Promise<boolean> => {
  try {
    const ffprobeBinary = ffmpegBinary.replace(/ffmpeg$/, 'ffprobe');
    const output = await execFileAsync(ffprobeBinary, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    return output.trim().length > 0;
  } catch {
    return false;
  }
};

/**
 * Downloads an H.264-encoded version of a TikTok video using yt-dlp
 * with `-S "codec:h264"` to prefer H.264 streams.
 *
 * @param url        - TikTok video URL.
 * @param outputPath - Absolute path where the file will be saved.
 * @param cookies    - Path to the Netscape cookies file.
 * @param jsRuntimes - Path to the Node.js binary for yt-dlp.
 */
const downloadTikTokH264Video = async (
  url: string,
  outputPath: string,
  cookies: string,
  jsRuntimes: string,
): Promise<void> => {
  const args: string[] = [
    url,
    '-S',
    'codec:h264',
    '--no-abort-on-error',
    '--no-playlist',
    '--js-runtimes',
    `node:${jsRuntimes}`,
  ];

  if (cookies) {
    args.push('--cookies', cookies);
  }

  args.push('--merge-output-format', 'mp4', '-o', outputPath, '--quiet');

  await execFileAsync(DEFAULT_BINARY, args);
};

/**
 * Repairs a TikTok H.265 video that has no audio by downloading a
 * secondary H.264 version, extracting its audio track, and merging
 * that audio into the original H.265 video.
 *
 * **Flow:**
 * 1. Probe the downloaded file — skip if it is not H.265 or already has audio.
 * 2. Download an H.264 copy of the same TikTok URL (`-S codec:h264`).
 * 3. Extract the audio track from the H.264 video (WAV via ffmpeg).
 * 4. Merge the extracted audio into the H.265 video.
 * 5. Replace the original file with the merged result.
 * 6. Clean up temporary H.264 video and WAV files.
 *
 * @returns `true` when the repair was performed, `false` when skipped
 *          (not H.265, already has audio, or a step failed).
 */
const repairTikTokH265Audio = async (
  h265FilePath: string,
  h265FileName: string,
  url: string,
  outputFolder: string,
  cookies: string,
  jsRuntimes: string,
  ffmpegBinary: string,
): Promise<boolean> => {
  /* ---- 1. Check codec & audio presence ---- */

  const isH265 = await isH265Codec(h265FilePath, ffmpegBinary);
  if (!isH265) return false;

  const audioPresent = await hasAudioStream(h265FilePath, ffmpegBinary);
  if (audioPresent) return false;

  /* ---- 2. Download H.264 version ---- */

  const h264Id = randomUUID();
  const h264FileName = `${h264Id}.mp4`;
  const h264FilePath = `${outputFolder}/${h264FileName}`;
  const audioFileName = `${h264Id}.wav`;
  const audioFilePath = `${outputFolder}/${audioFileName}`;

  const cleanup = () => {
    try {
      rmSync(h264FilePath, { force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(audioFilePath, { force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    await downloadTikTokH264Video(url, h264FilePath, cookies, jsRuntimes);
  } catch {
    cleanup();
    return false;
  }

  /* ---- 3. Extract audio from H.264 video ---- */

  try {
    await extractAudioFromVideo({
      src: h264FileName,
      dest: audioFileName,
      outputFolder,
    });
  } catch {
    cleanup();
    return false;
  }

  /* ---- 4. Merge audio into H.265 video ---- */

  const mergedFileName = `merged_${h265FileName}`;
  const mergedFilePath = `${outputFolder}/${mergedFileName}`;

  try {
    await addAudioToVideoInTime({
      srcVideo: h265FileName,
      srcAudio: audioFileName,
      dest: mergedFileName,
      offset: 0,
      format: 'wav',
      outputFolder,
    });
  } catch {
    cleanup();
    try {
      rmSync(mergedFilePath, { force: true });
    } catch {
      /* ignore */
    }
    return false;
  }

  /* ---- 5. Replace original with merged file ---- */

  try {
    rmSync(h265FilePath, { force: true });
    renameSync(mergedFilePath, h265FilePath);
  } catch {
    // If replacement fails, try to keep whichever file exists.
    return false;
  }

  /* ---- 6. Cleanup temporary files ---- */

  cleanup();

  return true;
};

/* ------------------------------------------------------------------ */
/*  Instagram image fallback (gallery-dl)                             */
/* ------------------------------------------------------------------ */

/** Image extensions recognised when scanning gallery-dl output. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

/** Audio/video extensions that gallery-dl may download alongside images. */
const MEDIA_EXTENSIONS = new Set([
  'mp4',
  'mp3',
  'm4a',
  'aac',
  'ogg',
  'wav',
  'webm',
]);

/**
 * Downloads media from an Instagram URL using gallery-dl.
 *
 * gallery-dl saves files into a directory structure; this helper
 * scans the output folder recursively for image and media files.
 *
 * @returns An object with arrays of downloaded image and media paths.
 */
const galleryDlDownload = async (
  url: string,
  outputFolder: string,
  cookies: string,
): Promise<{ images: string[]; media: string[] }> => {
  const tmpFolder = `${outputFolder}/_gallery_dl_${randomUUID()}`;
  ensureFolder(tmpFolder);

  const args: string[] = [url, '-d', tmpFolder, '--no-mtime'];

  if (cookies && existsSync(cookies)) {
    args.push('--cookies', cookies);
  }

  await execFileAsync(DEFAULT_GALLERY_DL, args);

  // Recursively collect all downloaded files
  const collectFiles = (dir: string): string[] => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...collectFiles(full));
      } else {
        files.push(full);
      }
    }
    return files;
  };

  const allFiles = collectFiles(tmpFolder);

  const images: string[] = [];
  const media: string[] = [];

  for (const file of allFiles) {
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    if (IMAGE_EXTENSIONS.has(ext)) {
      images.push(file);
    } else if (MEDIA_EXTENSIONS.has(ext)) {
      media.push(file);
    }
  }

  return { images, media };
};

/**
 * Creates an MP4 video from a still image and an optional audio file
 * using ffmpeg.
 *
 * When audio is provided the video duration matches the audio length.
 * When no audio is available a short silent video (5 s) is produced.
 *
 * The image is scaled to fit 1080 px width (preserving aspect ratio,
 * height divisible by 2) and encoded as H.264 baseline with AAC audio.
 *
 * @returns Absolute path to the created MP4 file.
 */
const createVideoFromImage = async (
  imagePath: string,
  audioPath: string | null,
  outputPath: string,
  ffmpegBinary: string,
): Promise<void> => {
  const args: string[] = ['-y'];

  if (audioPath) {
    // Loop image for the duration of the audio
    args.push(
      '-loop',
      '1',
      '-i',
      imagePath,
      '-i',
      audioPath,
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=1080:-2',
      '-shortest',
      outputPath,
    );
  } else {
    // No audio — produce a 5-second silent video
    args.push(
      '-loop',
      '1',
      '-i',
      imagePath,
      '-t',
      '5',
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=1080:-2',
      '-an',
      outputPath,
    );
  }

  await execFileAsync(ffmpegBinary, args);
};

/**
 * Downloads a URL to a local file using Node.js HTTP(S).
 *
 * Follows up to 5 redirects. Resolves to `true` on success,
 * `false` on failure.
 */
const downloadUrlToFile = (url: string, destPath: string): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const getter = parsed.protocol === 'https:' ? httpsGet : httpGet;

      const doRequest = (reqUrl: string, redirects = 0): void => {
        if (redirects > 5) {
          resolve(false);
          return;
        }

        getter(reqUrl, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            doRequest(res.headers.location, redirects + 1);
            return;
          }

          if (!res.statusCode || res.statusCode >= 400) {
            res.resume();
            resolve(false);
            return;
          }

          const fileStream = createWriteStream(destPath);
          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve(true);
          });

          fileStream.on('error', () => {
            fileStream.close();
            try {
              rmSync(destPath, { force: true });
            } catch {
              /* ignore */
            }
            resolve(false);
          });
        }).on('error', () => {
          resolve(false);
        });
      };

      doRequest(url);
    } catch {
      resolve(false);
    }
  });

/**
 * Extracts the audio track from an Instagram post.
 *
 * Instagram image posts with music have an audio stream, but yt-dlp's
 * standard audio extraction (`-f bestaudio -x`) often fails for these.
 * This function uses multiple strategies in sequence:
 *
 * 1. **Metadata + direct download** — Uses `yt-dlp --dump-json` to
 *    discover format URLs that contain audio, downloads the stream
 *    directly via HTTP, and extracts audio with ffmpeg when needed.
 * 2. **Download best available + ffmpeg extract** — Downloads any
 *    available format (often a combined video+audio stream) and
 *    extracts the audio track from it with ffmpeg.
 * 3. **Classic yt-dlp audio extraction** — Falls back to the standard
 *    `-f bestaudio/best -x` pipeline as a last resort.
 *
 * @returns Absolute path to the extracted audio file, or `null` on failure.
 */
const extractInstagramAudio = async (
  url: string,
  outputFolder: string,
  binary: string,
  cookies: string,
  jsRuntimes: string,
  ffmpegBinary: string,
): Promise<string | null> => {
  const audioId = randomUUID();
  const audioFile = `${outputFolder}/${audioId}.m4a`;

  const baseBinaryArgs = [
    '--no-playlist',
    '--js-runtimes',
    `node:${jsRuntimes}`,
  ];
  if (cookies) {
    baseBinaryArgs.push('--cookies', cookies);
  }

  /* ---- Strategy 1: metadata → direct HTTP download → ffmpeg ---- */
  try {
    const metaArgs = ['--dump-json', ...baseBinaryArgs, url];
    const output = await execFileAsync(binary, metaArgs);

    if (output) {
      const meta = JSON.parse(output) as Record<string, unknown>;
      const formats = (meta.formats ?? []) as Array<Record<string, unknown>>;

      // Prefer audio-only format, fall back to any format with audio
      const audioOnly = formats.find(
        (f) =>
          typeof f.url === 'string' &&
          f.acodec !== 'none' &&
          f.acodec !== undefined &&
          (f.vcodec === 'none' || f.vcodec === undefined),
      );
      const withAudio = formats.find(
        (f) =>
          typeof f.url === 'string' &&
          f.acodec !== 'none' &&
          f.acodec !== undefined,
      );
      const target = audioOnly ?? withAudio;

      if (target?.url && typeof target.url === 'string') {
        const tmpMedia = `${outputFolder}/${randomUUID()}.tmp`;
        const downloaded = await downloadUrlToFile(target.url, tmpMedia);

        if (downloaded && existsSync(tmpMedia)) {
          if (audioOnly) {
            // Already audio-only — extract/convert to m4a with ffmpeg
            try {
              await execFileAsync(ffmpegBinary, [
                '-y',
                '-i',
                tmpMedia,
                '-vn',
                '-acodec',
                'aac',
                '-b:a',
                '192k',
                audioFile,
              ]);
              rmSync(tmpMedia, { force: true });
              if (existsSync(audioFile)) return audioFile;
            } catch {
              rmSync(tmpMedia, { force: true });
            }
          } else {
            // Combined stream — strip video, keep audio
            try {
              await execFileAsync(ffmpegBinary, [
                '-y',
                '-i',
                tmpMedia,
                '-vn',
                '-acodec',
                'aac',
                '-b:a',
                '192k',
                audioFile,
              ]);
              rmSync(tmpMedia, { force: true });
              if (existsSync(audioFile)) return audioFile;
            } catch {
              rmSync(tmpMedia, { force: true });
            }
          }
        } else {
          try {
            rmSync(tmpMedia, { force: true });
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    // dump-json or download failed — continue to next strategy
  }

  /* ---- Strategy 2: yt-dlp download best → extract audio with ffmpeg ---- */
  try {
    const tmpVideo = `${outputFolder}/${randomUUID()}.mp4`;
    const dlArgs: string[] = [
      url,
      '-f',
      'best',
      ...baseBinaryArgs,
      '-o',
      tmpVideo,
      '--quiet',
    ];

    await execFileAsync(binary, dlArgs);

    if (existsSync(tmpVideo)) {
      try {
        await execFileAsync(ffmpegBinary, [
          '-y',
          '-i',
          tmpVideo,
          '-vn',
          '-acodec',
          'aac',
          '-b:a',
          '192k',
          audioFile,
        ]);
        rmSync(tmpVideo, { force: true });
        if (existsSync(audioFile)) return audioFile;
      } catch {
        rmSync(tmpVideo, { force: true });
      }
    }
  } catch {
    // yt-dlp download failed — continue to next strategy
  }

  /* ---- Strategy 3: classic yt-dlp audio extraction (last resort) ---- */
  try {
    const args: string[] = [
      url,
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      'm4a',
      ...baseBinaryArgs,
      '-o',
      audioFile,
      '--quiet',
    ];

    await execFileAsync(binary, args);

    if (existsSync(audioFile)) {
      return audioFile;
    }
  } catch {
    // All strategies exhausted
  }

  // Clean up on total failure
  try {
    rmSync(audioFile, { force: true });
  } catch {
    /* ignore */
  }
  return null;
};

/**
 * Full fallback pipeline for Instagram image posts.
 *
 * 1. Check that gallery-dl and ffmpeg are available.
 * 2. Download the image via gallery-dl.
 * 3. Attempt to extract audio from the post via yt-dlp.
 * 4. Compose a video (image + audio) using ffmpeg.
 * 5. Clean up temporary files.
 *
 * @returns A partial {@link DownloadVideoResult} on success, or `null`
 *          when the fallback cannot produce a result.
 */
const instagramImageFallback = async (
  url: string,
  outputPath: string,
  outputFolder: string,
  cookies: string,
  binary: string,
  ffmpegBinary: string,
  jsRuntimes: string,
): Promise<
  { file: string; thumbnail?: string } | DownloadVideoError | null
> => {
  /* ---- Check gallery-dl availability ---- */
  const galleryDlExists = await isBinaryAvailable(
    DEFAULT_GALLERY_DL,
    '--version',
  );
  if (!galleryDlExists) {
    return {
      code: 'GALLERY_DL_NOT_FOUND',
      message:
        'gallery-dl binary was not found. It is required to download ' +
        'Instagram image posts. ' +
        'Install it via: pip install gallery-dl, ' +
        'pipx install gallery-dl, ' +
        'or see https://github.com/mikf/gallery-dl#installation',
    };
  }

  /* ---- Check ffmpeg availability ---- */
  const ffmpegExists = await isBinaryAvailable(ffmpegBinary, '-version');
  if (!ffmpegExists) {
    return {
      code: 'FFMPEG_NOT_FOUND',
      message:
        'ffmpeg binary was not found. It is required to create a video ' +
        'from Instagram image posts. ' +
        'Install it via: brew install ffmpeg (macOS), ' +
        'sudo apt install ffmpeg (Debian/Ubuntu), ' +
        'or download from https://ffmpeg.org/download.html',
    };
  }

  let galleryResult: { images: string[]; media: string[] };
  let tmpCleanup: string[] = [];

  try {
    galleryResult = await galleryDlDownload(url, outputFolder, cookies);
  } catch {
    return null; // gallery-dl failed — cannot recover
  }

  if (galleryResult.images.length === 0) {
    // No images found — clean up and signal failure
    for (const f of [...galleryResult.media]) {
      try {
        rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  const imagePath = galleryResult.images[0]!;
  tmpCleanup = [...galleryResult.images, ...galleryResult.media];

  /* ---- Save the image as the thumbnail ---- */
  let thumbnail: string | undefined;
  let imageForVideo: string = imagePath;
  try {
    const thumbExt = imagePath.split('.').pop()?.toLowerCase() ?? 'jpg';
    const thumbName = `${randomUUID()}.${thumbExt}`;
    const thumbDest = `${outputFolder}/${thumbName}`;
    renameSync(imagePath, thumbDest);
    // Update tmpCleanup — the original path no longer exists
    tmpCleanup = tmpCleanup.filter((f) => f !== imagePath);
    thumbnail = thumbName;
    // Use the moved image for video creation
    imageForVideo = thumbDest;
  } catch {
    // If rename fails, use the original path (already set above)
  }

  /* ---- Try to get audio ---- */
  // First check if gallery-dl downloaded any media (audio/video)
  let audioPath: string | null = galleryResult.media[0] ?? null;

  // If no media from gallery-dl, try yt-dlp audio extraction
  if (!audioPath) {
    audioPath = await extractInstagramAudio(
      url,
      outputFolder,
      binary,
      cookies,
      jsRuntimes,
      ffmpegBinary,
    );
    if (audioPath) {
      tmpCleanup.push(audioPath);
    }
  }

  /* ---- Create video from image + audio ---- */
  try {
    await createVideoFromImage(
      imageForVideo,
      audioPath,
      outputPath,
      ffmpegBinary,
    );
  } catch {
    // Clean up on failure
    for (const f of tmpCleanup) {
      try {
        rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /* ---- Clean up temporary files (keep thumbnail & output) ---- */
  for (const f of tmpCleanup) {
    // Don't delete the thumbnail or image used for video
    if (f === imageForVideo) continue;
    try {
      rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }

  // Clean up gallery-dl temp directories
  try {
    const galleryDirs = readdirSync(outputFolder).filter((d) =>
      d.startsWith('_gallery_dl_'),
    );
    for (const dir of galleryDirs) {
      removeFolder(`${outputFolder}/${dir}`);
    }
  } catch {
    /* ignore */
  }

  const result: { file: string; thumbnail?: string } = {
    file: outputPath.split('/').pop()!,
  };
  if (thumbnail) {
    result.thumbnail = thumbnail;
  }

  return result;
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
  audioFormat,
  jsRuntimes = DEFAULT_JS_RUNTIMES,
  checkCodec = false,
}: DownloadVideoOptions): Promise<DownloadVideoResult> => {
  const binary = DEFAULT_BINARY;
  const ffmpegBinary = DEFAULT_FFMPEG;
  const audioFmt: AudioOutputFormat = audioFormat ?? 'flac';

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
            'ffmpeg binary was not found. It is required for audio extraction ' +
            'and metadata embedding. ' +
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
  const fileExt = justAudio ? audioFmt : 'mp4';
  const fileName = `${fileId}.${fileExt}`;
  const outputPath = `${outputFolder}/${fileName}`;

  /* ---- 4. Fetch metadata (if requested, or needed for name/captions) ---- */

  let videoMetadata: VideoMetadata | undefined;

  // We always fetch metadata now because --dump-json also returns the
  // `formats` array, which we reuse for format selection (step 4b).
  // For audio downloads, metadata is essential so that artist, album,
  // cover art, etc. can be embedded into the output file by yt-dlp's
  // post-processors.
  try {
    videoMetadata = await fetchMetadata(url, binary, cookies, jsRuntimes);
  } catch (error) {
    if (requestMetadata || justAudio) {
      return {
        error: {
          code: 'METADATA_FAILED',
          message: `Failed to retrieve video metadata: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
    // Metadata failed but wasn't strictly required — continue anyway.
  }

  /* ---- 4b. Detect available formats & select best streams ---- */

  let formatSelection: FormatSelection | undefined;

  try {
    const formats = await fetchAvailableFormats(
      url,
      binary,
      cookies,
      jsRuntimes,
      videoMetadata,
    );

    if (formats.length > 0) {
      formatSelection =
        isTiktok(url) && !justAudio
          ? selectBestTikTokFormat(formats)
          : selectBestFormats(formats);
    }
  } catch {
    // Format detection is best-effort. When it fails we fall back to
    // yt-dlp's built-in format selection in the download step.
  }

  /* ---- 5. Download the video (or audio only) ---- */

  const args = justAudio
    ? buildAudioDownloadArgs(
        url,
        outputPath,
        cookies,
        jsRuntimes,
        audioFmt,
        formatSelection,
      )
    : buildDownloadArgs(url, outputPath, cookies, jsRuntimes, formatSelection);

  let ytDlpFailed = false;

  try {
    await execFileAsync(binary, args);
  } catch (error) {
    // If download failed with format selection, retry without it
    // (let yt-dlp pick the best format on its own).
    if (formatSelection) {
      try {
        const fallbackArgs = justAudio
          ? buildAudioDownloadArgs(
              url,
              outputPath,
              cookies,
              jsRuntimes,
              audioFmt,
            )
          : buildDownloadArgs(url, outputPath, cookies, jsRuntimes);
        await execFileAsync(binary, fallbackArgs);
      } catch (fallbackError) {
        ytDlpFailed = true;

        // For Instagram links, try gallery-dl fallback for image posts
        if (isInstagram(url) && !justAudio) {
          const igFallback = await instagramImageFallback(
            url,
            outputPath,
            outputFolder,
            cookies,
            binary,
            ffmpegBinary,
            jsRuntimes,
          );

          if (igFallback && 'file' in igFallback) {
            // Fallback succeeded — continue to step 6 with the result
            // (thumbnail is handled inside instagramImageFallback)
          } else if (igFallback && 'code' in igFallback) {
            return { error: igFallback };
          } else {
            return {
              error: {
                code: 'DOWNLOAD_FAILED',
                message: `yt-dlp download failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
              },
            };
          }
        } else {
          return {
            error: {
              code: 'DOWNLOAD_FAILED',
              message: `yt-dlp download failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
            },
          };
        }
      }
    } else {
      ytDlpFailed = true;

      // For Instagram links, try gallery-dl fallback for image posts
      if (isInstagram(url) && !justAudio) {
        const igFallback = await instagramImageFallback(
          url,
          outputPath,
          outputFolder,
          cookies,
          binary,
          ffmpegBinary,
          jsRuntimes,
        );

        if (igFallback && 'file' in igFallback) {
          // Fallback succeeded — continue to step 6
        } else if (igFallback && 'code' in igFallback) {
          return { error: igFallback };
        } else {
          return {
            error: {
              code: 'DOWNLOAD_FAILED',
              message: `yt-dlp download failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          };
        }
      } else {
        return {
          error: {
            code: 'DOWNLOAD_FAILED',
            message: `yt-dlp download failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    }
  }

  /* ---- 5c. Instagram image fallback: verify output exists ---- */

  // When yt-dlp succeeded for Instagram but produced no file (rare edge
  // case where it exits 0 but writes nothing), also try the fallback.
  if (
    !ytDlpFailed &&
    isInstagram(url) &&
    !justAudio &&
    !existsSync(outputPath)
  ) {
    const igFallback = await instagramImageFallback(
      url,
      outputPath,
      outputFolder,
      cookies,
      binary,
      ffmpegBinary,
      jsRuntimes,
    );

    if (igFallback && 'code' in igFallback) {
      return { error: igFallback };
    }
    if (!igFallback) {
      return {
        error: {
          code: 'DOWNLOAD_FAILED',
          message: 'yt-dlp produced no output and gallery-dl fallback failed.',
        },
      };
    }
  }

  /* ---- 5b. Repair TikTok H.265 videos with missing audio ---- */

  if (isTiktok(url) && !justAudio) {
    try {
      await repairTikTokH265Audio(
        outputPath,
        fileName,
        url,
        outputFolder,
        cookies,
        jsRuntimes,
        ffmpegBinary,
      );
    } catch {
      // Repair is best-effort; continue with the original download.
    }
  }

  /* ---- 6. Extract video title ---- */

  let videoName: string | undefined;

  if (videoMetadata) {
    videoName = videoMetadata.fulltitle || videoMetadata.title;
  } else {
    // Fetch title separately when metadata wasn't requested
    try {
      const titleMeta = await fetchMetadata(url, binary, cookies, jsRuntimes);
      videoName = titleMeta.fulltitle || titleMeta.title;
    } catch {
      // Title is best-effort; proceed without it.
    }
  }

  /* ---- 7. Build result ---- */

  const result: DownloadVideoResult = {
    file: fileName,
    ...(videoName && { name: videoName }),
    ...(formatSelection && { formatSelection }),
  };

  /* ---- 7b. Attach audio metadata ---- */

  if (justAudio && videoMetadata) {
    try {
      result.audioMetadata = extractAudioMetadata(
        videoMetadata as VideoMetadata & Record<string, unknown>,
      );
    } catch {
      // Audio metadata extraction is best-effort.
    }
  }

  /* ---- 7c. Download thumbnail / cover-art image to output folder ---- */

  {
    const thumbUrl = justAudio
      ? (result.audioMetadata?.coverUrl ?? videoMetadata?.thumbnail)
      : (videoMetadata?.thumbnail ??
        bestThumbnailUrl(
          (videoMetadata ?? {}) as VideoMetadata & Record<string, unknown>,
        ));

    if (thumbUrl) {
      try {
        const thumbFile = await downloadThumbnailFile(thumbUrl, outputFolder);
        if (thumbFile) {
          result.thumbnail = thumbFile;
        }
      } catch {
        // Thumbnail download is best-effort.
      }
    }
  }

  /* ---- 8. Attach metadata ---- */

  if (requestMetadata && videoMetadata) {
    result.metadata = videoMetadata;
  }

  /* ---- 8b. Check H.265 codec ---- */

  if (checkCodec) {
    try {
      result.isH265 = await isH265Codec(
        `${outputFolder}/${fileName}`,
        ffmpegBinary,
      );
    } catch {
      // Codec check is best-effort; swallow the error.
    }
  }

  /* ---- 9. Fetch SRT subtitles ---- */

  if (requestSrt) {
    try {
      const srtContent = await fetchSrt(
        url,
        binary,
        cookies,
        jsRuntimes,
        outputFolder,
      );
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
