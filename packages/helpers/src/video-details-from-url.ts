import { exec } from 'child_process';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Maximum buffer size for command execution (2 MB). */
const MAX_BUFFER = 1024 * 2048;

/** Current Node environment. */
const NODE_ENV = process.env.NODE_ENV?.trim() ?? 'localhost';

/** Default yt-dlp binary path based on environment. */
const DEFAULT_YT_DLP_BINARY = NODE_ENV === 'production' ? 'yt-dlp' : './yt-dlp';

/** Default cookies file path based on environment. */
const DEFAULT_COOKIES_FILE =
  NODE_ENV === 'production'
    ? '/app/netscape-cookies.txt'
    : './netscape-cookies.txt';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Represents a caption file object. */
export type CaptionObject = {
  ext: 'json3' | 'srt';
  url: string;
};

/** Represents YouTube video payload data. */
export type YouTubePayload = {
  id: string;
  title: string;
  thumbnail: string;
  automatic_captions: {
    [key: string]: Array<CaptionObject>;
  };
  subtitles: {
    [key: string]: Array<CaptionObject>;
  };
  channel?: string;
  uploader?: string;
  artist?: string;
};

/** Options for fetching video details. */
export type VideoDetailsOptions = {
  /** The URL of the video to fetch details for. */
  readonly url: string;
  /** Path to the yt-dlp binary (optional). */
  readonly linuxBinary?: string;
  /** Path to cookies file (optional). */
  readonly cookies?: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Builds the yt-dlp command with optional cookies.
 *
 * @param url - The video URL to fetch details for.
 * @param binary - Path to the yt-dlp binary.
 * @param cookies - Path to cookies file.
 * @returns The constructed command string.
 */
const buildCommand = (
  url: string,
  binary: string,
  cookies?: string,
): string => {
  let command = binary;
  if (cookies) {
    command += ` --cookies ${cookies}`;
  }
  command += ` --dump-json "${url}" | jq --raw-output`;
  return command;
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetches detailed information about a YouTube video using yt-dlp.
 *
 * This function executes yt-dlp to retrieve metadata about a YouTube video,
 * including title, thumbnail, captions, and other relevant information.
 *
 * @param options - Configuration options for fetching video details.
 * @returns A promise that resolves to the YouTube video payload data.
 * @throws If the command execution fails or returns invalid data.
 *
 * @example
 * ```ts
 * const videoData = await fetchVideoDetails({
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 * });
 * console.log(videoData.title); // "Rick Astley - Never Gonna Give You Up"
 * ```
 */
const fetchVideoDetails = ({
  url,
  linuxBinary = DEFAULT_YT_DLP_BINARY,
  cookies = DEFAULT_COOKIES_FILE,
}: VideoDetailsOptions): Promise<YouTubePayload> => {
  return new Promise((resolve, reject) => {
    const command = buildCommand(url, linuxBinary, cookies);

    exec(command, { maxBuffer: MAX_BUFFER }, (error, data: string) => {
      if (error) {
        console.error('Error executing yt-dlp command:', error);
        return reject(new Error(`yt-dlp execution failed: ${error.message}`));
      }

      if (!data) {
        console.error('No data returned from yt-dlp command');
        return reject(new Error('No data returned from yt-dlp'));
      }

      try {
        const youtubeData: YouTubePayload = JSON.parse(data);
        resolve(youtubeData);
      } catch (parseError) {
        console.error('Error parsing JSON from yt-dlp:', parseError);
        reject(new Error(`Failed to parse yt-dlp output: ${parseError}`));
      }
    });
  });
};

export default fetchVideoDetails;
