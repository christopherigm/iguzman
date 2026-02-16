/**
 * Extracts plain text from an SRT or WebVTT subtitle string.
 *
 * Strips metadata headers, timestamps, sequence numbers, and inline tags,
 * then removes consecutive duplicate lines (common in rolling WebVTT captions).
 *
 * @param srt - The raw SRT or WebVTT subtitle content
 * @returns The extracted text with one subtitle per line
 */
const srtToText = (srt: string): string => {
  const lines = srt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  /** Returns `true` for non-text lines: metadata, timestamps, and sequence numbers. */
  const isMetadataLine = (line: string): boolean =>
    /^\d+$/.test(line) ||
    line.includes('-->') ||
    line.includes('WEBVTT') ||
    line.startsWith('Kind:') ||
    line.startsWith('Language:') ||
    line.includes('</c>');

  const textLines = lines.filter((line) => !isMetadataLine(line));

  /** Remove consecutive duplicate lines (common in rolling WebVTT captions). */
  const deduped = textLines.filter(
    (line, index) => index === 0 || line !== textLines[index - 1],
  );

  return deduped.join('\n');
};

export default srtToText;
