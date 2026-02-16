import { exec } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import getRandomNumber from '@repo/helpers/random-number';
import { isTiktok, isYoutube } from '@repo/helpers/checkers';
import generateSrt from '@repo/helpers/generate-srt';
import srtToText from '@repo/helpers/srt-to-text';
import copyFile from '@repo/helpers/copy-file';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';
const IS_PRODUCTION = NODE_ENV === 'production';

/** Maximum buffer size for shell command output (2 MB). */
const EXEC_MAX_BUFFER = 1024 * 2048;

/** Default binary path for yt-dlp based on the current environment. */
const DEFAULT_BINARY = IS_PRODUCTION ? 'yt-dlp' : './yt-dlp';

/** Default cookies file path based on the current environment. */
const DEFAULT_COOKIES = IS_PRODUCTION
  ? '/app/netscape-cookies.txt'
  : './netscape-cookies.txt';

/** Default output folder based on the current environment. */
const DEFAULT_OUTPUT_FOLDER = IS_PRODUCTION ? '/app/media' : 'public/media';

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
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A single caption/subtitle entry from the yt-dlp JSON payload. */
interface CaptionEntry {
  ext: 'json3' | 'srt';
  url: string;
}

/** Relevant fields from the yt-dlp `--dump-json` output. */
interface VideoMetadata {
  id: string;
  title: string;
  fulltitle: string;
  thumbnail: string;
  automatic_captions: Record<string, CaptionEntry[]>;
  subtitles: Record<string, CaptionEntry[]>;
  language: string;
}

/** Options for {@link downloadSubtitles}. */
export interface DownloadSubtitlesOptions {
  /** URL of the video to download subtitles from. */
  url: string;
  /** Relative destination path for the resulting SRT file. */
  dest: string;
  /** Optional local media path used as a fallback for SRT generation. */
  localLink?: string;
  /** Directory where media files are stored. */
  outputFolder?: string;
  /** Language of the video (used as fallback for SRT generation). */
  videoLanguage?: string;
  /** If set, fetches automatic captions for this language directly from the metadata. */
  requestedCaptionsLanguage?: string;
  /** If set, fetches manual subtitles for this language directly from the metadata. */
  requestedSubtitlesLanguage?: string;
  /** Path or name of the yt-dlp binary. */
  binary?: string;
  /** Path to a Netscape-format cookies file for authenticated downloads. */
  cookies?: string;
}

/** Result returned by {@link downloadSubtitles}. */
export interface DownloadSubtitlesResult {
  /** Raw SRT content. */
  subtitles: string;
  /** Plain text extracted from the SRT (timestamps and metadata stripped). */
  cleanSubtitles: string;
  /** Relative media path to the SRT file (e.g. `media/video.srt`). */
  srtFile: string;
  /** Video title, if available. */
  name?: string;
  /** Detected video language code. */
  language?: string;
  /** Video thumbnail URL, if available. */
  thumbnail?: string;
}

/* ------------------------------------------------------------------ */
/*  Shell helpers                                                     */
/* ------------------------------------------------------------------ */

/** Promisified wrapper around `child_process.exec`. */
const execAsync = (command: string): Promise<string> =>
  new Promise((resolve, reject) => {
    exec(command, { maxBuffer: EXEC_MAX_BUFFER }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout);
    });
  });

/* ------------------------------------------------------------------ */
/*  Filesystem helpers                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Video metadata                                                    */
/* ------------------------------------------------------------------ */

/** Fetches video metadata using `yt-dlp --dump-json`. */
const fetchVideoMetadata = async (
  url: string,
  binary: string,
): Promise<VideoMetadata> => {
  const output = await execAsync(
    `${binary} --dump-json "${url}" | jq --raw-output`,
  );
  if (!output) throw new Error('yt-dlp returned empty metadata');
  return JSON.parse(output) as VideoMetadata;
};

