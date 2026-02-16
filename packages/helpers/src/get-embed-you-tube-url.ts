/** Matches common YouTube URL formats and captures the 11-character video ID. */
const YOUTUBE_VIDEO_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/;

/**
 * Converts a YouTube URL into its embed-friendly form.
 *
 * Supports short links (`youtu.be/ID`), standard watch pages
 * (`youtube.com/watch?v=ID`), and existing embed URLs
 * (`youtube.com/embed/ID`). Query parameters are stripped from the output.
 *
 * @example
 * ```ts
 * getEmbedYouTubeUrl('https://youtu.be/tgbNymZ7vqY?si=abc');
 * // → 'https://www.youtube.com/embed/tgbNymZ7vqY'
 *
 * getEmbedYouTubeUrl('https://www.youtube.com/watch?v=tgbNymZ7vqY&list=PL123');
 * // → 'https://www.youtube.com/embed/tgbNymZ7vqY'
 * ```
 *
 * @param url - A YouTube URL in any common format.
 * @returns The embed URL, or an empty string if a video ID cannot be extracted.
 */
const getEmbedYouTubeUrl = (url: string): string => {
  const videoId = url.match(YOUTUBE_VIDEO_ID_RE)?.[1];
  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
};

export default getEmbedYouTubeUrl;
