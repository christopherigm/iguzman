/**
 * Extracts the first HTTP/HTTPS URL found in a string.
 *
 * Useful for pulling a clean URL out of text that may contain surrounding
 * whitespace, prose, or full-width punctuation (e.g. the Chinese comma `，`).
 * Returns the original string unchanged when no URL is detected.
 *
 * @param text - The raw string that may contain a URL
 * @returns The extracted URL, or the original string if no URL is found
 */
export const extractUrl = (text: string): string => {
  const match = text.match(/https?:\/\/[^\s]+/);
  if (!match) return text;

  /** Strip trailing full-width comma (U+FF0C) and anything after it. */
  const url = match[0].split('，')[0];
  return url ?? '';
};

/**
 * Checks whether a string looks like a well-formed HTTP(S) URL.
 *
 * Returns `false` if the string contains spaces or does not start with
 * `http://` or `https://`.
 *
 * @param url - The string to validate
 */
export const isCleanUrl = (url: string): boolean =>
  !url.includes(' ') && url.startsWith('http');