/* ------------------------------------------------------------------ */
/*  Caption download (direct URL from metadata)                       */
/* ------------------------------------------------------------------ */

/**
 * Downloads a specific caption file from its direct URL using `wget`.
 *
 * @returns The raw SRT content of the downloaded file.
 */
const downloadCaptionByUrl = async (
  captionUrl: string,
  destFile: string,
  cookies: string,
): Promise<string> => {
  await execAsync(
    `wget -c "${captionUrl}" -O "${destFile}" --load-cookies="${cookies}"`,
  );
  return readFileSync(destFile, 'utf8');
};

/**
 * Attempts to find and download a specific caption track from the metadata.
 *
 * Checks `automatic_captions` first (if `requestedCaptionsLanguage` is set),
 * then falls back to `subtitles` (if `requestedSubtitlesLanguage` is set).
 *
 * @returns The SRT content, or `null` if no matching caption was found.
 */
const tryDownloadRequestedCaption = async (
  metadata: VideoMetadata,
  destFile: string,
  cookies: string,
  requestedCaptionsLanguage: string,
  requestedSubtitlesLanguage: string,
): Promise<string | null> => {
  if (!requestedCaptionsLanguage && !requestedSubtitlesLanguage) return null;

  let caption: CaptionEntry | undefined;

  if (requestedCaptionsLanguage) {
    caption = metadata.automatic_captions[requestedCaptionsLanguage]?.find(
      (entry) => entry.ext === 'srt',
    );
  } else if (requestedSubtitlesLanguage) {
    caption = metadata.subtitles[requestedSubtitlesLanguage]?.find(
      (entry) => entry.ext === 'srt',
    );
  }

  if (!caption?.url) {
    throw new Error('No captions available for the selected language');
  }

  return downloadCaptionByUrl(caption.url, destFile, cookies);
};

/* ------------------------------------------------------------------ */
/*  yt-dlp subtitle download (file-based)                             */
/* ------------------------------------------------------------------ */

/** Builds the yt-dlp command for downloading subtitle files. */
const buildYtDlpSubtitleCommand = (
  url: string,
  binary: string,
  language: string,
  outputPath: string,
  cookies: string,
): string => {
  const parts = [
    binary,
    '--skip-download',
    '--write-automatic-subs',
    '--write-subs',
  ];

  if (isTiktok(url)) {
    parts.push('--sub-langs "all"');
  } else if (isYoutube(url)) {
    parts.push(`--sub-langs "${language}"`);
  }

  parts.push('--convert-subs=srt');

  if (cookies) {
    parts.push(`--cookies ${cookies}`);
  }

  parts.push(`"${url}" -o "${outputPath}/"`);

  return parts.join(' ');
};

/**
 * Selects the best SRT file from a folder of downloaded subtitle files.
 *
 * When multiple files are present, the file whose lowercased name starts
 * with a known language prefix is preferred. When only one file exists,
 * it is selected automatically.
 *
 * @returns The relative path to the selected file within the folder, or `null`.
 */
const selectBestSrtFile = (
  files: string[],
  folderName: string,
): string | null => {
  if (files.length === 0) return null;

  if (files.length === 1) {
    return `${folderName}/${files[0]}`;
  }

  const preferred = files.find((file) => {
    const lower = file.toLowerCase();
    return PREFERRED_LANG_PREFIXES.some((prefix) => lower.startsWith(prefix));
  });

  return preferred ? `${folderName}/${preferred}` : null;
};

/**
 * Extracts the base language code from a locale string.
 *
 * E.g. `"en-US"` → `"en"`, `"es"` → `"es"`.
 */
const extractBaseLanguage = (language: string): string => {
  const dashIndex = language.indexOf('-');
  return dashIndex !== -1 ? language.substring(0, dashIndex) : language;
};

/* ------------------------------------------------------------------ */
/*  Main function                                                     */
/* ------------------------------------------------------------------ */

/**
 * Downloads subtitles for a video URL using yt-dlp.
 *
 * The function follows this strategy:
 * 1. Fetch video metadata via `yt-dlp --dump-json`.
 * 2. If a specific caption/subtitle language was requested, download it
 *    directly from the metadata URL.
 * 3. Otherwise, run yt-dlp to download subtitle files, then pick the
 *    best match from the output folder.
 * 4. If no subtitles are found and a `localLink` is provided, fall back
 *    to server-side SRT generation via {@link generateSrt}.
 */
const downloadSubtitles = async ({
  url,
  dest,
  localLink,
  outputFolder = DEFAULT_OUTPUT_FOLDER,
  videoLanguage,
  requestedCaptionsLanguage = '',
  requestedSubtitlesLanguage = '',
  binary = DEFAULT_BINARY,
  cookies = DEFAULT_COOKIES,
}: DownloadSubtitlesOptions): Promise<DownloadSubtitlesResult> => {
  const cleanDest = dest.replaceAll('media/', '');
  const destFile = `${outputFolder}/${cleanDest}`;

  /* Step 1: Fetch video metadata */
  const metadata = await fetchVideoMetadata(url, binary);
  const name = metadata.fulltitle ?? metadata.title ?? '';
  const thumbnail = metadata.thumbnail ?? '';
  let language = metadata.language ?? '';

  /* Step 2: Try to download a specifically-requested caption */
  const requestedSubtitles = await tryDownloadRequestedCaption(
    metadata,
    destFile,
    cookies,
    requestedCaptionsLanguage,
    requestedSubtitlesLanguage,
  );

  if (requestedSubtitles) {
    const cleanSubtitles = srtToText(requestedSubtitles);
    writeFileSync(destFile, requestedSubtitles, 'utf-8');
    return {
      ...(name && { name }),
      srtFile: `media/${cleanDest}`,
      subtitles: requestedSubtitles,
      cleanSubtitles,
      ...(language && { language }),
      ...(thumbnail && { thumbnail }),
    };
  }

  /* Step 3: Download subtitles via yt-dlp into a temporary folder */
  language = extractBaseLanguage(language);

  const folderName = getRandomNumber(1, 1999).toString();
  const folderPath = `${outputFolder}/${folderName}`;
  ensureFolder(folderPath);

  let subtitles = '';
  let filesInFolder: string[];

  try {
    const command = buildYtDlpSubtitleCommand(
      url,
      binary,
      language,
      folderPath,
      cookies,
    );

    await execAsync(command);
    filesInFolder = readdirSync(folderPath);
  } catch (error) {
    removeFolder(folderPath);
    throw error;
  }

  const selectedSrt = selectBestSrtFile(filesInFolder, folderName);

  if (selectedSrt) {
    subtitles = readFileSync(`${outputFolder}/${selectedSrt}`, 'utf8');
  }

  /* Step 4a: Subtitles found — copy to destination and clean up */
  if (subtitles) {
    const cleanSubtitles = srtToText(subtitles);
    await copyFile({ src: selectedSrt!, dest: cleanDest });
    removeFolder(folderPath);

    return {
      name,
      srtFile: `media/${cleanDest}`,
      subtitles,
      cleanSubtitles,
      language,
      thumbnail,
    };
  }

  /* Step 4b: No subtitles — try generating from local media file */
  removeFolder(folderPath);

  if (localLink) {
    const generated = await generateSrt({
      src: localLink,
      dest: cleanDest,
      language: videoLanguage ?? 'en',
      maxWordsPerLine: 3,
    });

    const cleanSubtitles = srtToText(generated.srt);

    return {
      name,
      srtFile: generated.file,
      subtitles: generated.srt,
      cleanSubtitles,
      language,
      thumbnail,
    };
  }

  throw new Error(`No subtitles found and no local link provided for "${url}"`);
};

export default downloadSubtitles;
